import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BaseRepository } from '../../common/repositories/base.repository';
import { ReorgLog } from '../entity/reorg-log.entity';

/**
 * ReorgLog 엔티티의 DB 접근을 담당하는 Repository.
 * Reorg 이벤트 저장 및 블록 범위 기반 조회를 처리합니다.
 */
@Injectable()
export class ReorgLogRepository extends BaseRepository {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  /**
   * Reorg 이벤트를 DB에 저장합니다.
   * ReorgService.handleReorg()에서 Reorg 감지 즉시 호출됩니다.
   */
  async saveReorgLog(
    reorgLog: Partial<ReorgLog>,
    entityManager?: EntityManager,
  ): Promise<ReorgLog> {
    const repo = this.getRepository(ReorgLog, entityManager);
    return repo.save(reorgLog);
  }

  /**
   * Reorg 이력 목록을 감지 시각 기준 내림차순으로 조회합니다.
   * fromBlock/toBlock 조건이 있으면 해당 범위의 블록만 필터링합니다.
   *
   * @param fromBlock - 조회 시작 블록 번호 (이상, 미지정 시 하한 없음)
   * @param toBlock   - 조회 종료 블록 번호 (이하, 미지정 시 상한 없음)
   */
  async findAll(
    fromBlock?: number,
    toBlock?: number,
    entityManager?: EntityManager,
  ): Promise<ReorgLog[]> {
    const repo = this.getRepository(ReorgLog, entityManager);
    const qb = repo.createQueryBuilder('rl').orderBy('rl.detectedAt', 'DESC');

    if (fromBlock !== undefined) {
      qb.andWhere('rl.block_number >= :fromBlock', { fromBlock });
    }
    if (toBlock !== undefined) {
      qb.andWhere('rl.block_number <= :toBlock', { toBlock });
    }

    return qb.getMany();
  }
}
