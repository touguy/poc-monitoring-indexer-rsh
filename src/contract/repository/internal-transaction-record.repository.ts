import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InternalTransactionRecord } from '../entity/internal-transaction-record.entity';

@Injectable()
export class InternalTransactionRecordRepository {
  constructor(
    @InjectRepository(InternalTransactionRecord)
    private readonly repo: Repository<InternalTransactionRecord>,
  ) {}

  /**
   * 수집된 내부 트랜잭션 기록들을 일괄 저장합니다.
   */
  async saveTracesBulk(records: InternalTransactionRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.repo.save(records, { chunk: 100 });
  }

  /**
   * 블록 번호 기준으로 내부 트랜잭션 기록을 삭제/무효화 처리합니다. (Reorg 대응)
   */
  async invalidateTracesFromBlock(blockNumber: number): Promise<void> {
    await this.repo.createQueryBuilder()
      .update(InternalTransactionRecord)
      .set({ delYn: 'Y' })
      .where('block_number >= :blockNumber', { blockNumber })
      .execute();
  }
}
