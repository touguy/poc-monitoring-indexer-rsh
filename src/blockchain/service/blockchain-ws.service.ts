import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers } from 'ethers';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

/**
 * WebSocket Provider를 관리하고 실시간 이벤트 구독 인터페이스를 제공하는 서비스.
 * 이더리움 노드와의 WebSocket 연결을 전담하며, 새 블록 또는 컨트랙트 이벤트를 실시간으로 수신합니다.
 *
 * 이 서비스는 raw WebSocketProvider를 외부에 노출하지 않고,
 * onEvent() 단일 인터페이스로 모든 구독을 처리합니다.
 * 구독한 이벤트 데이터의 타입 해석은 호출자가 담당합니다.
 */
@Injectable()
export class BlockchainWsService implements OnModuleInit, OnModuleDestroy {
  private provider: ethers.WebSocketProvider;

  constructor(
    private readonly config: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  /** 모듈 초기화 시 WSS_URL 환경변수로 WebSocket 연결을 수립합니다. */
  onModuleInit() {
    const wssUrl = this.config.getOrThrow<string>('WSS_URL');
    this.provider = new ethers.WebSocketProvider(wssUrl);
    this.logger.info('BlockchainWsService initialized', { wssUrl });
  }

  /**
   * 모듈 종료 시 모든 이벤트 리스너를 해제하고 WebSocket 연결을 닫습니다.
   * 연결 누수를 방지하기 위해 removeAllListeners() 후 destroy()를 호출합니다.
   */
  onModuleDestroy() {
    this.provider.removeAllListeners();
    this.provider.destroy();
    this.logger.info('BlockchainWsService destroyed');
  }

  /**
   * WS 이벤트 구독 — 단일 인터페이스.
   * 어떤 이벤트를 구독하는지, 콜백에서 무엇을 받는지는 호출자가 결정합니다.
   *
   * @param event - ethers.ProviderEvent ('block', Filter 객체 등)
   * @param callback - 이벤트 수신 시 실행할 콜백 (인자 타입은 호출자가 캐스팅)
   *
   * @example 새 블록 구독 (blockNumber: number)
   *   wsService.onEvent('block', async (...args) => {
   *     const blockNumber = args[0] as number;
   *   })
   *
   * @example 컨트랙트 로그 구독 (log: ethers.Log)
   *   wsService.onEvent({ address, topics }, async (...args) => {
   *     const log = args[0] as ethers.Log;
   *   })
   */
  onEvent(event: ethers.ProviderEvent, callback: (...args: any[]) => Promise<void>): void {
    this.provider.on(event, callback);
    this.logger.info('WebSocket event subscribed');
  }

  /**
   * 등록된 모든 WS 이벤트 구독을 해제합니다.
   * 특정 서비스가 구독을 직접 해제해야 할 경우 호출합니다.
   */
  removeAllListeners(): void {
    this.provider.removeAllListeners();
  }
}
