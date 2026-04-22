# Ponder Core vs PoC Monitoring Indexer 통신 아키텍처 비교 분석

본 문서는 오픈소스 Ponder의 인덱서(`core` 모듈)와 `poc-monitoring-indexer-rsh` 간의 블록체인 노드 통신(WebSocket, JSON-RPC) 방식을 비교한 표입니다. 이 비교를 통해 두 시스템 간의 차이점을 도출하고, PoC 인덱서에 추가로 이식할 수 있는 최적화 요소를 제안합니다.

## 📊 1. RPC/WS 함수 활용 비교표

| 기능 분류 | 오픈소스 Ponder (`core`) | `poc-monitoring-indexer-rsh` (현재 버전) | 비교 및 차이점 분석 |
| :--- | :--- | :--- | :--- |
| **블록 감지 (Realtime)** | `eth_subscribe('newHeads')`<br>*(단, WS 연결 해제 시 HTTP Polling으로 자동 전환)* | `provider.on('block')`<br>*(ethers의 WS 기능 사용)* | Ponder는 WS를 지원하지 않거나 연결이 불안정한 노드를 대비해 **HTTP Polling Fallback(이중화)** 매커니즘을 내장하고 있습니다. 반면 PoC는 WS 연결이 끊어지면 재연결이 지연될 경우 블록 수집이 일시 중단될 수 있습니다. |
| **블록/헤더 상세 조회** | `eth_getBlockByNumber`<br>`eth_getBlockByHash` | `eth_getBlockByNumber` | 두 시스템 모두 동일한 메서드를 사용합니다. 단, Ponder는 내부 큐잉 시스템을 통해 불필요한 중복 조회를 완벽히 차단합니다. (PoC는 최근 옵션 6 도입으로 LRU 캐시를 붙여 유사한 수준을 달성했습니다.) |
| **과거 이벤트 대량 수집** | `eth_getLogs` (초거대 범위 지정)<br>*+ 에러 시 사이즈 절반 축소 (Dynamic Chunking)* | `eth_getLogs`<br>*(옵션 5: Promise.all + Dynamic Chunking)* | 최근 옵션 5 반영을 통해 PoC도 Ponder와 거의 동일한 스마트 범위 쪼개기 방식을 구사하게 되었습니다. |
| **영수증(Receipts) 조회** | `eth_getBlockReceipts`<br>*+ (미지원 노드 시 `eth_getTransactionReceipt` 병렬 호출 Fallback)* | **미사용** | Ponder는 단순 로그뿐 아니라, 해당 트랜잭션의 실제 성공 여부(Revert)나 가스비(Gas Used) 등 메타데이터 검증을 위해 영수증을 모두 긁어와 병합합니다. PoC는 초경량화를 위해 Receipt 조회를 생략했습니다. |
| **내부 트랜잭션(Traces)** | `debug_traceBlockByHash`<br>`trace_block` | `debug_traceBlockByHash`<br>*(옵션 4: Trace bulk 수집 기능)* | 최근 옵션 4 반영을 통해 PoC도 동일한 기능을 지원합니다. |
| **네트워크 전송 계층**<br>**(Transport Layer)** | JSON-RPC **배치 요청 (Batching)** 지원<br>*+ Rate Limit, Backoff 재시도 관리* | 단순 `Promise.all` 병렬 호출<br>*+ `retryOperation` (지수 백오프)* | Ponder는 50개의 블록을 물어볼 때 50번의 HTTP 통신을 하지 않고, 1번의 HTTP 통신에 50개의 쿼리를 배열(`[{}, {}, ...]`)로 담아 보내는 **Batch RPC** 기법을 사용하여 네트워크 오버헤드를 극적으로 줄입니다. |

---

## 💡 2. PoC 모니터링 인덱서 개선 제안 (추가 도입 추천 사항)

위 비교표를 바탕으로, 현재 PoC 인덱서에 적용할 경우 가성비(적은 코드 변경 대비 높은 안정성/성능 향상)가 뛰어난 2가지 추가 개선안(옵션 7, 8)을 도출했습니다.

### 제안 1. [옵션 7] WS 단절 대비 HTTP Polling Fallback (실시간 감지 이중화)
- **도입 배경**: 현재 `poc-monitoring-indexer-rsh`는 새 블록을 감지할 때 오직 WebSocket(`BlockchainWsService`)의 이벤트에만 의존합니다. 만약 노드의 WS 서버가 재부팅되거나 소켓이 조용히 끊어지면(Zombie Socket), 시스템이 멈춘 것처럼 보이게 됩니다.
- **Ponder의 방식**: WS 연결과 별개로 짧은 주기(예: 3초~5초)의 `eth_blockNumber` HTTP 폴링을 동시에 돌려, WS 이벤트가 도착하지 않았는데 HTTP상 최신 블록이 올라갔다면 폴링 쪽에서 대신 큐에 블록 번호를 집어넣는 이중화 방식을 채택합니다.
- **기대 효과**: 노드의 웹소켓 불안정성으로부터 시스템을 완전히 격리시켜 **무중단 인덱싱(Zero-Downtime Indexing)** 보장.

### 제안 2. [옵션 8] JSON-RPC Batching 활성화 (통신 부하 극소화)
- **도입 배경**: 앞서 적용한 대량 동기화(Bulk Chunking) 덕분에 50개 단위로 `Promise.all` 병렬 수집이 가능해졌지만, 근본적으로 **50번의 TCP/HTTP 커넥션**이 생성되는 것은 동일합니다.
- **Ponder의 방식**: Ethers나 Viem이 지원하는 Batching 기능을 이용해 여러 개의 `getBlock` 요청을 단 1개의 HTTP Payload 안에 묶어서 보냅니다.
- **적용 방안**: `BlockchainRpcService` 생성 시 사용하는 `ethers.JsonRpcProvider` 인스턴스에 `{ batchMaxCount: 50, staticNetwork: true }` 옵션을 추가하기만 하면 즉시 적용됩니다.
- **기대 효과**: 단 1줄의 설정 추가로 초기 동기화 시 노드에 가해지는 TCP 커넥션 부하가 1/50로 줄어들어 **Rate Limit 에러 발생 확률이 현저히 감소**합니다.

---

> [!TIP]
> 위 제안 내용(옵션 7, 8) 중 마음에 드시는 부분이 있다면 추가 작업 진행을 지시해 주세요! 코드는 건드리지 않고 이 분석 문서만 생성해 두었습니다.
