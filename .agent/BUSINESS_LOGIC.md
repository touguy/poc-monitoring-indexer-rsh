# 핵심 비즈니스 로직 상세 설계 (BUSINESS_LOGIC.md)

이 문서는 PoC Monitoring Indexer 시스템의 심장부인 블록 감지, 데이터 처리 큐, Chain Reorg 검증 및 스마트 컨트랙트 이벤트 모니터링에 대한 상세 사양을 서술합니다.

---

## A. 앱 부트스트랩 시: 초기 동기화 엔진 (Initial Sync)
1. **차이(Gap) 판별**: `OnModuleInit` 시 DB 최신 블록과 체인 `latest` 블록 간의 차이를 계산합니다.
2. **Bulk Chunking (병렬 동기화)**:
   - 블록을 1개씩 순차적으로 조회하지 않고, 대량의 블록 범위를 `Promise.all` 청킹(Chunk Size 50)으로 병렬 수집합니다.
   - **Dynamic Chunking**: 노드에서 `Log limit exceeded` 등의 에러 발생 시, 범위를 즉시 절반으로 쪼개어 재시도하는 재귀적 알고리즘을 통해 안정성을 확보합니다.
3. **JSON-RPC Batching**: `ethers.JsonRpcProvider` 설정(`batchMaxCount`)을 통해 수십 개의 RPC 요청을 단일 TCP 페이로드로 묶어 전송하여 네트워크 효율을 극대화합니다.
4. **장애 방지**: RPC Rate Limit 보호를 위해 매 청크 처리 후 최소 100ms의 지연(`Delay`)을 적용합니다.

---

## B. 블록 저장 (Phase 1): WebSocket 기반 실시간 수신 및 저장
1. **WS Block Header 인터셉트**:
   - 이더리움 `newHeads` 구독 시 수신되는 원문 페이로드를 직접 파싱하여 `EthBlockHeader` 인터페이스로 관리합니다.
   - **RPC 호출 제거**: WS 헤더에 포함된 `hash`, `parentHash`, `timestamp`, `logsBloom` 등을 즉시 사용함으로써 `eth_getBlockByNumber` 호출을 생략합니다.
2. **메모리 큐(Memory Queue) 기반 순차 처리**:
   - Race Condition 방지를 위해 수신된 헤더를 `blockQueue`에 적재하고 워커(`processBlockQueue`)가 순차적으로 처리합니다.
3. **Realtime Reorg 감지 (Backtracing)**:
   - 큐에서 블록 처리 전, 메모리에 캐싱된 `lastProcessedBlockHash`와 새 블록의 `parentHash`를 대조합니다.
   - 해시 불일치 시 즉시 역추적(While loop)을 시작하여 공통 조상을 찾고 DB 상태를 롤백한 뒤 동기화를 재개합니다.

---

## C. 블록 감지 (Phase 2): Polling Cron 기반 주기적 검증 및 상태 관리
1. **Multi-stage Finality 업데이트**:
   - 노드의 `safe`, `finalized` 태그 블록 번호를 조회합니다.
   - 해당 범위 이하의 DB 레코드를 `SAFE` 또는 `FINALIZED` 상태로 일괄 업데이트합니다.
2. **사후 Reorg 검증**:
   - `FINALIZED`가 아닌 블록들을 주기적으로 재조회하여 노드 해시와 대조합니다.
   - 불일치 감지 시 `ReorgLog`를 기록하고 해당 블록을 `UNFINALIZED`로 갱신하여 사후 보정을 수행합니다.
3. **체인 갭(Gap) 보충**:
   - DB 내 연속되지 않은 블록 번호를 색출하여 누락된 구간을 RPC로 보충 저장합니다.

---

## D. 스마트 컨트랙트 이벤트 모니터링 (Phase 3)
1. **Bloom Filter 기반 RPC 최적화**:
   - 블록 헤더의 `logsBloom`을 `ethers.js` 유틸리티로 먼저 검사합니다.
   - 타겟 컨트랙트 주소나 토픽이 존재할 가능성이 있을 때만 `eth_getLogs` RPC를 명시적으로 요청합니다.
2. **팩토리(Factory) 패턴 동적 주소 추적**:
   - Factory 컨트랙트의 이벤트를 감시하여 생성된 자식 컨트랙트 주소를 `DynamicAddressRegistry`에 동적으로 추가하고 감시 대상에 포함합니다.
3. **제너릭 파싱 및 저장**:
   - 로그를 `ethers.Interface`로 디코딩하여 `arg1`, `arg2`, `val1` 등 제너릭 컬럼에 분해 저장합니다.
   - 모든 이벤트 레코드는 블록 번호와 연동되어 Reorg 시 함께 롤백됩니다.
