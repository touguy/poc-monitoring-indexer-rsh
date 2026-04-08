import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReorgLog } from './entity/reorg-log.entity';
import { ReorgLogRepository } from './repository/reorg-log.repository';
import { ReorgService } from './service/reorg.service';
import { ReorgController } from './controller/reorg.controller';

/**
 * Chain Reorg 감지 및 이력 관리 모듈.
 * 블록체인 상에서 발생하는 체인 재조직 이벤트를 영구 저장하고 조회하는 기능을 관리합니다.
 */
@Module({
  imports: [
    // ReorgLog 엔티티를 TypeORM에 등록
    TypeOrmModule.forFeature([ReorgLog]),
  ],
  controllers: [ReorgController],
  providers: [ReorgLogRepository, ReorgService],
  // 타 모듈(예: BlockModule)에서 Reorg 감지 시 이 서비스를 사용할 수 있도록 내보냅니다.
  exports: [ReorgLogRepository, ReorgService],
})
export class ReorgModule {}
