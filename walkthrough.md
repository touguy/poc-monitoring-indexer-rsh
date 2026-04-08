# 블록체인 모니터링 인덱서 (NestJS 11) 구현 결과

주어진 PRD와 `.agents/rules` 문서에 제시된 아키텍처 규칙들을 바탕으로 이더리움 테스트넷(Sepolia)의 Transfer 이벤트를 수집/조회하는 NestJS 11 기반 백엔드 프로젝트 스캐폴드를 완성했습니다.

## 주요 작업 내역
1. **프로젝트 환경설정 완료 (`package.json`, `tsconfig.json`)**:
   - NestJS 11, TypeORM, Ethers, Winston 등의 패키지를 적용하고 NodeNext/ES2023 모듈 설정 및 코드 스타일(`eslint`, `prettier`) 적용.
   - `.env`에 주입하신 Sepolia RPC URL(`https://ethereum-sepolia.g.allthatnode.com/full/evm/ef840d70622e4980964b0101a7758d18`)이 기본값으로 들어가도록 세팅했습니다.
2. **DB 스키마 추가 (`init.sql`)**: 
   - 루트 경로에 `transfer_events`를 생성하고 블록 높이, 컨트랙트 주소 등에 인덱스를 할당하는 PostgreSQL 전용 SQL 문법 파일을 생성했습니다.
3. **공통 기능 및 전역 예외/응답 처리**: 
   - `GlobalResponseInterceptor` 및 `GlobalExceptionsFilter`를 적용하여 모든 응답이 `ResultResDto` 형식으로 래핑 처리됩니다.
   - `WinstonModule`을 이용한 일별(Daily) 회전 로그 설정 적용.
4. **블록체인 모듈 (`BlockchainService`)**:
   - Ethers.js의 `JsonRpcProvider`를 관리하며 RPC 에러 시 지수 백오프(Exponential Backoff)를 수행하도록 재시도(Retry) 패턴 로직 추가.
5. **TransferEvent 도메인 로직 및 스케줄러 배치 처리**:
   - `TypeORM`을 이용하여 DB에 로그 저장 및 API(`GET /transfer-events`) 노출.
   - `@Cron(CronExpression.EVERY_30_SECONDS)`을 통해 30초마다 `targets` 컨트랙트의 최신 TransferEvent를 읽어와 DB에 저장(`CHUNK_SIZE = 2000` 단위)하는 배치 프로세스 워커를 탑재했습니다.
6. **단위 테스트 (Unit Test)**:
   - `transfer-event.service.spec.ts`를 작성하여 서비스 레이어의 핵심 메소드의 테스트 코드를 구축했습니다.

## 실행 방법 및 테스트
루트 경로에 위치하므로 아래 명령어를 통해 의존성을 설치하고 바로 스크립트를 테스트할 수 있습니다.

> [!TIP]
> 1. DB 연동을 위해 PostgreSQL 데이터베이스와 테이블 구성이 선행되어야 합니다. (아래의 psql 명령 예시 참고)
> 2. `npm run build` 이후 오류가 없는 것을 확인했으며, `npm run start:dev` 로 서버를 띄울 시 30초마다 블록체인에서 이벤트를 긁어오는 로그를 콘솔과 `logs/` 디렉터리에서 확인할 수 있습니다.

### 테이블 스키마 생성 명령어
```bash
# 로컬 PostgreSQL (예시) 연결 후 루트에 정의된 SQL 쿼리 적용
psql -U postgres -d indexer -f init.sql
```

### 앱 서버 구동
```bash
npm run start:dev
```

### 테스트
```bash
npm run test
```

## 향후 개선점 (Open Issues)
- 수동 동기화를 할 경우 `TARGET_CONTRACT` 환경 변수가 유효한 ERC-20 토큰의 컨트랙트 주소인지 검증하거나 초기 구축에 사용할 기본 풀 데이터를 수집하는 CLI 도구를 붙여도 좋습니다.
- 현재 Cron 배치가 이전 블록 탐색을 위해 처음 실행 시 `currentBlock - 5000` 높이부터 스캔하도록 임시 적용했습니다. (실환경에서는 블록 범위를 늘려도 무관합니다.)

---
### 📅 2026-04-07 08:51:02 (새 PRD 기반 런타임 적용 완료)

**업데이트된 PRD("핵심 비즈니스 로직 요구사항")** 에 명시된 3가지 주요 기능을 성공적으로 구현 및 검증 빌드(`npm run build`) 완료했습니다.

## 주요 구현 내역 (업데이트)
1. **데이터베이스 스키마 재정의 (`BlockRecord`, `ReorgLog`)**
   - TypeORM Entity로 `BlockRecord`(상태 `UNFINALIZED`, `SAFE`, `FINALIZED`)와 `ReorgLog`를 정의하고 각각의 기능에 맞는 Repository를 구성했습니다.

2. **실시간 감지 (WebSocket - `newHeads`)**
   - `BlockchainService`에 `ethers.WebSocketProvider(WSS_URL)`를 연동했습니다.
   - `BlockService`에서 `onModuleInit` 시점에 이벤트를 구독하여 실시간으로 생성되는 블록 해시와 DB의 `latest` 노드 해시를 비교(`parentHash` 검증)하는 로직을 삽입했습니다.
   - 불일치 발생 시 즉각적으로 `ReorgService`를 통해 위기 알람(Logger warn) 및 DB 로깅을 남기도록 했습니다.

3. **주기적 Polling 검증 (Cron Job) 및 상태 업데이트 (Finality Check)**
   - `@Cron(CronExpression.EVERY_10_SECONDS)` 스케줄러로 `UNFINALIZED` 또는 `SAFE` 상태인 모든 블록들을 10초마다 주기적으로 불러옵니다.
   - RPC 호출(`eth_getBlockByNumber`)을 통해 최신 해시와 대조하며 Rate Limit 회피를 위해 Promise 딜레이를 삽입했습니다.
   - `safe`, `finalized` 상태 태그를 사용하여 확실히 확정된 블록은 차후 검증 대상에서 배제하여 불필요한 연산을 막았습니다.

---
### 📅 2026-04-07 12:56:00 (FINALIZED 블록 상태 보호 로직 적용)

이미 **FINALIZED** 상태인 블록이 `SAFE` 등의 하위 상태로 업데이트되지 않도록 보장하는 보호 로직을 구현했습니다.

## 주요 수정 사항
1. **Repository 레벨의 상태 업데이트 보호 (`BlockRecordRepository`)**
   - `updateStatusUpToBlock` 메서드에 `.andWhere('status != :finalized', { finalized: BlockStatus.FINALIZED })` 조건을 추가했습니다.
   - 이로 인해 `safe` 블록 번호가 `finalized` 블록 번호보다 낮게 보고되는 특수한 상황(노드 지연 등)이 발생하더라도, 이미 확정된 블록은 상태가 변경되지 않고 유지됩니다.
   - 블록체인의 불변성(Immutability) 원칙을 DB 수준에서 한 번 더 강제함으로써 데이터 무결성을 확보했습니다.

2. **코드 품질 및 구문 검증**
   - `npm run format` (Prettier)을 통해 전체 코드 컨벤션을 정렬하고 구문 오류가 없음을 확인했습니다.
