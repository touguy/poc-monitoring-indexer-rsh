# 블록체인 / ethers.js 규칙

## Provider 관리
- `JsonRpcProvider`와 `WebSocketProvider` 인스턴스는 `BlockchainService`에서만 생성.
- 다른 서비스에서 Provider가 필요하면 `BlockchainService`를 주입하여 `getHttpProvider()` / `getWsProvider()` 사용.
- Provider는 `OnModuleInit`에서 초기화, `OnModuleDestroy`에서 정리(destroy).

## 데이터 타입
- 블록 번호, 트랜잭션 해시, 토큰 amount 등은 DB 저장 시 `string` 사용:
  ```typescript
  // ✅
  blockNumber: log.blockNumber.toString()
  rawAmount: value.toString()

  // ❌ BigInt는 JSON 직렬화 불가
  rawAmount: value  // type: bigint
  ```
- ethers.js에서 반환되는 주소는 항상 `.toLowerCase()` 정규화 후 저장.

## 이벤트 조회 패턴
```typescript
// 청크 분할 조회 (RPC 제한 회피)
for (let start = fromBlock; start <= toBlock; start += chunkSize) {
  const end = Math.min(start + chunkSize - 1, toBlock);
  const logs = await contract.queryFilter(filter, start, end);
}
```
- 기본 청크 크기: `2000 blocks` (RPC 제한에 따라 조정)
- `eth_getLogs` 단일 호출 범위 제한 준수.

## 실시간 구독
- WebSocket provider가 있으면 실시간 구독에 사용, 없으면 HTTP fallback.
- 이벤트 핸들러에서 DB 직접 쓰기 금지 → 버퍼에 쌓고 `@Cron`으로 batch flush.
- 모듈 종료 시 `contract.removeAllListeners()` 호출 필수.

## RPC 재시도 전략
- RPC 실패 시 지수 백오프 적용:
  ```typescript
  // 재시도 간격: 1s → 2s → 4s → 8s (최대 4회)
  const delay = Math.pow(2, attempt) * 1000;
  ```
- 429 (rate limit), 503 (temporary unavailable) 에러는 재시도.
- 400 (bad request), 404 에러는 재시도하지 않음.

## 보안 규칙
- Private key, API key, RPC URL을 코드에 하드코딩 금지.
- 항상 환경 변수(`ConfigService`) 경유.
- `STABLECOIN_CONTRACTS` 파싱 시 주소 형식 검증 (ethers.js `isAddress()` 사용).

## 컨트랙트 주소
- 저장/비교 시 항상 lowercase hex: `address.toLowerCase()`
- checksum 주소가 필요한 경우: `ethers.getAddress(addr)` 사용.

## 블록 타임스탬프
- 타임스탬프 일괄 조회는 `Promise.allSettled()`로 부분 실패 허용:
  ```typescript
  const results = await Promise.allSettled(
    blockNumbers.map(n => provider.getBlock(n))
  );
  ```
