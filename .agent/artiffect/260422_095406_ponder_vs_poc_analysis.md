# Ponder Core vs PoC Monitoring Indexer 기능 비교 및 도입 제안

본 문서는 오픈소스 인덱서인 **Ponder Core**의 아키텍처(특히 RPC, WS 및 실시간 동기화/Reorg 처리 부분)와 사용자 정의 경량 인덱서인 **PoC Monitoring Indexer (RSH)**의 설계(BUSINESS_LOGIC.md 기준)를 비교 분석한 결과입니다. 

이를 바탕으로 향후 PoC 버전에 추가 도입할 수 있는 Ponder의 우수한 기능들을 제안합니다.

---

## 1. 핵심 아키텍처 및 철학 비교

| 구분 | Ponder Core (`core/src/sync-realtime`) | PoC Monitoring Indexer (`poc-monitoring-indexer-rsh`) |
| --- | --- | --- |
| **목적** | 범용적이고 고성능의 블록체인 상태 인덱싱 프레임워크 | 특정 도메인(Reorg 감지 및 지정된 컨트랙트 이벤트 로깅)에 최적화된 경량 백엔드 |
| **동기화 방식** | 과거 블록(Historical)과 실시간 블록(Realtime)의 완벽한 분리 및 병렬 처리 | 단일 큐 기반의 순차 처리 및 Gap 스윕(Sweep) 방식 (의도적인 100ms 지연) |
| **데이터 범위** | Blocks, Logs, Traces(내부 트랜잭션), Receipts | Blocks, Logs (제너릭 DB 컬럼 분해 저장) |

---

## 2. 상세 기능 비교 분석

### A. 실시간 블록 수신 및 큐(Queue) 처리
- **Ponder Core**: WebSocket으로 새 블록 헤더를 수신하면, 즉각적으로 비동기 병렬 요청(`eth_getBlockByHash`, `eth_getLogs`, `debug_traceBlockByHash`)을 발생시킵니다. 메모리 내에서 매우 빠른 속도로 데이터를 조립하고 정합성을 검증합니다.
- **PoC Indexer**: Race Condition(트랜잭션 꼬임)을 원천 차단하기 위해 단일 메모리 배열 큐(`blockQueue`)에 적재하고, 워커가 **단일 스레드(Single-thread)**로 하나씩 Pop하여 순차 처리합니다. RPC Rate Limit을 고려한 재시도 딜레이(1초)가 강제되어 안정성을 최우선으로 합니다.

### B. 스마트 컨트랙트 이벤트(Log) 필터링
- **Ponder Core**: **블룸 필터(Bloom Filter)**를 적극 활용합니다. 블록 헤더에 포함된 `logsBloom` 값을 로컬에서 먼저 연산하여, 관심 있는 컨트랙트 주소나 토픽이 해당 블록에 존재할 가능성이 없을 경우 `eth_getLogs` RPC 호출 자체를 생략(Skip)하여 네트워크 I/O를 극적으로 절약합니다.
- **PoC Indexer**: 블룸 필터 판별 없이, 수신된 블록 번호에 대해 무조건 1회의 `eth_getLogs`를 요청합니다. 환경 변수에 정의된 주소와 토픽을 묶어 요청한 뒤, 결과를 `ethers.Interface`로 디코딩하여 DB 파티셔닝 컬럼(`arg1`, `arg2`, `val1` 등)에 저장합니다.

### C. Chain Reorg (체인 재조직) 감지 및 복구
- **Ponder Core (Realtime Backtracing)**: 새 블록이 들어올 때마다 로컬 메모리의 `unfinalizedBlocks` 상태와 `parentHash`를 즉시 대조합니다. 해시가 끊어지는 지점(Reorg)을 발견하면 공통 조상(Common Ancestor) 블록까지 역추적(While loop)하여 상태를 롤백하는 **실시간(Event-driven) 복구 메커니즘**을 가집니다.
- **PoC Indexer (Polling Batch)**: 60초 주기의 **Cron Job 스케줄러**에 의존합니다. 주기적으로 DB의 `UNFINALIZED` 블록들을 RPC 노드와 대조하여 해시가 다르면 Reorg로 판별하고 상태를 덮어씁니다. 실시간성은 떨어지지만 로직이 매우 단순하고 견고합니다.

### D. 동적 컨트랙트 (Factory Pattern) 지원
- **Ponder Core**: `Factory` 컨트랙트가 새로운 자식(Child) 컨트랙트를 배포하는 이벤트를 실시간으로 파싱하여, 자식 컨트랙트의 주소를 동적으로 감시 목록(Watchlist)에 추가하고 해당 이벤트를 즉시 인덱싱합니다.
- **PoC Indexer**: `.env`에 하드코딩된 정적 주소(`CONTRACT_ADDRESSES`)만을 모니터링합니다.

---

## 3. PoC Indexer에 도입 가능한 Ponder 기능 제안 (선택 사항)

사용자 분께서는 다음 기능 중 필요한 것을 선택하여 기존 `poc-monitoring-indexer-rsh`에 추가 개발을 진행할 수 있습니다. (기존의 안정성을 해치지 않는 선에서 도입 가능한 순서로 나열했습니다.)

### 🟢 옵션 1. 블룸 필터(Bloom Filter)를 이용한 RPC 최적화 (추천도: ⭐⭐⭐⭐⭐)
- **개요**: 블록 수신 시 무조건 `getLogs`를 호출하지 않고, 블록 헤더의 `logsBloom`을 ethers.js를 통해 검사하여 타겟 이벤트가 포함되어 있을 때만 RPC를 호출합니다.
- **기대 효과**: 비어있는 블록에 대한 불필요한 RPC 요청이 90% 이상 감소하여 노드 트래픽 비용 및 Rate Limit 부담이 획기적으로 줄어듭니다.

### 🟡 옵션 2. 실시간 Reorg 감지 (WebSocket 연계) (추천도: ⭐⭐⭐⭐)
- **개요**: 60초 폴링에만 의존하지 않고, Phase 1의 WebSocket 블록 수신 단계에서 이전 블록의 해시와 현재 블록의 `parentHash`가 일치하는지 검증하는 로직을 추가합니다.
- **기대 효과**: Reorg 발생 시 60초를 기다리지 않고 즉각적으로 감지하여 DB 상태를 보정하고 알림을 발생시킬 수 있습니다.

### 🟡 옵션 3. 팩토리(Factory) 동적 주소 추적 기능 (추천도: ⭐⭐⭐)
- **개요**: 특정 컨트랙트(예: Uniswap V2/V3 Factory)에서 발생하는 `PairCreated` 이벤트를 감지하면, 생성된 Pair 주소를 런타임 메모리나 DB에 캐싱하여 해당 주소에서 발생하는 이벤트도 자동으로 `getLogs` 필터에 포함시킵니다.
- **기대 효과**: 동적으로 생성되는 디파이(DeFi) 풀이나 NFT 컨트랙트들을 재시작 없이 실시간으로 추적 가능해집니다.

### 🟠 옵션 4. 내부 트랜잭션(Traces) 수집 기능 (추천도: ⭐⭐)
- **개요**: 이벤트 로그(Log)로는 남지 않지만 이더리움 상태를 변경시키는 내부 호출(Internal Calls, 예: 스마트 컨트랙트 내에서의 이더 전송)을 `debug_traceBlockByHash` RPC를 이용해 수집합니다.
- **기대 효과**: 이더(ETH) 전송 내역이나 복잡한 컨트랙트 내부 로직의 실행 흐름을 완벽하게 추적할 수 있습니다. (단, 노드에서 아카이브/디버그 API를 지원해야 함)

---
*위 분석 문서를 참고하시어 도입을 희망하시는 옵션(예: "옵션 1번 블룸 필터 기능을 추가해줘")을 말씀해 주시면, 안전하게 코드를 업데이트해 드리겠습니다.*
