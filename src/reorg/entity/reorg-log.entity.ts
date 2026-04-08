import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Chain Reorg(체인 재조직) 이벤트 이력을 저장하는 엔티티.
 *
 * BlockService가 실시간(WS) 또는 주기적 폴링(Cron)으로 Reorg를 감지하면
 * ReorgService.handleReorg()를 통해 이 테이블에 레코드가 생성됩니다.
 * 감사(Audit) 및 모니터링 목적으로 영구 보관됩니다.
 */
@Entity({ name: 'reorg_logs' })
export class ReorgLog extends BaseEntity {
  /** 자동 증가 기본 키 */
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  /** Reorg가 감지된 시각 (INSERT 시 자동 설정) */
  @CreateDateColumn({ name: 'detected_at', type: 'timestamp' })
  detectedAt: Date;

  /** Reorg가 발생한 이더리움 블록 번호 */
  @Column({ name: 'block_number', type: 'int' })
  blockNumber: number;

  /** DB에 저장되어 있던 이전(무효화된) 블록 해시 */
  @Column({ name: 'old_hash', type: 'varchar', length: 66, nullable: true })
  oldHash: string;

  /** Reorg 이후 메인 체인에서의 실제 블록 해시 */
  @Column({ name: 'new_hash', type: 'varchar', length: 66 })
  newHash: string;

  /** 감지 경위 설명 (실시간/폴링, 불일치 상세 등) */
  @Column({ name: 'message', type: 'text' })
  message: string;
}
