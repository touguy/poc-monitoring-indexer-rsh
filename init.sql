-- init.sql

-- 2026-04-07 08:51:02 추가: Chain Reorg 모니터링 스키마

CREATE TABLE IF NOT EXISTS block_records (
    block_number INTEGER PRIMARY KEY,
    block_hash VARCHAR(66) NOT NULL,
    parent_hash VARCHAR(66) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'UNFINALIZED',
    timestamp TIMESTAMP NOT NULL,
    del_yn VARCHAR(1) DEFAULT 'N' NOT NULL,
    sys_reg_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sys_upd_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_block_status CHECK (status IN ('UNFINALIZED', 'SAFE', 'FINALIZED'))
);

CREATE INDEX IF NOT EXISTS idx_block_records_status
    ON block_records (status);

CREATE INDEX IF NOT EXISTS idx_block_records_block_number_status
    ON block_records (block_number, status);

CREATE TABLE IF NOT EXISTS reorg_logs (
    id BIGSERIAL PRIMARY KEY,
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    block_number INTEGER NOT NULL,
    old_hash VARCHAR(66),
    new_hash VARCHAR(66) NOT NULL,
    message TEXT NOT NULL,
    del_yn VARCHAR(1) DEFAULT 'N' NOT NULL,
    sys_reg_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sys_upd_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reorg_logs_block_number
    ON reorg_logs (block_number);

CREATE INDEX IF NOT EXISTS idx_reorg_logs_detected_at
    ON reorg_logs (detected_at DESC);

CREATE TABLE IF NOT EXISTS contract_event_records (
    id BIGSERIAL PRIMARY KEY,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number INTEGER NOT NULL,
    log_index INTEGER NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    arg1 VARCHAR(255),
    arg2 VARCHAR(255),
    arg3 VARCHAR(255),
    val1 NUMERIC,
    val2 NUMERIC,
    del_yn VARCHAR(1) DEFAULT 'N' NOT NULL,
    sys_reg_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sys_upd_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT uq_contract_event_log UNIQUE (transaction_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_contract_event_records_block_number
    ON contract_event_records (block_number);

CREATE INDEX IF NOT EXISTS idx_contract_event_records_txn_hash
    ON contract_event_records (transaction_hash);

CREATE INDEX IF NOT EXISTS idx_contract_event_records_contract_event
    ON contract_event_records (contract_address, event_name);

CREATE INDEX IF NOT EXISTS idx_contract_event_records_arg1
    ON contract_event_records (arg1);

CREATE INDEX IF NOT EXISTS idx_contract_event_records_arg2
    ON contract_event_records (arg2);

-- 2026-04-22 Ponder 확장 아키텍처 스키마 추가
CREATE TABLE IF NOT EXISTS dynamic_contracts (
    id BIGSERIAL PRIMARY KEY,
    factory_address VARCHAR(42) NOT NULL,
    child_address VARCHAR(42) NOT NULL,
    created_block INTEGER NOT NULL,
    del_yn VARCHAR(1) DEFAULT 'N' NOT NULL,
    sys_reg_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sys_upd_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dynamic_contracts_child
    ON dynamic_contracts (child_address);

CREATE TABLE IF NOT EXISTS internal_transaction_records (
    id BIGSERIAL PRIMARY KEY,
    transaction_hash VARCHAR(66) NOT NULL,
    block_number INTEGER NOT NULL,
    from_address VARCHAR(42) NOT NULL,
    to_address VARCHAR(42),
    value NUMERIC,
    call_type VARCHAR(20) NOT NULL,
    del_yn VARCHAR(1) DEFAULT 'N' NOT NULL,
    sys_reg_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sys_upd_dtm TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_internal_tx_records_block_number
    ON internal_transaction_records (block_number);
CREATE INDEX IF NOT EXISTS idx_internal_tx_records_txn_hash
    ON internal_transaction_records (transaction_hash);
