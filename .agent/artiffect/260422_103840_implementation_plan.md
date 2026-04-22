# Ponder 아키텍처 도입 (코드 반영) 구현 계획

Ponder Core 기반으로 설계된 4가지 확장 아키텍처(옵션 1~4)를 `poc-monitoring-indexer-rsh` 코드베이스에 적용하기 위한 상세 구현 계획입니다. 

## User Review Required

> [!WARNING]
> 본 작업은 대규모 코드 수정(DB 스키마 추가, 신규 Entity 생성, BlockService 및 ContractEventService 구조 변경)을 동반합니다. 
> 4가지 옵션(Bloom 필터, 실시간 Reorg 백트레이싱, 팩토리 동적 주소, 내부 트랜잭션 수집)을 **모두 한 번에 적용**하는 방향으로 계획을 수립했습니다. 만약 일부 옵션만 선별적으로 적용하고 싶으시다면 승인 전 피드백으로 말씀해 주세요.

## Proposed Changes

---

### Database Schema & Entities

#### [MODIFY] [init.sql](file:///home/touguy/dev/diff/poc-monitoring-indexer-rsh/init.sql)
- `dynamic_contracts` 테이블 생성 (동적 팩토리 주소 추적용)
- `internal_transaction_records` 테이블 생성 (Trace 수집용)

#### [NEW] `src/contract/entity/dynamic-contract.entity.ts`
- TypeORM 엔티티 생성

#### [NEW] `src/contract/entity/internal-transaction-record.entity.ts`
- TypeORM 엔티티 생성

#### [NEW] `src/contract/repository/dynamic-contract.repository.ts`
- `saveAddress`, `findAllAddresses` 등 DB 영속성 관리 메서드 추가

#### [NEW] `src/contract/repository/internal-transaction-record.repository.ts`
- 내부 트랜잭션 대량 삽입용 Repository 생성

---

### Core Services

#### [NEW] `src/common/utils/bloom.util.ts`
- 이더리움 블록 헤더의 `logsBloom` 필드를 파싱하여 특정 주소나 토픽의 존재 확률을 계산하는 커스텀 블룸 필터 헬퍼 함수 구현. (Ethers.js와 조합)

#### [MODIFY] [src/contract/service/contract-event.service.ts](file:///home/touguy/dev/diff/poc-monitoring-indexer-rsh/src/contract/service/contract-event.service.ts)
- **(옵션 1) 블룸 필터 연동**: `fetchAndSaveEventsForBlock` 호출 시 `logsBloom` 문자열을 인자로 추가로 받아, `bloom.util.ts`를 통해 사전 검사 후 `false`면 즉시 반환(Skip) 처리.
- **(옵션 3) 동적 주소 관리**: `DynamicContractRepository` 연동. 메모리에 `Set`으로 동적 주소 캐싱 및 `PairCreated` 등 Factory 이벤트 감지 시 `add` 로직 구현.
- **(옵션 4) 내부 트랜잭션 (Traces) 수집**: 환경변수 `ENABLE_TRACE_SYNC=true` 일 경우 `rpcService.debugTraceBlockByHash` 호출 및 파싱 후 `internal_transaction_records` 저장 로직 추가.

#### [MODIFY] [src/block/service/block.service.ts](file:///home/touguy/dev/diff/poc-monitoring-indexer-rsh/src/block/service/block.service.ts)
- **(옵션 2) 실시간 Reorg 감지**: 
  - `handleNewBlock` 내에 `lastProcessedBlockHash` 비교 로직 추가.
  - 해시 불일치 시 `pause` 플래그를 켜고, `while` 루프를 이용해 `parentHash`를 거슬러 올라가는 Backtracing 로직 구현 및 완료 후 `ReorgLog` 작성.
- `fetchAndSaveEventsForBlock` 호출 부에 RPC로 얻어온 블록의 `logsBloom` 데이터를 넘기도록 수정.

#### [MODIFY] `src/blockchain/service/blockchain-rpc.service.ts`
- `debug_traceBlockByHash` 또는 `debug_traceBlockByNumber` RPC Call 래퍼 메서드 신규 추가.

---

## Verification Plan

### Automated Tests / Manual Verification
- 컴파일(`npm run build`) 후 구문 에러가 없는지 확인합니다.
- TypeScript 체커로 의존성 및 인터페이스 불일치 오류를 검사합니다.
- (선택 사항) 사용자가 `.env`에 `ENABLE_TRACE_SYNC` 플래그 및 테스트용 노드 URL을 주입 후 로컬 환경에서 WebSocket 연결을 통해 Reorg 및 로그 정상 수집 동작을 검증합니다.
