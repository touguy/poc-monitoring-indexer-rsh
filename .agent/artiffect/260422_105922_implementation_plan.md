# Ponder 심화 최적화 기능 (Phase 3) 적용 계획

사용자님의 지시에 따라 **(제안 2) JSON-RPC Batching 활성화**에 대한 단일 기능 변경 계획을 세우고 즉시 구현을 진행합니다.

## 🔍 기능 분석 (JSON-RPC Batching)
기존에 도입한 Option 5 (Bulk Chunking) 덕분에 병렬 요청은 가능해졌으나, `ethers`의 기본 `JsonRpcProvider`는 각 `getBlockByNumber` 등 요청을 개별 HTTP 커넥션으로 전송합니다. 이는 네트워크 I/O 병목을 유발합니다.
이를 해결하기 위해 Ponder가 사용하는 Batch 기법처럼 `ethers`의 기본 옵션인 `batchMaxCount`를 설정하여 1개의 HTTP 요청 안 배열 형태로 여러 RPC 쿼리를 묶어서(Batch) 보내도록 최적화합니다.

## Proposed Changes

### [MODIFY] `src/blockchain/service/blockchain-rpc.service.ts`
- `JsonRpcProvider` 초기화 부분의 세 번째 인자인 `options` 파라미터에 다음 설정을 추가합니다:
  - `batchMaxCount: 50` (최대 50개의 요청을 하나의 HTTP 통신으로 병합)
  - `staticNetwork: true` (불필요한 체인 ID 확인 요청(eth_chainId) 생략 최적화)

## Verification Plan
- 코드를 변경한 뒤 `npm run build`를 통해 인터페이스 정합성을 테스트합니다.
