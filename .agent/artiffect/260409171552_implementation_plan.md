# 목표
PRD.md 내용 변경에 따라, 웹소켓(Phase 1)의 역할을 순수 DB 저장(UNFINALIZED 강제 할당)으로 축소하고, Reorg 감지 및 Gap 복구 역할을 스케줄러(Phase 2)로 완전히 위임하는 아키텍처 리팩토링을 수행합니다.

## User Review Required
> [!IMPORTANT]
> 백그라운드 갭(Gap) 동기화는 순차 처리(await)로 진행하여 Rate Limit 방어 원칙을 준수하고자 합니다. 스케줄러 내부 루프가 길어질 경우를 대비해 설정된 `isPolling` 락(Lock) 메커니즘이 있으므로 안전합니다. 계획이 승인되면 코드를 수정하겠습니다.

## 변경 제안 내용

### `src/block/service/block.service.ts`

#### 1. 웹소켓 수신 (Phase 1) 로직 단순화
- 메소드: `handleNewBlock(blockNumber: number)`
- **삭제 대상**:
  - 기존 DB 최신 블록을 조회하는 `this.blockRecordRepo.getLatestBlock()` 호출 부분.
  - 중복 수신 체크 조건문(`latestBlock.blockNumber >= blockNumber`).
  - 부모 노드 해시 기반 실시간 Reorg 감지 로직 (`parentHash` 일치 비교 부분).
  - 갭 감지 범위 계산 및 Fire & Forget 방식의 `saveBlocksInRange` 호출 부분.
- **수정 목표**: HTTP RPC로 최대 5회 상세 정보 조회에 성공하면, 곧바로 `BlockRecord`를 생성하고 `BlockStatus.UNFINALIZED` 속성을 주입한 뒤 단 한 줄의 `this.blockRecordRepo.saveBlock(...)`만으로 로직이 종료되게 축소시킵니다. (Upsert 처리로 위임)

#### 2. 크론 스케줄러 설정 주기 변경
- 메소드: `setupPollingCron()`
- 변경 대상: `POLLING_CRON_TIME` 기본값을 `'*/10 * * * * *'` (10초)에서 `'*/60 * * * * *'` (60초)로 PRD 스펙과 일치하도록 변경합니다.

#### 3. 폴링 스케줄러 (Phase 2) 검증 및 갭 복구 강화
- 메소드: `handlePollingValidation()`
- **기존 로직 유지 (REORG 검증)**: 조회한 `UNFINALIZED` / `SAFE` 블록들에 대하여 RPC 재조회로 해시값이 변동되었는지 체크하고 ReorgLog를 남기는 기능을 유지합니다.
- **신규 로직 추가 (체인 갭 감지)**:
  - Repository에서 불러온 미확정 블록들(`blocksToVerify`)은 내림차순(DESC) 정렬 배열입니다.
  - 이 배열을 순회하며 인접한 배열 값의 블록 번호를 뺍니다. (`blocksToVerify[i].blockNumber - blocksToVerify[i+1].blockNumber`)
  - 그 차이가 1보다 크다면 그 사이에 갭(Missing Range)이 발생한 것으로 판독합니다.
  - 판독된 누락 범위(Gap)를 찾아 `this.saveBlocksInRange(next+1, current-1)` 함수를 `await`로 비동기 호출합니다.
  - 채워진 블록들은 자동으로 `UNFINALIZED` 상태가 되어 다음 60초 폴링 때부터 Reorg 검사를 받기 시작하는 순환 구조가 형성됩니다.

## 자동화 테스트 / 검증 계획
### 수동 검증 방식
1. 애플리케이션 실행 후 터미널 로그 관찰.
2. WS 이벤트 수신 시 Reorg/Gap 검사가 일어나지 않고 직결 저장만 일어나는지 확인.
3. 60초 후 Cron이 돌 때, 'Gap 감지' 동작 및 누락분 수집, 변경 해시에 대한 'Reorg' 탐지가 정해진 순서대로 발생하는지 확인합니다.

<!-- 2026-04-09 17:51:27 갱신 내역 -->
---
### 🗓 [2026-04-09 17:51:27] 추가 수정 계획 (체인 갭 감지 SQL 최적화 반영)
- 사용자님의 제안에 따라 기존의 메모리 내 배열 반복(Array Iteration) 방식을 폐기하고, **데이터베이스 레벨의 Window 함수 기반 Raw SQL 성능 최적화 쿼리**로 곧바로 갭 구간을 찾아내도록 변경합니다.
- **`src/block/repository/block-record.repository.ts`**
  - 신규 메서드 `findMissingBlockGaps()` 추가:
    - TypeORM `query()`를 이용하여 제안받은 `LEAD()` 기반의 SQL문을 실행해 `missing_start`, `missing_end` 구간 리스트를 한 번에 바로 조회합니다.
- **`src/block/service/block.service.ts`** (폴링 스케줄러 갭 복구 업데이트)
  - 기존(위 3번) 구상했던 배열 뺄셈 로직 대신, `await this.blockRecordRepo.findMissingBlockGaps()`를 호출합니다.
  - 조회되어 리턴된 갭 구간 배열(`[{missing_start, missing_end}]`)을 반복문으로 순회합니다.
  - 찾은 갭들마다 `await this.saveBlocksInRange(missing_start, missing_end)`를 호출하여 동기화를 연달아 진행합니다.
