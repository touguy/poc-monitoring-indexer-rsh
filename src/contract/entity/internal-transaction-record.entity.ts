import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 🚀 [Ponder 확장 기능] 내부 트랜잭션 (Traces) 엔티티.
 * 이벤트로 남지 않는 스마트 컨트랙트 내부의 이더 전송 등 상태 변경 내역을 저장합니다.
 */
@Entity('internal_transaction_records')
@Index('idx_internal_tx_records_block_number', ['blockNumber'])
@Index('idx_internal_tx_records_txn_hash', ['transactionHash'])
export class InternalTransactionRecord extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 66 })
  transactionHash: string;

  @Column({ name: 'block_number', type: 'int' })
  blockNumber: number;

  @Column({ name: 'from_address', type: 'varchar', length: 42 })
  fromAddress: string;

  @Column({ name: 'to_address', type: 'varchar', length: 42, nullable: true })
  toAddress: string | null;

  @Column({ name: 'value', type: 'numeric', nullable: true })
  value: string | null;

  @Column({ name: 'call_type', type: 'varchar', length: 20 })
  callType: string;
}
