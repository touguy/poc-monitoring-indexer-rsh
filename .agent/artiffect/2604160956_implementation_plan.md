# 특정 컨트랙트 이벤트 수집 및 통합 동기화 설계안 (수정)

사용자 피드백을 반영하여, 여러 종류의 이벤트를 단일 테이블에서 제너릭하게 관리하고, 블록 수집 시점에 이벤트(Logs)도 함께 가져오도록 설계를 변경합니다.

## User Review Required

> [!IMPORTANT]
> **제너릭 컬럼 매핑**: `Transfer` 외의 다른 이벤트가 추가될 경우를 대비해 `arg1`, `arg2`, `val1` 등의 컬럼을 어떻게 활용할지 정의가 필요합니다. 본 안에서는 `Transfer(from, to, value)`를 `arg1(from), arg2(to), val1(value)`로 매핑하는 것을 기본으로 합니다.
>
> **동기화 성능**: 블록마다 `getLogs`를 개별 호출하게 되므로, 대량의 블록 동기화 시 RPC 호출 수가 2배로 증가합니다. 속도 저하를 방지하기 위해 딜레이 설정을 유지합니다.

## Proposed Changes

### 1. 데이터베이스 스키마 수정 (`init.sql` 및 Entity)
JSON 형식을 배제하고 개별 컬럼을 갖는 단일 테이블 `contract_event_records`를 정의합니다.

#### [NEW] `src/contract/entity/contract-event.entity.ts`
- **Metadata**: `id`, `transactionHash`, `blockNumber`, `logIndex`, `contractAddress`, `eventName`, `timestamp`
- **Generic Data Columns**:
  - `arg1`: VARCHAR (주소 또는 문자열 파라미터 1)
  - `arg2`: VARCHAR (주소 또는 문자열 파라미터 2)
  - `arg3`: VARCHAR (주소 또는 문자열 파라미터 3)
  - `val1`: NUMERIC (숫자형 파라미터 1 - 양, 금액 등)
  - `val2`: NUMERIC (숫자형 파라미터 2)

### 2. 블록 서비스 통합 동기화 로직
블록을 가져오는 시점에 로그도 함께 가져오도록 기존 `BlockService`를 수정합니다.

#### [MODIFY] [block.service.ts](file:///home/touguy/dev/poc-monitoring-indexer-rsh/src/block/service/block.service.ts)
- `saveBlocksInRange(start, end)` 메서드 내부 수정:
  1. 블록 데이터(RPC) 조회
  2. 해당 블록 번호에 대한 컨트랙트 로그(`getLogs`) 조회
  3. 블록 데이터 저장
  4. 로그 파싱 및 `contract_event_records` 저장
- `handleNewBlock(blockNumber)` 메서드에도 동일한 로직 적용

### 3. Contract 도메인 로직 (Parsing)
#### [NEW] `src/contract/service/contract-event.service.ts`
- `parseAndSaveLogs(logs: ethers.Log[], timestamp: Date)`:
  - `ethers.Interface`로 ABI 디코딩
  - `Transfer` 이벤트인 경우: `args[0]` -> `arg1`, `args[1]` -> `arg2`, `args[2]` -> `val1` 매핑
  - 엔티티 변환 후 DB 저장

### 4. 환경 변수 및 ABI 설정
- `.env`에 `MONITOR_CONTRACTS` (JSON 또는 쉼표 구분 리스트) 및 대상 토픽 설정
- `ContractService` 내부에 파싱을 위한 최소 ABI 정의

## Open Questions

- **멀티 컨트랙트 처리**: `.env`에 여러 개의 컨트랙트와 토픽이 설정될 경우, 각 블록마다 모든 컨트랙트에 대해 `getLogs`를 루프로 돌릴지, 아니면 하나의 `getLogs` 필터로 묶어서 처리할지 결정이 필요합니다. (RPC 효율성을 위해 필터 배열 사용 권장)

## Verification Plan

### Automated Tests
- 초기 동기화(`syncInitialBlocks`) 실행 시 블록과 함께 이벤트 로그가 누락 없이 DB에 저장되는지 확인하는 통합 테스트

### Manual Verification
- 테스트 컨트랙트의 최근 `Transfer` 내역을 RPC 결과와 현재 DB의 `arg1`, `arg2`, `val1` 컬럼 데이터와 대조
