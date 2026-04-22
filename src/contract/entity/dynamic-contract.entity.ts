import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * 🚀 [Ponder 확장 기능] 동적 팩토리 주소 추적 엔티티.
 * Factory 컨트랙트에서 배포된 자식 컨트랙트 주소를 저장합니다.
 */
@Entity('dynamic_contracts')
@Index('idx_dynamic_contracts_child', ['childAddress'], { unique: true })
export class DynamicContract extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'factory_address', type: 'varchar', length: 42 })
  factoryAddress: string;

  @Column({ name: 'child_address', type: 'varchar', length: 42 })
  childAddress: string;

  @Column({ name: 'created_block', type: 'int' })
  createdBlock: number;
}
