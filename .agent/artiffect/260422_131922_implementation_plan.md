# Ponder 심화 최적화 기능 (Phase 4) 적용 계획

사용자님의 지시에 따라 **[옵션 9] WebSocket Block Header 활용 최적화** 기능을 구현합니다. 이 기능은 실시간 블록 수신 시 RPC 호출을 최소화하여 성능을 향상시키는 것을 목표로 합니다.

## 🔍 기능 분석 (WS Block Header Optimization)
현재 `BlockService`는 WebSocket에서 블록 번호만 수신하고, 상세 데이터(해시, 부모 해시 등)를 얻기 위해 즉시 `eth_getBlockByNumber` RPC 요청을 보냅니다.
하지만 이더리움 노드는 `newHeads` 구독 시 이미 모든 핵심 헤더 정보(hash, parentHash, logsBloom, timestamp 등)를 전송합니다. 이를 활용하면 실시간 동기화 시 발생하는 추가적인 RPC 호출을 완전히 제거하거나 대폭 줄일 수 있습니다.

## Proposed Changes

### 1. `BlockchainWsService` 수정
- `onBlockHeader(callback)` 메서드를 추가합니다.
- 내부적으로 `ethers.WebSocketProvider`의 `websocket` 객체에 직접 `'message'` 리스너를 달아 `eth_subscription` (method: `newHeads`) 메시지를 가로채고 파싱하여 콜백으로 전달합니다.

### 2. `BlockService` 수정
- `blockQueue`의 타입을 `number[]`에서 `EthBlockHeader[]`로 변경하여 헤더 정보를 직접 담을 수 있게 합니다.
- `onModuleInit`에서 `wsService.onBlockHeader()`를 사용하도록 변경합니다.
- `handleNewBlock(header: EthBlockHeader)`로 시그니처를 변경합니다.
- `header`가 존재할 경우 RPC 호출 없이 즉시 `BlockRecord`를 생성하고 Reorg 검증을 수행합니다.

## Verification Plan
- 코드를 변경한 뒤 `npm run build`를 통해 인터페이스 정합성을 테스트합니다.
- 실시간 로그 출력을 통해 RPC 호출 없이 헤더 정보를 성공적으로 처리하는지 확인합니다. (디버그 로그 추가)
