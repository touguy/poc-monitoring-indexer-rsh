import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockRecord } from './entity/block-record.entity';
import { BlockRecordRepository } from './repository/block-record.repository';
import { BlockService } from './service/block.service';
import { BlockController } from './controller/block.controller';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ReorgModule } from '../reorg/reorg.module';
import { ContractModule } from '../contract/contract.module';

/**
 * 블록 도메인 모듈.
 * 이더리움 블록 정보를 수집, 검증, 저장하는 기능을 관리합니다.
 * BlockchainModule(RPC/WS)과 ReorgModule(Reorg 로깅)에 의존합니다.
 */
@Module({
  imports: [
    // BlockRecord 엔티티를 TypeORM에 등록
    TypeOrmModule.forFeature([BlockRecord]),
    // 블록체인 통신 기능을 위한 모듈
    BlockchainModule,
    // Reorg 감지 시 로그 기록을 위한 모듈
    ReorgModule,
    // 스마트 컨트랙트 이벤트 로깅을 위한 모듈
    ContractModule,
  ],
  controllers: [BlockController],
  providers: [BlockRecordRepository, BlockService],
  exports: [BlockService],
})
export class BlockModule {}
