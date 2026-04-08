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
