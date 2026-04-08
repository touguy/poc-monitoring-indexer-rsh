# PRD.md — 

## 프로젝트 개요
NestJS와 PostgreSQL을 사용하여 이더리움(Sepolia/Mainnet 호환) 네트워크의 Chain Reorg(체인 재조직)를 실시간으로 감지하고, 상태를 추적하며, Reorg 발생 시 DB 기록 및 로그 알림을 수행하는 백엔드 애플리케이션

## 기술 스택
| 레이어 | 기술 |
|--------|------|
| Framework | NestJS 11 |
| Language | TypeScript 5.7 (ES2023, module nodenext) |
| ORM | TypeORM 0.3 + PostgreSQL (pg) |
| Blockchain | ethers.js 6 (읽기 전용, 보조 검증용) |
| Validation | class-validator + class-transformer |
| Config | @nestjs/config (ConfigService) |
| Logging | nest-winston + winston + winston-daily-rotate-file |
| Testing | Jest + ts-jest |
| Env | dotenv-cli |

---

## 아키텍처 핵심 규칙

### 레이어 책임
- **Controller**: HTTP 요청/응답 변환만. 비즈니스 로직 금지.
- **Service**: 모든 비즈니스 로직. 단일 책임 원칙 준수.
- **Repository**: DB 접근 로직. `BaseRepository`를 상속. Service에서 직접 `Repository<T>` 사용 지양.
- **Entity**: DB 매핑 스키마만. 비즈니스 로직 금지. `BaseEntity` 상속.
- **DTO**: 입출력 검증과 직렬화만.

### 의존성 주입
- 모든 의존성은 생성자 주입. `new Service()` 직접 생성 금지.
- 환경 변수는 `ConfigService`를 통해서만 접근. `process.env.*` 직접 사용 금지.

### 응답 형식
- 모든 API 응답은 `ResultResDto`로 래핑. `GlobalResponseInterceptor`가 전역 적용.
- 성공: `ResultResDto.success(data)` / 메시지 포함: `ResultResDto.successWithMessage(data, message)`

### 예외 처리
- 비즈니스 예외는 `BusinessException(ErrorCode.XXX)` 사용.
- 전역 `GlobalExceptionsFilter`가 모든 예외를 `ResultResDto.error(message)` 형태로 반환.
- `throw new Error()`로 원시 에러를 컨트롤러 밖으로 노출 금지.

### 로깅
- `console.log` 금지.
- `WinstonModule`을 `AppModule`에 전역 등록하고 `WINSTON_MODULE_PROVIDER`로 주입:
  ```typescript
  constructor(@Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger) {}
  ```
- `APP_NAME` 환경 변수로 서비스 이름 식별.

### 포맷 (`.prettierrc` 기준)
- 단일 따옴표, 후행 쉼표(all), 스페이스 2칸.

---

## 상세 규칙 위치
| 규칙 | 파일 |
|------|------|
| 코드 스타일 / TypeScript | `.agent/rules/code-style.md` |
| NestJS 패턴 | `.agent/rules/nestjs.md` |
| 테스트 | `.agent/rules/testing.md` |


# 데이터베이스 스키마 요구사항 (TypeORM Entity)
1. `BlockRecord` Entity:
   - `blockNumber` (Primary Key, Integer)
   - `blockHash` (String)
   - `parentHash` (String)
   - `status` (Enum: 'UNFINALIZED', 'SAFE', 'FINALIZED')
   - `timestamp` (Date)
2. `ReorgLog` Entity:
   - `id` (Auto Increment, Primary Key)
   - `detectedAt` (Date, 발생 시간)
   - `blockNumber` (Integer)
   - `oldHash` (String, 기존 DB에 있던 해시)
   - `newHash` (String, 새로 바뀐 해시)
   - `message` (String, 알림 메시지)

## 핵심 비즈니스 로직 요구사항

### 1. 실시간 감지 (WebSocket - `newHeads`)
- Ethers.js의 WebSocket Provider를 사용해 `block` 이벤트를 구독(Subscribe)한다.
- 새 블록이 수신되면, DB에 저장된 `latest` 블록(가장 큰 blockNumber)을 조회한다.
- 새 블록의 `parentHash`가 DB에 저장된 `latest` 블록의 `blockHash`와 일치하는지 비교한다.
- **불일치 시:** Reorg가 발생한 것으로 판단하고 `ReorgLog` DB에 기록 및 Logger.warn으로 Alert를 출력한다.
- 정상/Reorg 여부와 상관없이 새 블록 정보를 `status: 'UNFINALIZED'`로 DB에 Insert/Update 한다.

### 2. 주기적 Polling 검증 (Cron Job)
- `@nestjs/schedule`을 이용하여 주기적으로(예: 10초마다) 실행되는 Cron 로직을 작성한다.
- DB에서 `status`가 'FINALIZED'가 **아닌** 모든 블록(즉, UNFINALIZED 및 SAFE 블록)을 조회한다. (최신 블록부터 마지막 확정 블록 사이의 범위)
- 조회된 블록 번호들을 JSON-RPC API(`eth_getBlockByNumber`)를 통해 다시 호출하여 현재 네트워크의 해시와 DB의 해시를 비교한다.
  - *주의사항:* RPC Rate Limit을 방지하기 위해 Promise.all() 남용을 피하고, 배치 처리나 딜레이를 주어 안전하게 호출하도록 구현한다.
- **해시 변경 감지 시:** Reorg로 판단하고 `ReorgLog`에 기록, 해당 블록과 그 이후의 블록 데이터를 최신 해시로 덮어쓴다.

### 3. 블록 상태 업데이트 (Finality Check)
- 위 2번 Polling 과정에서 RPC 호출을 할 때, 다음 기준에 따라 DB의 `status`를 업데이트한다.
  - RPC로 `eth_getBlockByNumber('safe', false)`를 호출하여 반환된 블록 번호 이하의 데이터는 `status: 'SAFE'`로 업데이트한다.
  - RPC로 `eth_getBlockByNumber('finalized', false)`를 호출하여 반환된 블록 번호 이하의 데이터는 `status: 'FINALIZED'`로 업데이트한다.
- **가장 중요한 조건:** DB 상에서 `status`가 'FINALIZED'로 변경된 블록은 이후 2번의 Polling (RPC 재조회) 대상에서 완전히 제외되어야 한다.

## 작성 시 지침
- 모듈화: AppModule, BlockModule, ReorgModule 등으로 깔끔하게 분리해줘.
- Provider 설정: WebSocket URL(WSS)과 HTTP URL(RPC)을 환경 변수(`.env`)에서 가져오도록 설정해줘.
- 에러 핸들링: 네트워크 지연이나 RPC 엔드포인트 타임아웃에 대한 try-catch 예외 처리를 명시적으로 작성해줘.