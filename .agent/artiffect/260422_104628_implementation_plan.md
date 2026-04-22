# Ponder 심화 최적화 기능 분석 및 적용 계획 (Phase 2)

기존에 적용한 4가지 옵션 외에, 현재 `poc-monitoring-indexer-rsh`의 아키텍처를 분석한 결과 **초기/과거 데이터 동기화 속도**와 **네트워크 리소스 효율성** 측면에서 Ponder의 핵심 기술을 추가로 도입할 여지가 큽니다.

## 🔍 추가 적용 대상 분석 (Ponder Core 심화 기능)

### 1. (옵션 5) Historical Sync Bulk Chunking (과거 블록 대량 동기화 최적화)
- **현재의 한계**: `BlockService.saveBlocksInRange()` 메서드를 보면, `for` 루프를 돌며 **블록을 1개씩 순차적으로 조회(`getBlockByNumber`)**하고 100ms의 딜레이를 줍니다. 만약 1,000개의 블록 갭(Gap)이 발생하면 동기화에 최소 100초 이상의 막대한 지연이 발생합니다.
- **Ponder의 방식**: Ponder는 `eth_getLogs`를 호출할 때 블록 단위가 아닌 거대한 범위(예: `fromBlock: 1000, toBlock: 2000`)로 한 번에 조회합니다. 만약 노드가 '결과값이 너무 많다'며 에러를 뱉으면, 즉시 범위를 절반으로 쪼개어 재시도(Dynamic Chunking)하는 알고리즘을 사용합니다.
- **도입 효과**: 초기 동기화 속도 최소 10배~50배 이상 향상.

### 2. (옵션 6) RPC Cache Layer (네트워크 요청 로컬 캐싱)
- **현재의 한계**: `BlockService`의 Polling 로직은 60초마다 UNFINALIZED 블록을 재조회합니다. 블록 확정이 늦어질 경우 동일한 블록 데이터를 노드에 반복적으로 요청하게 되어 RPC Rate Limit에 걸릴 확률이 높아집니다.
- **Ponder의 방식**: 모든 RPC 응답(Block Header, Logs)을 로컬 DB(SQLite/LevelDB)나 메모리에 해시 키 기반으로 캐싱합니다. Reorg 상황을 제외하면 한 번 받아온 불변 데이터는 절대 네트워크에 재요청하지 않습니다.
- **도입 효과**: RPC 노드 비용 절감 및 Polling 검증 로직의 병목 완화.

---

## User Review Required

> [!WARNING]
> 위 2가지 기능 중 **옵션 5 (대량 동기화 최적화)**는 현재 시스템의 치명적인 성능 병목을 해결할 수 있어 즉시 도입을 강력히 권장합니다.
> **옵션 6 (RPC 캐싱)**은 메모리 사용량이 증가할 수 있으므로 LRU(Least Recently Used) 기반의 경량 메모리 캐시 형태로 구현하는 것을 제안합니다.
> 이 계획대로 코드를 변경해도 될지 **승인(Approve)**해 주시면 바로 구현을 시작하겠습니다.

---

## Proposed Changes

### [MODIFY] `src/block/service/block.service.ts`
- `saveBlocksInRange(startBlock, endBlock)` 로직 전면 개편:
  - 기존의 1개씩 조회하는 `for` 루프 제거.
  - 범위를 N개(예: 100~500개) 단위의 Chunk 배열로 나눔.
  - 각 Chunk 단위로 `Promise.all`을 사용하여 블록 헤더를 병렬 수집(Concurrency Limit 적용).

### [MODIFY] `src/contract/service/contract-event.service.ts`
- `fetchAndSaveEventsForBlock` 기능을 오버로딩 또는 확장하여, 다중 블록 범위(`fromBlock` ~ `toBlock`)에 대한 `eth_getLogs` 대량 호출 및 청킹(Dynamic Chunking) 대응 로직 추가.
- RPC Rate Limit(429) 또는 Size Limit 발생 시 범위를 반으로 줄여 재귀 호출하는 로직 구현.

### [MODIFY] `src/blockchain/service/blockchain-rpc.service.ts`
- `Map<string, any>` 기반의 경량 메모리 LRU 캐시 계층 추가.
- `getBlockByNumber` 호출 시 인메모리 캐시부터 확인하고, 없으면 RPC 호출 후 결과를 캐싱. (단, `latest`, `safe` 등 동적 태그는 캐싱 제외)

---

## Verification Plan

### Automated Tests
- `npm run build`를 통해 컴파일 검증.
### Manual Verification
- 환경 변수에서 `INITIAL_SYNC_BLOCK_COUNT=500` 등으로 크게 설정한 뒤 노드를 띄웠을 때, 기존 대비 수십 배 빠르게 동기화가 완료되는지 터미널 로그 속도를 통해 검증.
