# 핵심 비즈니스 로직 상세 설계 (BUSINESS_LOGIC.md)

이 문서는 PoC Monitoring Indexer 시스템의 심장부인 블록 감지, 데이터 처리 큐, Chain Reorg 검증 및 스마트 컨트랙트 이벤트 모니터링에 대한 상세 아키텍처와 알고리즘 절차를 서술합니다. 
*(시스템 리버스 엔지니어링의 핵심 지침이며, 이 구현 요구사항을 누락 없이 순서대로 준수해야 원래의 기능으로 100% 동일하게 복구 가능합니다.)*

---

## A. 앱 부트스트랩 시: 초기 동기화 엔진 (Initial Sync)
- `OnModuleInit` 훅 단계에서 **비동기 백그라운드**로 실행을 개시합니다.
- 데이터베이스 내에 저장된 자신이 가진 가장 최신 블록 번호와, 이더리움 체인 상의 `latest` 최신 블록 번호의 차이(`Gap`)를 판별하여 동기화를 메웁니다:
  - **데이터베이스가 텅 빈 경우**: 네트워크의 현재 가장 큰 최신 블록을 기준으로, `INITIAL_SYNC_BLOCK_COUNT` 갯수만큼 즉시 파싱하여 삽입합니다.
  - **차이(Gap) 범위가 너무 큰 경우 (100개 이상)**: 지나치게 오래된 과거 블록 동기화는 효율상 스킵하고, 최신 N개의 데이터만을 보충합니다. (부분 보충 전략)
  - **차이(Gap) 범위가 0 초과 100 미만인 경우**: 잃어버린 누락 구간(Missing Range)만 `Start -> End` 형태로 순차 반복 스윕(Sweep)하며 즉각 보충 저장합니다.
- 💡 **장애 방지 기믹**: RPC Rate Limit(노드 과부하 발생) 보호를 위해 루프 안에서 **매 블록 조회 후 최소 100ms 지연(`Delay`)**을 발생시키는 프로미스 프로시저를 삽입해야 합니다.

---

## B. 블록 저장 (Phase 1): WebSocket 기반 실시간 수신 및 저장
- 블록체인 RPC 중 이더리움 `newHeads`(block) 웹소켓 이벤트 스트리밍 기반 리스너를 구독합니다.
- **메모리 큐(Memory Queue) 적용 원칙**: 다량의 블록이 분기하며 꼬여서 동시에 수신될 때 트랜잭션 충돌(Race Condition 시 발생되는 꼬임) 방지를 위해, 이벤트를 즉각 DB에 넣지 않고 일단 빈 자바스크립트 배열 큐(`blockQueue`)에 적재시킵니다.
- **순차 처리 워커 (`processBlockQueue`)**:
   1. 배열에서 한 개의 블록만 POP시켜 단일 스레드로 통과시킵니다.
   2. 수신된 이벤트를 이용해 상세 블록 데이터를 HTTP RPC로 패치합니다. (*이더 WS 이벤트 지연 전파로 인한 오류 대비 차원에서, 못 찾으면 바로 포기하지 않고 `최대 5회`까지 반복하며, 매 실패시 `1초 대기`를 적용하는 재시도(Retry) 기믹을 필수 구현합니다.*)
   3. 이 최근 블록은 확정여부 신뢰성이 없으므로 DB `block_records` 안에는 무조건 상태값을 `UNFINALIZED` 로 기록하여 안전 폴백 대상으로 넘깁니다. (기존 레코드가 있을 경우도 업데이트로 처리)

> [!NOTE]
> 🚀 **[Ponder 확장 기능 - 옵션 2: 실시간 Reorg 감지 (Realtime Backtracing)]**
> - **변경 계획**: `processBlockQueue`에서 새 블록을 Pop할 때, 메모리에 캐싱된 `lastProcessedBlockHash`와 새 블록의 `parentHash`를 즉시 대조합니다.
> - 해시 불일치 발생 시 즉시 큐를 일시 정지(Pause)하고, RPC를 통해 조상 해시를 역추적(While loop)하여 공통 조상 블록을 찾은 뒤 DB 상태를 롤백하고 인덱싱을 재개합니다. (기존 Phase 2의 Reorg 감지를 Phase 1으로 앞당겨 실시간성 극대화)

---

## C. 블록 감지 (Phase 2): Polling Cron 기반 주기적 검증 / 상태 자동화
- NestJS 스케줄러를 이용, `POLLING_CRON_TIME` (통상 60초) 간격으로 동작합니다.
- 워커 고장으로 인한 병목 누수 방지용으로, 작업 변수락(`isPolling=true/false`)을 전위와 후위에 겁니다.
- **상태 최종 확정 업그레이드 전술 (Finality Upgrades)**:
  - 노드 RPC를 통해 현재 네트워크의 확정 지점 주소인 `eth_getBlockByNumber('safe')`와 `eth_getBlockByNumber('finalized')`을 각각 날려 그 분기 블록 번호를 들고 옵니다.
  - 해당 범위 숫자 이하로 매핑되는 내부 DB에 대해 일괄적으로 `SAFE` 혹은 `FINALIZED` 상태 업데이트를 한 번에 부릅니다. *이때 잦은 Update I/O 발생을 줄이고 성능을 아끼기 위해 메모리 캐시 변수(`lastProcessedSafeBlock` 등) 값 기반으로 비교해, 변화가 없을시 스킵하는 최적화를 구현해야 합니다.*
- **REORG 검증**:
  - 현재 시스템 DB 데이터 중 `FINALIZED`가 찍혀 명백히 확정되지 않은 블록 목록 (상태: `UNFINALIZED` 이거나 `SAFE`)들을 조회합니다.
  - 리스트를 반복문을 돌리면서 RPC 블록을 다시 긁어옵니다. (동일 Rate Limit 방지용 루프 지연 100ms 추가)
  - 네트워크 상의 노드 Hash와 원래 DB에 존재하던 Hash 값을 다시 맞대봅니다.
  - **[판별 로직]** 만약 과거 데이터의 해시값이 60초 후에 다시 대조해 보니 다릅니다: 사후 지연 Chain Reorg 록온. `ReorgLog`를 찍어 사유(`"Polling validation hash mismatch detected"`)를 넣고, 해당 블록을 최신 이긴 해시로 DB를 UPDATE 시킵니다. (*이때의 Update는 불완전하므로 다시 상태를 UNFINALIZED로 내려 나중에 또 감시받게 둡니다.*)
- **체인 갭 감지**:  
  - 현재 시스템 DB 데이터 중 `FINALIZED`가 찍혀 명백히 확정되지 않은 블록 목록 (상태: `UNFINALIZED` 이거나 `SAFE`)들 안에서만 조회하여, 블록 번호가 연속적이지 않고 중간에 비어있는 구간(Gap)을 모두 색출해냅니다.
  - 리스트를 반복문을 돌리면서 색출된 누락 블록들을 RPC를 통해 긁어와, DB에 무조건 `UNFINALIZED` 상태로 저장(Upsert) 합니다. (동일 Rate Limit 방지용 루프 지연 100ms 추가)

---

## D. 스마트 컨트랙트 이벤트 모니터링 (Phase 3): 블록 동기화 결합 기반 이벤트 수집
- **도메인 분리 및 통합 동기화 방침**: 이 기능은 코드 아키텍처 상으로는 독립된 `src/contract/` 모듈 형식을 가지지만, 인덱싱 흐름 상으로는 `src/block` 내의 블록 저장 로직(`saveBlocksInRange`, `handleNewBlock`)과 일체화되어 동시에 수집됩니다. (블록 누락 시 로그만 수집되는 현상 방지)

> [!NOTE]
> 🚀 **[Ponder 확장 기능 - 옵션 1: Bloom Filter 최적화]**
> - **변경 계획**: 무조건 `eth_getLogs`를 호출하지 않고, 블록 헤더에 포함된 `logsBloom` 필드를 `ethers.js`의 Bloom Filter 유틸리티로 먼저 검사합니다.
> - 타겟 컨트랙트 주소나 토픽이 블록에 존재할 가능성이 있을 때만(`true` 반환 시) 아래의 RPC 호출을 수행하여 노드 트래픽을 극적으로 절약합니다.

- **RPC `getLogs` 필터 기반 일괄 조회**:
  - 구동 시 `.env`에 정의된 `CONTRACT_ADDRESSES` 및 `CONTRACTS_TOPICS` (모니터링 대상 주소 및 이벤트명) 환경변수를 바탕으로 동적으로 이벤트 해시를 변환하여 공통 필터(Filter)를 설정합니다.

> [!NOTE]
> 🚀 **[Ponder 확장 기능 - 옵션 3: 팩토리(Factory) 동적 주소 추적]**
> - **변경 계획**: Factory 컨트랙트의 `Created` 이벤트를 파싱할 경우, 생성된 자식 컨트랙트 주소를 인메모리 `DynamicAddressRegistry` 및 DB `dynamic_contracts` 테이블에 동적으로 추가합니다.
> - 이후 블록의 `getLogs` 호출 시 `.env`의 정적 주소와 동적 주소 배열을 병합(Merge)하여 필터로 사용합니다.

  - 별도의 WebSocket 이벤트 리스너를 열지 않고, 동기화/수집해야 할 특정 블록 번호가 정해지면 해당 블록에 대해 필터를 묶어 단 1회의 `eth_getLogs` RPC를 명시적으로 요청합니다.
- **제너릭 파싱 및 저장 모델 (`ContractEventRecord`)**:
  - `getLogs`로 가져온 한 블록 내 다중 로그 배열을 `ethers.Interface`로 개별 디코딩합니다.
  - JSON 덤프 방식을 피하고, 공통 `contract_event_records` 테이블의 `arg1`, `arg2`, `arg3`, `val1`, `val2`와 같은 제너릭 파티셔닝 컬럼에 이벤트 종류별로 데이터를 분해(Mapping)하여 저장합니다.
  - 이 데이터들은 원래 트랜잭션이 포함된 블록 메타정보(블록 번호, logIndex 등)와 함께 저장되므로, 추후 해당 블록이 Chain Reorg 대상이 될 경우 동일하게 롤백(Rollback) 처리에 연계됩니다.

> [!NOTE]
> 🚀 **[Ponder 확장 기능 - 옵션 4: 내부 트랜잭션 (Traces) 수집]**
> - **변경 계획**: `eth_getLogs` 호출과 병렬로 `debug_traceBlockByHash`를 호출하여 명시적인 `emit` 없이 상태를 변경하는 내부 호출(Internal Calls) 트랜잭션 내역까지 수집하여 `internal_transaction_records`에 저장합니다. (단, Archive 노드 필수 및 환경변수 `ENABLE_TRACE_SYNC=true` 토글 적용)
