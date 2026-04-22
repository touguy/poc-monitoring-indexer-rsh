# 데이터베이스 스키마 명세서 (DB Schema Spec)

이 문서는 PoC Monitoring Indexer 시스템의 영속성 관리를 위한 데이터베이스 스키마와 구조를 설명합니다. 이 문서를 바탕으로 모든 TypeORM 엔티티가 구성됩니다.

---

## 1. 전역 기본 규칙
1. **마이그레이션 정책**: 
   - 이 프로젝트는 데이터 정합성을 위해 TypeORM의 `synchronize: true` 사용을 원칙적으로 금지합니다.
   - `init.sql` 등 스크립트를 통한 명시적인 관리를 통해 예측 가능성을 보장해야 합니다.
2. **BaseEntity 상속**: 
   - 시스템의 모든 주요 엔티티 테이블은 다음 3가지 컬럼을 필수적으로 가지며, 이를 `BaseEntity` 클래스로 모듈화하여 상속받아 사용합니다.
     - `del_yn` (VARCHAR(1), 기본값 'N'): 논리 삭제 여부 플래그
     - `sys_reg_dtm` (TIMESTAMP, 기본값 CURRENT_TIMESTAMP): 데이터 최초 삽입 시간
     - `sys_upd_dtm` (TIMESTAMP): 데이터의 마지막 수정 시간

---

## 2. 테이블 상세 명세

### 2.1. `block_records` (블록 레코드 이력 테이블)
이더리움 네트워크에서 수집한 블록 데이터를 저장하고 블록의 확정(Finality) 상태를 지속적으로 모니터링하기 위한 테이블입니다.

| 컬럼명 | 데이터 타입 | PK 여부 | Null 속성 | Default 옵션 | 상세 설명 |
|---|---|---|---|---|---|
| `block_number` | `INTEGER` | O (PK) | NOT NULL | - | 기준 수집 블록 번호 |
| `block_hash` | `VARCHAR(66)` | - | NOT NULL | - | 현재 블록의 고유 해시값 |
| `parent_hash` | `VARCHAR(66)` | - | NOT NULL | - | 직전 부모 블록의 해시값 (Reorg 판별 핵심 키) |
| `status` | `VARCHAR(20)` | - | NOT NULL | 'UNFINALIZED' | 블록 확정 상태. **(UNFINALIZED, SAFE, FINALIZED)** 3개만 허용하는 chk constraint 적용 |
| `timestamp` | `TIMESTAMP` | - | NOT NULL | - | 블록이 이더리움 체인 상에 민팅된 시간 |

- **생성 인덱스(Indexes)**:
  - `idx_block_records_status`: `status` 단일 인덱스 (크론잡의 UNFINALIZED 스윕 서치를 위함)
  - `idx_block_records_block_number_status`: 결합 인덱스 (특정 블록의 확정 상태 판단용)

### 2.2. `reorg_logs` (체인 재조직 이상 수집 로그 테이블)
시스템이 WS 메모리 큐 또는 주기적 Polling 검증을 통해 Reorg 발생을 감지할 때마다 증거를 보존하는 테이블입니다.

| 컬럼명 | 데이터 타입 | PK 여부 | Null 속성 | Default 옵션 | 상세 설명 |
|---|---|---|---|---|---|
| `id` | `BIGSERIAL` | O (PK) | NOT NULL | 자동증가 | 로그 고유 식별자 |
| `detected_at` | `TIMESTAMP` | - | NOT NULL | CURRENT_TIMESTAMP | Reorg가 최초 시스템에 의해 감지된 현재 시간 |
| `block_number` | `INTEGER` | - | NOT NULL | - | Reorg가 감지되었던 해당 분기점 블록 번호 |
| `old_hash` | `VARCHAR(66)` | - | NULL | - | 변경 전(DB에 원래 있었던) 버려진 체인의 블록 해시값 |
| `new_hash` | `VARCHAR(66)` | - | NOT NULL | - | 대체되어 이긴(Winning) 체인의 새로운 블록 해시값 |
| `message` | `TEXT` | - | NOT NULL | - | Reorg가 발생한 트리거 내용(실시간 큐 트리거인지, 폴링 검증인지 부연설명) |

- **생성 인덱스(Indexes)**:
  - `idx_reorg_logs_block_number`: 특정 블록 대역별로 발생한 Reorg 빈도 조회용
  - `idx_reorg_logs_detected_at`: 최신순 내림차순(DESC) 리스트업 성능업을 위한 인덱스

### 2.3. `contract_event_records` (스마트 컨트랙트 이벤트 제너릭 로그 테이블)
설정된 `MONITOR_CONTRACTS` 환경 변수에 해당하는 대상 스마트 컨트랙트에서 방출된 실시간 이벤트 정보들을 수집 및 저장하는 단일 통합 테이블입니다. JSON 구조를 탈피하고 제너릭 컬럼을 통해 데이터를 파티셔닝/분해하여 저장합니다.

| 컬럼명 | 데이터 타입 | PK 여부 | Null 속성 | Default 옵션 | 상세 설명 |
|---|---|---|---|---|---|
| `id` | `BIGSERIAL` | O (PK) | NOT NULL | 자동증가 | 이벤트 로그 고유 식별 번호 |
| `transaction_hash` | `VARCHAR(66)` | - | NOT NULL | - | 이벤트를 발생시킨 트랜잭션 해시값 |
| `block_number` | `INTEGER` | - | NOT NULL | - | 해당 이벤트(트랜잭션)가 포함된 블록 번호 |
| `log_index` | `INTEGER` | - | NOT NULL | - | 블록 내 트랜잭션 영수증의 Log 인덱스 번호 |
| `contract_address`| `VARCHAR(42)` | - | NOT NULL | - | 이벤트를 발생시킨 스마트 컨트랙트 주소 |
| `event_name`   | `VARCHAR(255)`| - | NOT NULL | - | 파싱된 이벤트명 (예: 'Transfer') |
| `arg1`         | `VARCHAR(255)`| - | NULL     | - | 제너릭 문자열 인자 1 (주로 from 주소 등) |
| `arg2`         | `VARCHAR(255)`| - | NULL     | - | 제너릭 문자열 인자 2 (주로 to 주소 등) |
| `arg3`         | `VARCHAR(255)`| - | NULL     | - | 제너릭 문자열 인자 3 |
| `val1`         | `NUMERIC`     | - | NULL     | - | 제너릭 숫자형 인자 1 (주로 amount, value 등) |
| `val2`         | `NUMERIC`     | - | NULL     | - | 제너릭 숫자형 인자 2 |

- **생성 인덱스(Indexes)**:
  - `idx_contract_event_records_block_number`: 특정 블록 대역의 이벤트 쿼리 및 파생된 Reorg 발생 시 이벤트 무효화 작업 연계를 위한 인덱스
  - `idx_contract_event_records_txn_hash`: 트랜잭션 해시 단위 단건 조회용 인덱스
  - `idx_contract_event_records_contract_event`: 컨트랙트 주소 및 이벤트명 기반 빠른 필터링을 위한 복합 인덱스
  - `idx_contract_event_records_arg1`, `idx_contract_event_records_arg2`: 주요 주소 기반 빠른 검색을 위한 개별 인덱스
