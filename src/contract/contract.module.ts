import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractEventRecord } from './entity/contract-event-record.entity';
import { ContractEventRepository } from './repository/contract-event-record.repository';
import { ContractEventService } from './service/contract-event.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContractEventRecord]),
    forwardRef(() => BlockchainModule),
  ],
  providers: [ContractEventRepository, ContractEventService],
  exports: [ContractEventService],
})
export class ContractModule {}
