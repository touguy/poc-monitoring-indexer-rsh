import { Inject, Injectable } from '@nestjs/common';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ReorgLogRepository } from '../repository/reorg-log.repository';
import { ReorgLog } from '../entity/reorg-log.entity';

/**
 * Chain Reorg(체인 재조직) 이벤트를 기록하고 조회하는 서비스.
 *
 * BlockService에서 실시간 또는 폴링 검증을 통해 Reorg를 감지하면 handleReorg()를 호출합니다.
 * Reorg 정보는 reorg_logs 테이블에 영구 저장되며, API를 통해 감사 목적으로 조회할 수 있습니다.
 */
@Injectable()
export class ReorgService {
  constructor(
    private readonly reorgLogRepository: ReorgLogRepository,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /**
   * [핵심 비즈니스 로직 - Reorg 이벤트 기록]
   *
   * Chain Reorg가 감지되었을 때 호출됩니다.
   * 감지 경로는 두 가지이며, message 파라미터로 구분합니다:
   *   - 실시간: 'Real-time parentHash mismatch detected' (WS 수신 시)
   *   - 폴링:   'Polling validation hash mismatch detected' (Cron 실행 시)
   *
   * @param blockNumber - Reorg가 발생한 블록 번호
   * @param oldHash     - DB에 저장되어 있던 (이제 무효화된) 블록 해시
   * @param newHash     - 현재 메인 체인의 실제 블록 해시
   * @param message     - 감지 경위 설명 (로그 기록용)
   */
  async handleReorg(blockNumber: number, oldHash: string, newHash: string, message: string) {
    // WARN 레벨로 로그에 즉시 기록 (알림 모니터링 트리거 용도)
    this.logger.warn(
      `REORG DETECTED: Block ${blockNumber} | Old Hash: ${oldHash} | New Hash: ${newHash}`,
      {
        message,
      },
    );

    // DB에 Reorg 이력을 영구 저장
    const log = new ReorgLog();
    log.blockNumber = blockNumber;
    log.oldHash = oldHash;
    log.newHash = newHash;
    log.message = message;

    await this.reorgLogRepository.saveReorgLog(log);
  }

  /**
   * Reorg 이력 목록을 조회합니다.
   * 블록 범위(fromBlock ~ toBlock)로 필터링할 수 있으며, 미지정 시 전체 조회합니다.
   * GET /reorgs 엔드포인트에서 호출됩니다.
   */
  async findAll(fromBlock?: number, toBlock?: number): Promise<ReorgLog[]> {
    return this.reorgLogRepository.findAll(fromBlock, toBlock);
  }
}
