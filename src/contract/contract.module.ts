import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContractEventRecord } from './entity/contract-event-record.entity';
import { DynamicContract } from './entity/dynamic-contract.entity';
import { InternalTransactionRecord } from './entity/internal-transaction-record.entity';
import { ContractEventRepository } from './repository/contract-event-record.repository';
import { DynamicContractRepository } from './repository/dynamic-contract.repository';
import { InternalTransactionRecordRepository } from './repository/internal-transaction-record.repository';
import { ContractEventService } from './service/contract-event.service';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ContractEventRecord, DynamicContract, InternalTransactionRecord]),
    forwardRef(() => BlockchainModule),
  ],
  providers: [
    ContractEventRepository, 
    DynamicContractRepository, 
    InternalTransactionRecordRepository, 
    ContractEventService
  ],
  exports: [ContractEventService],
})
export class ContractModule {}
