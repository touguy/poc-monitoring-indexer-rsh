import { Entity, Column, PrimaryColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 블록 확정 상태(Finality Status) 열거형.
 *
 * UNFINALIZED : 막 생성된 블록. 아직 Safe/Finalized 기준에 도달하지 않은 상태.
 *               Reorg의 위험이 가장 높으며, 주기적 폴링 검증 대상.
 *
 * SAFE        : 이더리움 노드가 'safe' 태그로 확인한 블록.
 *               경쟁 체인이 발생할 가능성은 낮지만 완전 확정은 아님.
 *
 * FINALIZED   : 이더리움 노드가 'finalized' 태그로 확인한 블록.
 *               이 상태 이후에는 절대 Reorg 되지 않으므로 더 이상 폴링하지 않음.
 */
export enum BlockStatus {
  UNFINALIZED = 'UNFINALIZED',
  SAFE = 'SAFE',
  FINALIZED = 'FINALIZED',
}

/**
 * 이더리움 블록 정보를 저장하는 엔티티.
 * WebSocket 구독(newHeads)으로 새 블록을 수신할 때마다 UNFINALIZED 상태로 저장되며,
 * Cron 폴링에 의해 상태가 SAFE → FINALIZED 순서로 갱신됩니다.
 *
 * Chain Reorg 감지 시 blockHash/parentHash가 갱신되고 ReorgLog에 기록됩니다.
 */
@Entity({ name: 'block_records' })
export class BlockRecord extends BaseEntity {
  /** 블록 번호 (Primary Key, 이더리움 블록 높이) */
  @PrimaryColumn({ name: 'block_number', type: 'int' })
  blockNumber: number;

  /** 해당 블록의 해시값 (0x..., 66자) */
  @Column({ name: 'block_hash', type: 'varchar', length: 66 })
  blockHash: string;

  /** 이전 블록의 해시값 — Reorg 감지 시 핵심 비교 키 */
  @Column({ name: 'parent_hash', type: 'varchar', length: 66 })
  parentHash: string;

  /** 블록 확정 상태 (UNFINALIZED / SAFE / FINALIZED) */
  @Column({ name: 'status', type: 'enum', enum: BlockStatus, default: BlockStatus.UNFINALIZED })
  status: BlockStatus;

  /** 블록이 채굴된 실제 시각 (Unix timestamp → Date 변환) */
  @Column({ name: 'timestamp', type: 'timestamp' })
  timestamp: Date;
}
