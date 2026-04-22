import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { BlockRecordRepository } from '../repository/block-record.repository';
import { BlockRecord, BlockStatus } from '../entity/block-record.entity';
import { BlockchainRpcService } from '../../blockchain/service/blockchain-rpc.service';
import { BlockchainWsService } from '../../blockchain/service/blockchain-ws.service';
import { ReorgService } from '../../reorg/service/reorg.service';
import { ContractEventService } from '../../contract/service/contract-event.service';
import { BlockRecordQueryDto } from '../dto/block-record-query.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCode } from '../../common/exceptions/error-code.enum';

/**
 * Chain Reorg 감지 및 블록 상태 관리를 담당하는 핵심 서비스.
 *
 * ─ 실시간 감지 (WebSocket)
 *   onModuleInit()에서 'block' 이벤트를 구독하여 새 블록이 생성될 때마다
 *   DB에 저장된 직전 블록의 hash와 새 블록의 parentHash를 비교합니다.
 *   불일치 시 즉시 Reorg를 기록합니다.
 *
 * ─ 주기적 검증 (Cron Polling, env 설정 : 10초마다)
 *   UNFINALIZED/SAFE 상태 블록을 RPC로 재조회하여 해시를 비교합니다.
 *   불일치 시 Reorg를 기록하고 DB를 최신 체인 데이터로 갱신합니다.
 *   'safe'/'finalized' 태그를 기준으로 블록 확정 상태(Finality)를 갱신합니다.
 */
@Injectable()
export class BlockService implements OnModuleInit {
  /**
   * 이전 Cron 실행이 아직 진행 중일 때 중복 실행을 방지하기 위한 플래그.
   * 블록 수가 많을 경우 폴링 루프가 10초를 초과할 수 있으므로 안전장치 역할을 합니다.
   */
  private isPolling = false;

  /** 서비스 인스턴스 고유 ID (중복 인스턴스 실행 여부 확인용) */
  private readonly instanceId = Math.random().toString(36).substring(7);

  /** 마지막으로 DB에 반영된 'safe' 블록 번호 (불필요한 중복 UPDATE 방지용) */
  private lastProcessedSafeBlock = 0;

  /** 마지막으로 DB에 반영된 'finalized' 블록 번호 (불필요한 중복 UPDATE 방지용) */
  private lastProcessedFinalizedBlock = 0;

  /** WebSocket 이벤트를 순차 처리하기 위한 메모리 큐 */
  private blockQueue: number[] = [];

  /** 메모리 큐 처리 워커 동작 여부 플래그 */
  private isProcessingQueue = false;

  constructor(
    private readonly blockRecordRepo: BlockRecordRepository,
    private readonly rpcService: BlockchainRpcService,
    private readonly wsService: BlockchainWsService,
    private readonly reorgService: ReorgService,
    private readonly contractEventService: ContractEventService,
    private readonly config: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) { }

  async onModuleInit() {
    this.logger.info('BlockService 초기화 시작');

    // 1. WebSocket 'block' 이벤트 구독 시작 (초기 동기화 중에도 이벤트를 우선 감지)
    this.logger.info('BlockService WebSocket 리스너 초기화 (newHeads 구독 시작)');

    // WsService는 이벤트를 단순 전달합니다. (메모리 큐 적재)
    this.wsService.onEvent('block', async (...args: any[]) => {
      const blockNumber = args[0] as number; // 'block' 이벤트는 첫 번째 인자가 blockNumber
      this.logger.debug(`[WS Event] 블록 ${blockNumber} 큐에 적재`);
      this.blockQueue.push(blockNumber);
      this.processBlockQueue(); // 큐 워커 실행 (동시 실행 방지)
    });

    // 2. 초기 동기화 실행 (비동기 Background 실행)
    this.syncInitialBlocks();

    // 3. 환경변수를 통한 Cron Job 동적 등록
    this.setupPollingCron();
  }

  /**
   * [비즈니스 로직 - 초기 동기화]
   *
   * 프로그램 시작 시 DB의 마지막 블록과 네트워크의 최신 블록을 비교하여
   * 부족한 블록 데이터를 수집하고 저장합니다.
   */
  private async syncInitialBlocks() {
    try {
      // 1. DB의 최신 블록과 네트워크의 최신 블록 번호를 조회
      const latestDbBlock = await this.blockRecordRepo.getLatestBlock();
      const latestNetworkBlock = await this.rpcService.getCurrentBlock();
      const limit = this.config.get<number>('INITIAL_SYNC_BLOCK_COUNT', 100);
      const startBlock = Math.max(0, latestNetworkBlock - limit + 1);

      // 2. 케이스별 초기화 로직 분기
      if (!latestDbBlock) {
        // [케이스 1] 데이터가 없는 경우: 최신 블록 기준 limit 개수만큼 초기 동기화
        this.logger.warn(`DB가 비어있습니다. 최근 ${limit}개 블록 초기 동기화를 시작합니다.`);
        await this.saveBlocksInRange(startBlock, latestNetworkBlock);
      } else {
        // [데이터가 있는 경우] DB와 네트워크 간의 블록 차이(Gap) 계산
        const gap = latestNetworkBlock - latestDbBlock.blockNumber;

        if (gap >= limit) {
          // [케이스 2] 갭이 설정된 limit 이상으로 큰 경우: 기존 데이터 유지하며 최신 데이터 위주로 보충
          this.logger.warn(`큰 블록 갭 감지 (Gap: ${gap}). 최신 ${limit}개 블록만 초기 동기화합니다.`);
          await this.saveBlocksInRange(startBlock, latestNetworkBlock);
        } else if (gap > 0) {
          // 갭이 0보다 크고 limit 미만인 경우: 누락된 구간만 순차 동기화
          this.logger.warn(`누락된 블록 데이터 보충 시작 (Gap: ${gap})`);
          await this.saveBlocksInRange(latestDbBlock.blockNumber + 1, latestNetworkBlock);
        } else {
          this.logger.info(`DB가 최신 상태입니다. (마지막 블록: ${latestDbBlock.blockNumber})`);
        }
      }
    } catch (error: any) {
      this.logger.error(`초기 동기화 중 오류 발생: ${error.message}`, { stack: error.stack });
    }
  }

  /**
   * [공통 헬퍼 - 블록 범위 저장]
   * 지정된 범위의 블록 정보를 RPC로 순차 조회하여 DB에 저장합니다.
   * 각 요청 사이에 100ms 딜레이를 두어 RPC 노드의 과부하를 방지합니다.
   */
  private async saveBlocksInRange(startBlock: number, endBlock: number) {
    this.logger.info(`블록 동기화 범위: ${startBlock} ~ ${endBlock}`);

    for (let i = startBlock; i <= endBlock; i++) {
      const block = await this.rpcService.getBlockByNumber(i);

      if (block) {
        const blockRecord = new BlockRecord();
        blockRecord.blockNumber = i;
        blockRecord.blockHash = block.hash!;
        blockRecord.parentHash = block.parentHash;
        blockRecord.status = BlockStatus.UNFINALIZED;
        blockRecord.timestamp = new Date(block.timestamp * 1000);

        await this.blockRecordRepo.saveBlock(blockRecord);
      }

      // RPC 노드의 Rate Limit 방지를 위해 각 요청 사이에 100ms 딜레이 적용
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 트랜젝션 데이터 일괄 조회
    await this.contractEventService.fetchAndSaveEventsForBlock(startBlock, endBlock);

    this.logger.info(`블록 범위 동기화 완료: ${startBlock} ~ ${endBlock}`);
  }

  /**
   * [WebSocket 메모리 큐 순차 처리 워커]
   *
   * 큐에 쌓인 이벤트를 하나씩 꺼내어 순차적으로 handleNewBlock을 실행합니다.
   * 여러 개의 이벤트가 동시에 들어와도 이 메서드가 단일 스레드처럼 작동하여 트랜잭션 동시성 충돌을 방지합니다.
   */
  private async processBlockQueue() {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    try {
      while (this.blockQueue.length > 0) {
        const blockNumber = this.blockQueue.shift();
        if (blockNumber) {
          await this.handleNewBlock(blockNumber);
        }
      }
    } catch (error: any) {
      this.logger.error(`블록 큐 처리 중 오류 발생: ${error.message}`);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * [핵심 비즈니스 로직 - 실시간 Reorg 감지]
   *
   * WebSocket으로 수신된 새 블록을 처리합니다.
   * 처리 순서:
   *   1. HTTP RPC로 블록 상세 정보(hash, parentHash, timestamp) 조회
   *   2. DB에서 가장 최근 저장된 블록 조회
   *   3. 중복/과거 블록이면 무시
   *   4. 직전 블록과 연속될 경우 parentHash를 비교하여 Reorg 감지
   *      - DB의 최신 블록 hash ≠ 새 블록의 parentHash → Reorg!
   *   5. 새 블록을 UNFINALIZED 상태로 DB에 저장
   */
  private async handleNewBlock(blockNumber: number) {
    try {

      this.logger.debug(`WS00 :블록 ${blockNumber} 수신`);

      // 1. WS는 blockNumber만 push함 → HTTP RPC로 상세 조회 (지연 인덱싱 대비 재시도 로직)
      let block = null;
      let retryCount = 0;
      const maxRetries = 5;

      while (!block && retryCount < maxRetries) {
        block = await this.rpcService.getBlockByNumber(blockNumber);

        if (!block) {
          retryCount++;
          if (retryCount >= maxRetries) {
            this.logger.error(`[!!!조회 포기!!!] 블록 ${blockNumber} 데이터가 계속 존재하지 않습니다. 최대 재시도 도달, 처리를 건너뜁니다.`);
            return;
          }
          this.logger.warn(`[조회 지연] 블록 ${blockNumber} 미발견 (시도 ${retryCount}/${maxRetries}). 1초 대기 후 재시도합니다...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.logger.debug(`WS01 :블록 ${blockNumber} RPC 수신`);

      // 새 블록을 무조건 UNFINALIZED 상태로 DB에 저장 (기존 내용이 있어도 Upsert됨)
      // PRD 정책에 따라 WS 수신부에서는 최신 블록 조회나 Reorg/Gap 체크를 수행하지 않습니다.
      const blockRecord = new BlockRecord();
      blockRecord.blockNumber = blockNumber;
      blockRecord.blockHash = block.hash!;
      blockRecord.parentHash = block.parentHash;
      blockRecord.status = BlockStatus.UNFINALIZED;
      blockRecord.timestamp = new Date(block.timestamp * 1000);

      await this.blockRecordRepo.saveBlock(blockRecord);
      await this.contractEventService.fetchAndSaveEventsForBlock(blockNumber);

      this.logger.debug(`WS03 :블록 ${blockNumber} UNFINALIZED 상태로 저장 완료`);
    } catch (error: any) {
      this.logger.error(`handleNewBlock 처리 오류: ${error.message}`);
    }
  }

  /**
   * 환경 변수에서 Cron 설정값을 읽어 동적으로 크론 잡을 등록합니다.
   */
  private setupPollingCron() {
    const cronTime = this.config.get<string>('POLLING_CRON_TIME', '*/60 * * * * *');
    const job = new CronJob(cronTime, () => {
      this.handlePollingValidation();
    });

    this.schedulerRegistry.addCronJob('pollingValidation', job);
    job.start();
    this.logger.info(`Polling validation cron scheduled with time: ${cronTime}`);
  }

  /**
   * [핵심 비즈니스 로직 - 주기적 Reorg 검증 및 Finality 상태 갱신]
   */
  async handlePollingValidation() {
    if (this.isPolling) return;
    this.isPolling = true;

    // 실행별 고유 ID 생성
    const executionId = Math.random().toString(36).substring(7);
    this.logger.debug(`[Polling-${this.instanceId}] 폴링 검증 시작 (ID: ${executionId})`);

    try {
      // ─ Step 1: 이더리움 노드의 safe/finalized 태그를 기준으로 Finality 상태 일괄 갱신
      const safeBlock = await this.rpcService.getBlockByNumber('safe');
      const finalizedBlock = await this.rpcService.getBlockByNumber('finalized');

      this.logger.debug(`[Polling-${this.instanceId}] Safe (${safeBlock.number}) / Finalized (${finalizedBlock.number})`);

      if (safeBlock && safeBlock.number > this.lastProcessedSafeBlock) {
        await this.blockRecordRepo.updateStatusUpToBlock(safeBlock.number, BlockStatus.SAFE);
        this.lastProcessedSafeBlock = safeBlock.number;
        this.logger.debug(`[Polling-${this.instanceId}] Safe 상태 업데이트 완료 (Block: ${safeBlock.number})`);
      }

      if (finalizedBlock && finalizedBlock.number > this.lastProcessedFinalizedBlock) {
        await this.blockRecordRepo.updateStatusUpToBlock(
          finalizedBlock.number,
          BlockStatus.FINALIZED,
        );
        this.lastProcessedFinalizedBlock = finalizedBlock.number;
        this.logger.debug(`[Polling-${this.instanceId}] Finalized 상태 업데이트 완료 (Block: ${finalizedBlock.number})`);
      }

      // ─ Step 2: UNFINALIZED/SAFE 블록들을 RPC로 재조회하여 해시 불일치 검증 (REORG 감지)
      this.logger.debug(`[Polling-${this.instanceId}] Step 2 시작: 미확정 블록 검증 (ID: ${executionId})`);
      const blocksToVerify = await this.blockRecordRepo.findUnfinalizedAndSafeBlocks();

      for (const record of blocksToVerify) {
        const rpcBlock = await this.rpcService.getBlockByNumber(record.blockNumber);

        if (rpcBlock && rpcBlock.hash !== record.blockHash) {
          await this.reorgService.handleReorg(
            record.blockNumber,
            record.blockHash,
            rpcBlock.hash!,
            'Polling validation hash mismatch detected',
          );

          record.blockHash = rpcBlock.hash!;
          record.parentHash = rpcBlock.parentHash;
          record.status = BlockStatus.UNFINALIZED;

          await this.blockRecordRepo.saveBlock(record);

          await this.contractEventService.rollbackEvents(record.blockNumber);
          await this.contractEventService.fetchAndSaveEventsForBlock(record.blockNumber);
        }

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // ─ Step 3: 미확정 블록 사이의 체인 갭 감지 및 복구 (Gap Detection)
      this.logger.debug(`[Polling-${this.instanceId}] Step 3 시작: 체인 갭 감지 및 복구 (ID: ${executionId})`);
      const gaps = await this.blockRecordRepo.findMissingBlockGaps();

      for (const gap of gaps) {
        // Raw SQL 결과값이 bigint 인 경우 string으로 반환될 수 있으므로 Number 형변환 처리
        const start = Number(gap.missing_start);
        const end = Number(gap.missing_end);

        this.logger.info(`[Polling-${this.instanceId}] 체인 갭 발견: ${start} ~ ${end} 동기화 시작`);

        // 발견된 갭 구간을 순차적으로 조회 및 DB 저장 처리 
        // (saveBlocksInRange 내부에서 루프마다 UNFINALIZED 저장 및 100ms 딜레이를 수행함)
        if (!isNaN(start) && !isNaN(end) && start <= end) {
          await this.saveBlocksInRange(start, end);
        }
      }

      this.logger.debug(`[Polling-${this.instanceId}] 폴링 검증 전체 종료 (ID: ${executionId})`);
    } catch (error: any) {
      this.logger.error(`[Polling-${this.instanceId}] 폴링 검증 오류: ${error.message}`);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * 블록 목록을 페이지네이션 및 상태 필터와 함께 조회합니다.
   */
  async findAll(query: BlockRecordQueryDto): Promise<{ data: BlockRecord[]; total: number }> {
    return this.blockRecordRepo.findAll(query.status, query.limit, query.page);
  }

  /**
   * 특정 블록 번호의 상세 정보를 조회합니다.
   */
  async findOne(blockNumber: number): Promise<BlockRecord> {
    const found = await this.blockRecordRepo.findByBlockNumber(blockNumber);
    if (!found) {
      throw new BusinessException(ErrorCode.NOT_FOUND_BLOCK);
    }
    return found;
  }
}
