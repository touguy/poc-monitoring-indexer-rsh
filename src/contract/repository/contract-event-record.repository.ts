import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ContractEventRecord } from '../entity/contract-event-record.entity';

@Injectable()
export class ContractEventRepository extends Repository<ContractEventRecord> {
  constructor(private dataSource: DataSource) {
    super(ContractEventRecord, dataSource.createEntityManager());
  }

  /**
   * 이벤트 배열을 데이터베이스에 일괄 저장합니다.
   * 중복(Unique Constraint) 충돌을 무시(Do Nothing)하고 삽입합니다.
   * 
   * @param records 저장할 컨트랙트 이벤트 엔티티 배열
   */
  async saveEventsBulk(records: ContractEventRecord[]): Promise<void> {
    if (!records || records.length === 0) return;

    await this.createQueryBuilder()
      .insert()
      .into(ContractEventRecord)
      .values(records)
      .orIgnore() // 중복 이벤트 방지
      .execute();
  }

  /**
   * Reorg 발생 시, 특정 블록 번호 이후의 이벤트 기록을 무효화(논리 삭제)합니다.
   */
  async invalidateEventsFromBlock(blockNumber: number): Promise<void> {
    await this.createQueryBuilder()
      .update(ContractEventRecord)
      .set({ delYn: 'Y' })
      .where('block_number >= :blockNumber', { blockNumber })
      .execute();
  }
}
