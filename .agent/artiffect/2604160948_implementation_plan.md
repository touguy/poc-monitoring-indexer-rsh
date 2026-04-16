# 특정 컨트랙트 이벤트(Logs) 수집 및 파싱 저장 제안서

이더리움 블록 내의 특정 컨트랙트 이벤트를 `getLogs`를 통해 가져오고, 이를 파싱하여 JSON이 아닌 개별 컬럼 형태로 데이터베이스에 저장하는 기능을 구현합니다.

## User Review Required

> [!IMPORTANT]
> **대상 이벤트 선정**: 제안서에서는 흔히 사용되는 ERC20 `Transfer` 이벤트를 예시로 작성하였습니다. 다른 이벤트 혹은 다수의 이벤트를 처리해야 하는 경우 설계를 확장해야 합니다.
>
> **ABI 관리 방식**: 이벤트를 파싱하기 위해서는 해당 컨트랙트의 ABI(또는 인터페이스 정의)가 필요합니다. 코드 내 상수로 정의할지, 외부 파일에서 관리할지 결정이 필요합니다.

## Proposed Changes

### 1. 환경 변수 확장 (.env)
특정 컨트랙트 주소와 감시할 이벤트의 토픽을 설정합니다.

- `MONITOR_CONTRACT_ADDRESS`: 감시할 스마트 컨트랙트 주소
- `MONITOR_TRANSFER_TOPIC`: `Transfer(address,address,uint256)` 이벤트의 토픽 해시

### 2. Blockchain 도메인 확장
`BlockchainRpcService`에 `getLogs` 기능을 추가합니다.

#### [MODIFY] [blockchain-rpc.service.ts](file:///home/touguy/dev/poc-monitoring-indexer-rsh/src/blockchain/service/blockchain-rpc.service.ts)
- `getLogs(filter: ethers.Filter): Promise<ethers.Log[]>` 메서드 추가
- 기존 `retryOperation`을 활용하여 안정적인 통신 보장

### 3. Contract 도메인 신설 (Event Monitoring)
이벤트 수집 및 파싱 로직을 담당할 신규 모듈을 생성합니다.

#### [NEW] `src/contract/entity/transfer-event.entity.ts`
- `BaseEntity` 상속
- 컬럼 구성:
    - `transactionHash`: 트랜잭션 해시 (index)
    - `blockNumber`: 블록 번호 (index)
    - `logIndex`: 로그 인덱스 (Composite PK 후보)
    - `from`: 보낸 사람 주소
    - `to`: 받는 사람 주소
    - `amount`: 전송 금액 (DECIMAL 또는 BIGINT 사용)
    - `timestamp`: 블록 시간

#### [NEW] `src/contract/service/contract-event.service.ts`
- `ethers.Interface`를 사용하여 로그 파싱
- `saveTransferLogs(blockNumber: number)`: 특정 블록의 로그를 조회하여 파싱 후 엔티티 저장

### 4. 블록 동기화와 통합
블록이 DB에 저장되는 시점에 해당 블록의 로그도 함께 수집하도록 연동합니다.

#### [MODIFY] [block.service.ts](file:///home/touguy/dev/poc-monitoring-indexer-rsh/src/block/service/block.service.ts)
- `handleNewBlock` 및 `saveBlocksInRange` 로직 하단에 `contractEventService.saveTransferLogs(blockNumber)` 호출 추가
- 블록 데이터와 이벤트 데이터의 정합성 유지

## Open Questions

- **다양한 이벤트 처리**: 현재는 `Transfer` 예시 하나만 고려하고 있습니다. 향후 여러 종류의 이벤트를 처리해야 한다면, Generic한 엔티티 구조를 가질지 아니면 이벤트별 테이블을 분리할지 결정해야 합니다. (사용자 요청은 컬럼 분해이므로 테이블 분리가 유리해 보임)
- **과거 데이터 소급**: 초기 동기화 시(`syncInitialBlocks`)에도 과거 로그를 모두 긁어올지 여부.

## Verification Plan

### Automated Tests
- `BlockchainRpcService.getLogs` 호출 테스트 (실제 RPC 노드 응답 확인)
- `ethers.Interface`를 이용한 모의 로그 파싱 테스트 (args 추출 정확도 확인)

### Manual Verification
- 고빈도 트랜잭션이 발생하는 컨트랙트(예: Sepolia USDT) 주소를 설정하여 DB에 컬럼별로 데이터가 잘 들어오는지 확인
