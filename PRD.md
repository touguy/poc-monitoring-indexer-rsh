# PRD.md — PoC Monitoring Indexer (RSH)

## 1. 프로젝트 개요
NestJS와 PostgreSQL을 사용하여 이더리움(Sepolia/Mainnet 호환) 네트워크의 Chain Reorg(체인 재조직)를 실시간으로 감지하고, 상태를 추적하며, Reorg 발생 시 DB 기록 및 알림(로그)을 수행하는 백엔드 애플리케이션입니다. 

> **주의 사항**: 본 마스터 PRD 문서는 핵심 아키텍처 및 로직을 포괄하며, 구체적인 DB 스키마와 API 스펙은 부속 문서를 참조해야 합니다.
> - 📄 **[DB_SCHEMA.md (데이터베이스 스키마 스펙)](.agent/docs/DB_SCHEMA.md)**
> - 📄 **[API_SPEC.md (REST API 명세서)](.agent/docs/API_SPEC.md)**
> - 📄 **[CODING_CONVENTION.md (코딩 스타일 가이드 및 컨벤션)](.agent/docs/CODING_CONVENTION.md)**

---

## 2. 기술 스택
| 구분 | 기술 / 라이브러리 |
|--------|------|
| **Framework** | NestJS 11 |
| **Language** | TypeScript 5.7 (ES2023, module nodenext) |
| **DB & ORM** | PostgreSQL (`pg`) + TypeORM 0.3 |
| **Blockchain** | ethers.js 6 (WebSocket 및 순수 RPC 읽기 용도) |
| **Scheduling** | `@nestjs/schedule` (Cron Job 상태 폴링 검증 용도) |
| **Validation** | `class-validator` + `class-transformer` |
| **Logging** | `nest-winston` + `winston` + `winston-daily-rotate-file` |
| **Environment** | `@nestjs/config` (`ConfigService`) + `dotenv-cli` |

---

## 3. 애플리케이션 아키텍처 및 폴더 구조 전략 (`src/`)

본 시스템은 도메인 관심사 단위로 모듈(`Module`)이 완전히 분리된 구조를 강제합니다.

- **`src/app.module.ts`**: 애플리케이션의 루트 모듈로서 DB 연결, 전역 `Config`, `Winston`, `ScheduleModule`을 마운트하고 각 도메인을 등록합니다.
- **`src/blockchain/`**: 블록체인 노드와의 통신(RPC, WebSocket) 역할만을 전담하며, 비즈니스 로직이 침투할 수 없는 통신 전용 유틸리티 성격입니다.
- **`src/block/`**: 블록에 대한 초기 네트워크 동기화, HTTP 및 WS를 이용한 단일 블록 수집, Cron 폴링 검증, `BlockRecord` DB 저장을 총괄하는 데이터 수집/검증 도메인입니다.
- **`src/reorg/`**: 재조직 발생 시 그 이력을 로그 형태로 남기고 관리(`ReorgLog`)하는 알림 도메인입니다.
- **`src/common/`**: 프로젝트 전체(`BaseEntity`, 전역 예외필터, 응답 인터셉터 등)에서 공통으로 재사용하는 헬퍼 집합입니다.

---

## 4. 아키텍처 레이어 핵심 5원칙 (계층 기반)

1. **Controller Layer**: 오직 HTTP 라우팅 매핑 및 응답 직렬화 역할로 제한됩니다. **절대 비즈니스 로직이 포함될 수 없습니다.**
2. **Service Layer**: 모든 핵심 비즈니스 로직과 트랜잭션의 진입점이 됩니다. 각 도메인 내 단일 책임 원칙(SRP)을 따릅니다.
3. **Repository Layer**: TypeORM의 `Repository<T>`를 직접 Service 안에서 `inject`해 쓰지 않으며, 커스텀 Repository 클래스를 만들어 DB 쿼리 관심사를 격리시킵니다.
4. **Entity Layer**: DB 스키마와 1:1 매핑되는 프로퍼티 묶음입니다. 비즈니스 로직용 함수를 Entity 내에 삽입하는 것을 엄격히 금지합니다. 모든 테이블 스펙은 무조건 `BaseEntity` 속성을 상속해야 합니다.
5. **DTO Layer**: 외부 입출력 데이터 규격 명세이며, 필히 `class-validator`를 이용한 런타임 제약조건을 가지게 작성합니다. `ValidationPipe`로 자동 검증됩니다.

---

## 5. 공통 컴포넌트 및 코드 작성 정책

- **주석 및 설명 의무화 정책 (AI 통합 코딩 룰)**: 
  - 코드가 신규 추가되거나 수정될 경우, **반드시 모든 함수(Function)와 중요 로직 상단에 한글로 동작 과정과 목적을 설명하는 주석(JSDoc 및 인라인 주석)**을 달아야 하며, 상세한 한글 주석 스타일(예: 핵심 비즈니스 로직, 처리 순서 1~5 명시 등)을 작성하십시오.
- **의존성 주입 (Dependency Injection)**: 
  - 모든 클래스는 `@Injectable()` 되며 생성자 주입을 필수로 합니다. (소스상에서 직접 `new 클래스()`하여 인스턴스를 무위로 생성하는 것을 금지합니다.)
- **전역 로깅 (Logging Policy)**: 
  - 내장 로거 대신 `nest-winston` 모듈을 전역 적용합니다. (`main.ts` 에서 `bufferLogs: true` 지시자 사용)
  - 로거 외 일반 `console.log()`는 어떤 이유에서건 사용해서는 안 됩니다.
  - 전역 스코프에 환경변수 `APP_NAME`을 태깅하여 포맷팅 시각화를 구성합니다.
- **예외 처리 전략 (Exception Mapping)**: 
  - `BusinessException(ErrorCode)` 인터페이스를 통해 자체 정의된 비즈니스 오류를 던지도록 시스템화합니다. 
  - 전역 등록된 `GlobalExceptionsFilter`가 해당 예외를 잡아채 모두 통일된 **`ResultResDto.error()`** JSON 형태로 응답 체계를 자동 변환합니다. 외부로 생(Raw) 에러가 노출되지 않도록 합니다.

---

## 6. 애플리케이션 환경 변수 스펙 (`.env`)

시스템은 `ConfigService`를 기반으로 구동 시 다음 환경 변수를 동적으로 읽어 동작을 구성해야 합니다:

- `APP_NAME`: 앱 로깅 네임스페이스 명칭 설정 (예: `monitoring-indexer`)
- `PORT`: 서비스 동작 포트 번호 (미지정 시 3000)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: PostgreSQL 연결용 데이터 스펙
- `RPC_URL`: 블록체인 노드를 순회 조회할 HTTP 기반 풀노드 주소
- `WSS_URL`: 블록 실시간 스트림 이벤트를 감청할 웹소켓 분기점 주소
- `INITIAL_SYNC_BLOCK_COUNT`: (기본 100) 백엔드 기동 직후 부족한 과거 블록 격차(Gap)를 보완하기 위한 조회 상한 개수
- `POLLING_CRON_TIME`: (기본 `*/10 * * * * *`) Polling 다중 동기화 스케줄러 간격을 정하는 Cron 수식

---

## 7. 핵심 비즈니스 로직 상세 설계 (가장 중요)
*(시스템 리버스 엔지니어링의 핵심 지침이며, 이 구현 요구사항을 누락 없이 순서대로 준수해야 원래의 기능으로 100% 복구 가능합니다.)*

### A. 앱 부트스트랩 시: 초기 동기화 엔진 (Initial Sync)
- `OnModuleInit` 훅 단계에서 **비동기 백그라운드**로 실행을 개시합니다.
- 데이터베이스 내에 저장된 자신이 가진 가장 최신 블록 번호와, 이더리움 체인 상의 `latest` 최신 블록 번호의 차이(`Gap`)를 판별하여 동기화를 메웁니다:
  - **데이터베이스가 텅 빈 경우**: 네트워크의 현재 가장 큰 최신 블록을 기준으로, `INITIAL_SYNC_BLOCK_COUNT` 갯수만큼 즉시 파싱하여 삽입합니다.
  - **차이(Gap) 범위가 너무 큰 경우 (100개 이상)**: 지나치게 오래된 과거 블록 동기화는 효율상 스킵하고, 최신 N개의 데이터만을 보충합니다. (부분 보충 전략)
  - **차이(Gap) 범위가 0 초과 100 미만인 경우**: 잃어버린 누락 구간(Missing Range)만 `Start -> End` 형태로 순차 반복 스윕(Sweep)하며 즉각 보충 저장합니다.
- 💡장애 방지 기믹: RPC Rate Limit(노드 과부하 발생) 보호를 위해 루프 안에서 **매 블록 조회 후 최소 100ms 지연(`Delay`)**을 발생시키는 프로미스 프로시저를 삽입해야 합니다.

### B. 블록 감지 (Phase 1): WebSocket 기반 실시간 수신 및 1차 Reorg 판독
- 블록체인 RPC 중 이더리움 `newHeads`(block) 웹소켓 이벤트 스트리밍 기반 리스너를 구독합니다.
- **메모리 큐(Memory Queue) 적용 원칙**: 다량의 블록이 분기하며 꼬여서 동시에 수신될 때 트랜잭션 충돌(Race Condition 시 발생되는 꼬임) 방지를 위해, 이벤트를 즉각 DB에 넣지 않고 일단 빈 자바스크립트 배열 큐(`blockQueue`)에 적재시킵니다.
- **순차 처리 워커 (`processBlockQueue`)**:
   1. 배열에서 한 개의 블록만 POP시켜 단일 스레드로 통과시킵니다.
   2. 수신된 이벤트를 이용해 상세 블록 데이터를 HTTP RPC로 패치합니다. (*이더 WS 이벤트 지연 전파로 인한 오류 대비 차원에서, 못 찾으면 바로 포기하지 않고 `최대 5회`까지 반복하며, 매 실패시 `1초 대기`를 적용하는 재시도(Retry) 기믹을 필수 구현합니다.*)
   3. 데이터베이스 조회 쿼리를 이용해, **시스템 구조상 자신이 가지고 있는 가장 마지막 직전 블록**을 호출합니다.
   4. **[판별 로직]** 방금 수신 조립 완료된 새 블록의 **`parentHash`**(부모노드주소) 와, 방금 DB에서 가져온 **`blockHash`**(이전 체인 최상단)를 비교합니다.
   5. **만약 해시값이 다를 경우:** 즉각 실시간 체인 분기/고아 현상(Chain Reorg)으로 간주하고, ReorgLog 테이블에 사유(`"Real-time parentHash mismatch detected"`)를 담아 DB에 INSERT 합니다.
   6. 위 트리거 로직을 지난 후 (성공 실패 여부 무관), 이 최근 블록은 확정여부 신뢰성이 없으므로 DB `block_records` 안에는 무조건 상태값을 `UNFINALIZED` 로 기록하여 안전 폴백 대상으로 넘깁니다.

### C. 블록 감지 (Phase 2): Polling Cron 기반 주기적 검증 / 상태 자동화
- NestJS 스케줄러를 이용, `POLLING_CRON_TIME` (통상 10초) 간격으로 동작합니다.
- 워커 고장으로 인한 병목 누수 방지용으로, 작업 변수락(`isPolling=true/false`)을 전위와 후위에 겁니다.
- **상태 최종 확정 업그레이드 전술 (Finality Upgrades)**:
  - 노드 RPC를 통해 현재 네트워크의 확정 지점 주소인 `eth_getBlockByNumber('safe')`와 `eth_getBlockByNumber('finalized')`을 각각 날려 그 분기 블록 번호를 들고 옵니다.
  - 해당 범위 숫자 이하로 매핑되는 내부 DB에 대해 일괄적으로 `SAFE` 혹은 `FINALIZED` 상태 업데이트를 한 번에 부릅니다. *이때 잦은 Update I/O 발생을 줄이고 성능을 아끼기 위해 메모리 캐시 변수(`lastProcessedSafeBlock` 등) 값 기반으로 비교해, 변화가 없을시 스킵하는 최적화를 구현해야 합니다.*
- **서브 체인 과거 데이터 2차 조회 / 사후 재검증**:
  - 현재 시스템 DB 데이터 중 `FINALIZED`가 찍혀 명백히 확정되지 않은 쩌리 블록 목록 (상태: `UNFINALIZED` 이거나 `SAFE`)들을 조회합니다.
  - 리스트를 반복문을 돌리면서 RPC 블록을 다시 긁어옵니다. (동일 Rate Limit 방지용 루프 지연 100ms 추가)
  - 네트워크 상의 노드 Hash와 원래 DB에 존재하던 Hash 값을 다시 맞대봅니다.
  - **[판별 로직]** 만약 과거 데이터의 해시값이 10초 후에 다시 대조해 보니 다릅니다: 사후 지연 Chain Reorg 록온. `ReorgLog`를 찍어 사유(`"Polling validation hash mismatch detected"`)를 넣고, 해당 블록을 최신 이긴 해시로 DB를 UPDATE 시킵니다. (*이때의 Update는 불완전하므로 다시 상태를 UNFINALIZED로 내려 나중에 또 감시받게 둡니다.*)