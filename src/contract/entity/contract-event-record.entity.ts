import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 스마트 컨트랙트 제너릭 이벤트 엔티티.
 * 블록체인에서 발생된 로그(이벤트)를 제너릭 컬럼 방식으로 저장합니다.
 */
@Entity('contract_event_records')
@Index('idx_contract_event_records_txn_hash', ['transactionHash'])
@Index('idx_contract_event_records_contract_event', ['contractAddress', 'eventName'])
@Index('idx_contract_event_records_arg1', ['arg1'])
@Index('idx_contract_event_records_arg2', ['arg2'])
// 복합 유니크 (동일 트랜잭션, 동일 로그 인덱스 방지)
@Index('uq_contract_event_log', ['transactionHash', 'logIndex'], { unique: true })
export class ContractEventRecord extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 66 })
  transactionHash: string;

  @Column({ name: 'block_number', type: 'int' })
  @Index('idx_contract_event_records_block_number')
  blockNumber: number;

  @Column({ name: 'log_index', type: 'int' })
  logIndex: number;

  @Column({ name: 'contract_address', type: 'varchar', length: 42 })
  contractAddress: string;

  @Column({ name: 'event_name', type: 'varchar', length: 255 })
  eventName: string;

  @Column({ name: 'arg1', type: 'varchar', length: 255, nullable: true })
  arg1: string | null;

  @Column({ name: 'arg2', type: 'varchar', length: 255, nullable: true })
  arg2: string | null;

  @Column({ name: 'arg3', type: 'varchar', length: 255, nullable: true })
  arg3: string | null;

  @Column({ name: 'val1', type: 'numeric', nullable: true })
  val1: string | null; // numeric은 보통 string으로 맵핑하여 정밀도 유지

  @Column({ name: 'val2', type: 'numeric', nullable: true })
  val2: string | null;

  @Column({ name: 'timestamp', type: 'timestamp' })
  timestamp: Date;
}
