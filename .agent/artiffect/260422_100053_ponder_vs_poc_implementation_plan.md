# PoC Indexer 기능 확장 구현 계획 (Ponder 아키텍처 기반)

본 문서는 Ponder Core의 우수한 아키텍처 요소들을 현재 개발 중인 PoC Monitoring Indexer (RSH)에 도입하기 위한 구체적인 기능별 차이점과 변경/구현 계획을 상세히 기술합니다. 사용자는 이 중 필요한 옵션을 선택하여 기존 시스템에 결합할 수 있습니다.

---

## 1. 옵션 1: Bloom Filter를 이용한 RPC 최적화

### 🔍 상세 차이점
- **현재 (PoC)**: 블록이 생성될 때마다 대상 블록 번호 구간에 대해 `eth_getLogs`를 무조건 호출합니다. 타겟 컨트랙트의 이벤트가 없는 빈 블록일지라도 RPC 호출이 발생하므로 네트워크 트래픽 낭비와 Rate Limit 발생 확률이 높습니다.
- **Ponder**: 블록 헤더에 기본적으로 포함된 256바이트의 `logsBloom` 해시값을 Ethers.js의 유틸리티로 검사하여, 모니터링 중인 주소나 토픽이 해당 블록 내에 존재할 가능성이 있는지 1차적으로 판별합니다. 가능성이 없다면 RPC 호출을 완전히 스킵합니다.

### 🛠️ 구현 및 변경 계획
1. **의존성 및 유틸리티 추가**: `ethers.js` 6버전에서 지원하는 블룸 필터 검사 유틸리티를 활용하는 헬퍼 클래스를 `src/common/`에 추가합니다.
2. **Block Service 수정 (`src/block/`)**: 
   - WebSocket 큐에서 블록 헤더를 꺼내어 처리하는 로직(`processBlockQueue` 등)에서, 블록 헤더의 `logsBloom` 필드를 파싱합니다.
   - `.env`에 등록된 `CONTRACT_ADDRESSES` 및 타겟 토픽들을 대상으로 블룸 필터 매칭 검사를 수행합니다.
3. **조건부 Event Fetching (`src/contract/`)**: 
   - 블룸 필터 검사 결과가 `true` (존재할 가능성 있음)일 때만 기존의 `eth_getLogs` 호출을 실행하도록 `if` 분기를 추가합니다.
   - `false`일 경우 해당 블록의 이벤트 파싱 단계는 즉시 종료하고 다음 블록의 처리로 빠르게 넘어갑니다.

---

## 2. 옵션 2: WebSocket 기반 실시간 Reorg 감지 (Realtime Backtracing)

### 🔍 상세 차이점
- **현재 (PoC)**: Reorg 감지는 오직 60초마다 도는 Cron 워커에서 과거의 블록 해시들을 대조하는 방식(Polling)으로만 수행됩니다. 실시간 반응성이 떨어집니다.
- **Ponder**: 새로운 블록 헤더가 웹소켓으로 수신될 때마다, 직전 블록의 해시와 새 블록의 `parentHash`가 일치하는지 그 자리에서 즉시 대조합니다. 틀리다면 즉시 조상 블록을 찾아 역추적하여 실시간으로 정합성을 맞춥니다.

### 🛠️ 구현 및 변경 계획
1. **인메모리 상태 캐시 도입**: `BlockService` 클래스 내부에 최근에 수신/저장 완료된 마지막 블록의 번호와 해시를 기억하는 변수(`lastProcessedBlockHash`, `lastProcessedBlockNumber`)를 유지합니다.
2. **이벤트 리스너 검증 로직 추가 (`src/block/`)**:
   - `newHeads` 이벤트 발생 시 큐에서 블록을 꺼낼 때, 블록 번호가 이어짐에도 불구하고 `currentBlock.parentHash !== lastProcessedBlockHash` 인지 검사합니다.
3. **Reorg 역추적 및 복구 트리거 (`src/reorg/` 연동)**:
   - 해시 불일치가 감지되면 즉시 블록 수신 큐의 처리를 일시 정지(Pause)합니다.
   - RPC를 통해 `currentBlock`의 조상 해시를 거슬러 올라가며 DB의 데이터와 일치하는 '공통 조상(Common Ancestor)' 블록을 찾습니다. (While loop)
   - 분기된 잘못된 DB 레코드들의 상태를 `UNFINALIZED` 또는 무효 처리하고, `ReorgLog`를 즉각 발행한 뒤 인덱싱 큐를 재개합니다.

---

## 3. 옵션 3: 팩토리(Factory) 동적 주소 추적 기능

### 🔍 상세 차이점
- **현재 (PoC)**: 런타임에 모니터링 주소를 동적으로 추가할 수 없습니다. 오직 앱 구동 시작 시점의 `.env` 환경변수에 고정된 정적 주소만 검사합니다.
- **Ponder**: Factory 컨트랙트(예: Uniswap Pair를 생성하는 컨트랙트)의 이벤트를 감지하여, 생성된 자식(Child) 컨트랙트 주소를 인메모리 Watchlist에 즉시 추가해 다음 로그 수집부터 자동으로 포함시킵니다.

### 🛠️ 구현 및 변경 계획
1. **Dynamic Watchlist 상태 관리**: `src/contract/` 모듈 내부에 런타임에 동적으로 주소가 추가되는 `DynamicAddressRegistry` (Set 구조체)를 구현합니다. 서비스 재시작 시 휘발되는 것을 막기 위해 DB에 `dynamic_contracts` 테이블을 신설하여 상태를 영속화합니다.
2. **Factory 이벤트 핸들러 구현**:
   - `getLogs` 수행 후 로그를 제너릭하게 디코딩할 때, 해당 이벤트가 특정 팩토리의 `Created` (예: `PairCreated(address token0, address token1, address pair, uint)`) 이벤트인지 검사하는 인터셉트 로직을 추가합니다.
3. **동적 필터 머지(Merge) 적용**: 
   - 매칭될 경우 생성된 `pair` 주소를 DB와 인메모리 Registry에 추가합니다.
   - 이후 블록의 `getLogs` 필터 파라미터 구성 시 기본 `.env` 주소 배열에 동적 주소 배열을 병합하여 RPC를 호출합니다.

---

## 4. 옵션 4: 내부 트랜잭션 (Traces) 수집

### 🔍 상세 차이점
- **현재 (PoC)**: 스마트 컨트랙트가 `emit Event()` 형태로 명시적으로 방출한 로그(Logs)만 수집합니다. 컨트랙트 내부에서 이더를 송금하거나 다른 컨트랙트를 호출하는 등의 보이지 않는 내부 호출(Internal Calls)은 추적할 수 없습니다.
- **Ponder**: `debug_traceBlockByHash` 또는 `trace_block` RPC를 병렬로 호출하여 내부 트랜잭션의 실행 흐름과 상태 변경을 전부 수집합니다.

### 🛠️ 구현 및 변경 계획
1. **DB 스키마 확장 (`src/contract/`)**: 기존 `contract_event_records` 외에 `internal_transaction_records` 등 Trace 데이터를 담을 신규 Entity와 테이블을 추가로 설계합니다.
2. **동기화 로직 병렬화 (`src/block/`)**: 블록 수신 시 `eth_getLogs`와 함께 `debug_traceBlockByHash` (또는 `debug_traceTransaction`) API를 병렬(Promise.all)로 호출하는 로직을 추가합니다.
3. **인프라 제약 조건(Toggle) 추가**: 
   - 이 기능을 위해서는 일반 Full Node가 아닌 아카이브 노드(Archive Node) 또는 Trace API가 활성화된 고비용의 노드 인프라가 필수적입니다.
   - 따라서 시스템 환경 변수에 `ENABLE_TRACE_SYNC=true` 옵션을 두어, 사용자가 선택적으로만 켤 수 있게 유연한 아키텍처를 구성해야 합니다.
