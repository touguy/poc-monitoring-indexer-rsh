import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, LessThanOrEqual } from 'typeorm';
import { BaseRepository } from '../../common/repositories/base.repository';
import { BlockRecord, BlockStatus } from '../entity/block-record.entity';

/**
 * BlockRecord 엔티티의 DB 접근을 담당하는 Repository.
 * 블록 저장/조회/상태 업데이트/삭제 등 block_records 테이블의 모든 CRUD를 처리합니다.
 */
@Injectable()
export class BlockRecordRepository extends BaseRepository {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  /**
   * DB에서 블록 번호가 가장 높은(최신) 블록 레코드를 반환합니다.
   * WebSocket으로 새 블록 수신 시 parentHash 비교 기준으로 사용됩니다.
   */
  async getLatestBlock(entityManager?: EntityManager): Promise<BlockRecord | null> {
    const repo = this.getRepository(BlockRecord, entityManager);
    return repo.findOne({
      where: {}, // TypeORM 0.3+에서 findOne 사용 시 빈 조건이라도 명시 필요
      order: { blockNumber: 'DESC' },
    });
  }

  /**
   * 블록 레코드를 저장(INSERT 또는 UPDATE)합니다.
   * Reorg 발생 시 기존 레코드의 hash/status를 덮어쓸 때도 사용됩니다.
   */
  async saveBlock(
    blockRecord: Partial<BlockRecord>,
    entityManager?: EntityManager,
  ): Promise<BlockRecord> {
    const repo = this.getRepository(BlockRecord, entityManager);
    return repo.save(blockRecord);
  }

  /**
   * 아직 확정되지 않은 블록(UNFINALIZED, SAFE) 목록을 조회합니다.
   * Cron 폴링 검증의 대상 목록을 가져올 때 사용됩니다.
   * FINALIZED 블록은 불필요한 연산을 줄이기 위해 제외합니다.
   */
  async findUnfinalizedAndSafeBlocks(entityManager?: EntityManager): Promise<BlockRecord[]> {
    const repo = this.getRepository(BlockRecord, entityManager);
    return repo
      .createQueryBuilder('br')
      .where('br.status IN (:...statuses)', {
        statuses: [BlockStatus.UNFINALIZED, BlockStatus.SAFE],
      })
      .orderBy('br.blockNumber', 'DESC')
      .getMany();
  }

  /**
   * 특정 블록 번호 이하의 모든 블록 상태를 일괄 변경합니다.
   * 이더리움 노드의 'safe'/'finalized' 태그를 기준으로 Finality 상태를 갱신할 때 사용됩니다.
   * 이미 해당 상태인 블록은 불필요한 UPDATE를 생략합니다.
   */
  async updateStatusUpToBlock(
    blockNumber: number,
    status: BlockStatus,
    entityManager?: EntityManager,
  ): Promise<void> {
    const repo = this.getRepository(BlockRecord, entityManager);
    await repo
      .createQueryBuilder()
      .update(BlockRecord)
      .set({ status })
      .where('block_number <= :blockNumber', { blockNumber })
      // 이미 동일 상태인 경우는 건너뜀 → 불필요한 DB 부하 방지
      .andWhere('status != :status', { status })
      // 이미 FINALIZED된 블록은 절대 변경하지 않음 (불변성 보장)
      .andWhere('status != :finalized', { finalized: BlockStatus.FINALIZED })
      .execute();
  }

  /**
   * 특정 블록 번호의 레코드를 정확히 하나 조회합니다.
   * API 조회 및 개별 블록 검증에 사용됩니다.
   */
  async findByBlockNumber(
    blockNumber: number,
    entityManager?: EntityManager,
  ): Promise<BlockRecord | null> {
    const repo = this.getRepository(BlockRecord, entityManager);
    return repo.findOne({ where: { blockNumber } });
  }

  /**
   * 블록 목록을 페이지네이션 및 상태 필터와 함께 조회합니다.
   * API의 GET /blocks 엔드포인트에서 호출됩니다.
   *
   * @param status - 필터링할 상태 (없으면 전체 상태 조회)
   * @param limit  - 페이지당 결과 수 (기본값: 20)
   * @param page   - 0-indexed 페이지 번호 (기본값: 0)
   */
  async findAll(
    status?: string,
    limit = 20,
    page = 0,
    entityManager?: EntityManager,
  ): Promise<{ data: BlockRecord[]; total: number }> {
    const repo = this.getRepository(BlockRecord, entityManager);
    const qb = repo.createQueryBuilder('br').orderBy('br.blockNumber', 'DESC');

    // 상태 필터가 있을 경우에만 WHERE 조건을 추가
    if (status) {
      qb.where('br.status = :status', { status });
    }

    const total = await qb.getCount();
    const data = await qb
      .skip(page * limit)
      .take(limit)
      .getMany();

    return { data, total };
  }

  /**
   * 특정 블록 번호 이상의 모든 블록 레코드를 삭제합니다.
   * Reorg 발생 시 무효화된 미래 블록들을 정리할 때 사용됩니다. (현재 주석 처리됨)
   */
  async deleteBlocksFrom(blockNumber: number, entityManager?: EntityManager): Promise<void> {
    const repo = this.getRepository(BlockRecord, entityManager);
    await repo
      .createQueryBuilder()
      .delete()
      .from(BlockRecord)
      .where('block_number >= :blockNumber', { blockNumber })
      .execute();
  }
}
