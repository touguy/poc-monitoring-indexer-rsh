import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * HTTP JSON-RPC Provider를 관리하는 서비스.
 * 이더리움 노드와의 HTTP 통신을 전담하며, 블록 조회/로그 조회 등 단발성 RPC 호출을 처리합니다.
 *
 * - getBlockByNumber: 블록 상세 정보 조회 (Reorg 검증, Finality 체크에 사용)
 * - getCurrentBlock: 현재 최신 블록 번호 조회
 *
 * 모든 RPC 호출은 지수 백오프(Exponential Backoff) 재시도 로직을 통해 노드 장애에 대응합니다.
 */
@Injectable()
export class BlockchainRpcService implements OnModuleInit, OnModuleDestroy {
  private provider: ethers.JsonRpcProvider;

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /** 모듈 초기화 시 HTTP Provider를 생성합니다. */
  onModuleInit() {
    const rpcUrl = this.config.getOrThrow<string>('RPC_URL');
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.logger.info('BlockchainRpcService initialized', { rpcUrl });
  }

  /** 모듈 종료 시 이벤트 리스너를 정리하여 메모리 누수를 방지합니다. */
  onModuleDestroy() {
    this.provider.removeAllListeners();
    this.logger.info('BlockchainRpcService destroyed');
  }

  /**
   * 블록 번호 또는 태그('safe', 'finalized', 'latest')로 블록 정보를 조회합니다.
   * Reorg 검증 시 실제 해시와 비교하고, Finality 체크 시 'safe'/'finalized' 태그를 사용합니다.
   */
  async getBlockByNumber(blockTag: string | number): Promise<ethers.Block | null> {
    return this.retryOperation(() => this.provider.getBlock(blockTag));
  }

  /**
   * 현재 최신 블록 번호를 조회합니다.
   * 프로그램 시작 시 초기 동기화 범위를 계산하는 데 사용됩니다.
   */
  async getCurrentBlock(): Promise<number> {
    return this.retryOperation(() => this.provider.getBlockNumber());
  }

  /**
   * 특정 필터 조건에 매칭되는 온체인 로그 데이터(배열)를 조회합니다.
   * 이벤트 수집 모듈에서 특정 블록의 로그를 일괄 조회할 때 사용됩니다.
   */
  async getLogs(filter: ethers.Filter): Promise<ethers.Log[]> {
    return this.retryOperation(() => this.provider.getLogs(filter));
  }

  /**
   * 🚀 [Ponder 확장 기능] 블록 해시 기반으로 내부 트랜잭션(Traces)을 수집합니다.
   * @param blockHash 대상 블록 해시
   */
  async debugTraceBlockByHash(blockHash: string): Promise<any[]> {
    return this.retryOperation(() => 
      this.provider.send('debug_traceBlockByHash', [blockHash, { tracer: 'callTracer' }])
    );
  }

  /**
   * RPC 호출 실패 시 지수 백오프(Exponential Backoff)로 재시도합니다.
   * - 최대 재시도: 4회 (2초 → 4초 → 8초 → 16초)
   * - 400(잘못된 요청), 404(찾을 수 없음) 에러는 재시도 없이 즉시 예외를 던집니다.
   * - Rate Limit(429), 서버 오류(503/504) 등은 딜레이 후 재시도합니다.
   */
  private async retryOperation<T>(operation: () => Promise<T>, maxRetries = 4): Promise<T> {
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        attempt++;
        const statusCode = error?.error?.code || error?.info?.error?.code || error?.status;

        // 잘못된 요청이나 존재하지 않는 리소스는 재시도해도 의미 없음
        if (statusCode === 400 || statusCode === 404) {
          throw error;
        }

        if (attempt >= maxRetries) {
          this.logger.error(`RPC operation failed after ${maxRetries} attempts`, {
            error: error.message,
          });
          throw error;
        }

        // 지수 백오프: 2^attempt * 1000ms (2초, 4초, 8초, 16초)
        const delayMs = Math.pow(2, attempt) * 1000;
        this.logger.warn(
          `RPC operation failed, retrying in ${delayMs}ms (Attempt ${attempt}/${maxRetries})`,
          {
            error: error.message,
          },
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw new Error('Unreachable retry limit reached');
  }
}
