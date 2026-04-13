# PRD.md — PoC Monitoring Indexer (RSH)

## 1. 프로젝트 개요
NestJS와 PostgreSQL을 사용하여 이더리움(Sepolia/Mainnet 호환) 네트워크의 Chain Reorg(체인 재조직)를 실시간으로 감지하고, 상태를 추적하며, Reorg 발생 시 DB 기록 및 알림(로그)을 수행하는 백엔드 애플리케이션입니다. 

> **주의 사항**: 본 마스터 PRD 문서는 핵심 아키텍처 및 개요를 포괄하며, 구체적인 비즈니스 로직, 스키마, 시스템 정책은 아래의 부속 상세 문서를 참조해야 합니다.
> AI/에이전트 환경의 경우, 반드시 `AGENTS.md`를 우선 숙지하십시오.
> 
> - 🤖 **[AGENTS.md (AI 지침 및 문서 인덱스)](./AGENTS.md)**
> - 📄 **[BUSINESS_LOGIC.md (핵심 비즈니스 로직 / 동기화 알고리즘)](.agent/BUSINESS_LOGIC.md)**
> - 📄 **[SYSTEM_POLICY.md (전역 예외/로깅 시스템 규칙 및 환경 변수)](.agent/SYSTEM_POLICY.md)**
> - 📄 **[DB_SCHEMA.md (데이터베이스 스키마 스펙)](.agent/DB_SCHEMA.md)**
> - 📄 **[API_SPEC.md (REST API 명세서)](.agent/API_SPEC.md)**
> - 📄 **[CODING_CONVENTION.md (코딩 스타일 가이드 및 컨벤션)](.agent/CODING_CONVENTION.md)**

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
- **`src/contract/`**: 환경 변수(`.env`)로 지정된 스마트 컨트랙트의 이벤트를 WS로 구독하여 전용 DB에 분리/저장하는 이벤트 모니터링 도메인입니다.
- **`src/common/`**: 프로젝트 전체(`BaseEntity`, 전역 예외필터, 응답 인터셉터 등)에서 공통으로 재사용하는 헬퍼 집합입니다.

---

## 4. 아키텍처 레이어 핵심 5원칙 (계층 기반)

1. **Controller Layer**: 오직 HTTP 라우팅 매핑 및 응답 직렬화 역할로 제한됩니다. **절대 비즈니스 로직이 포함될 수 없습니다.**
2. **Service Layer**: 모든 핵심 비즈니스 로직과 트랜잭션의 진입점이 됩니다. 각 도메인 내 단일 책임 원칙(SRP)을 따릅니다.
3. **Repository Layer**: TypeORM의 `Repository<T>`를 직접 Service 안에서 `inject`해 쓰지 않으며, 커스텀 Repository 클래스를 만들어 DB 쿼리 관심사를 격리시킵니다.
4. **Entity Layer**: DB 스키마와 1:1 매핑되는 프로퍼티 묶음입니다. 비즈니스 로직용 함수를 Entity 내에 삽입하는 것을 엄격히 금지합니다. 모든 테이블 스펙은 무조건 `BaseEntity` 속성을 상속해야 합니다.
5. **DTO Layer**: 외부 입출력 데이터 규격 명세이며, 필히 `class-validator`를 이용한 런타임 제약조건을 가지게 작성합니다. `ValidationPipe`로 자동 검증됩니다.