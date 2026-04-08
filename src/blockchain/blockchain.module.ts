import { Module } from '@nestjs/common';
import { BlockchainRpcService } from './service/blockchain-rpc.service';
import { BlockchainWsService } from './service/blockchain-ws.service';

/**
 * 블록체인 인프라 계층 모듈.
 * 이더리움 노드와의 통신을 담당하는 RPC 서비스와 WebSocket 서비스를 제공합니다.
 * 타 모듈에서 블록체인 데이터를 조회하거나 실시간 이벤트를 구독할 때 이 모듈을 임포트하여 사용합니다.
 */
@Module({
  providers: [BlockchainRpcService, BlockchainWsService],
  exports: [BlockchainRpcService, BlockchainWsService],
})
export class BlockchainModule {}
