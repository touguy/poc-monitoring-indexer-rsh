import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DynamicContract } from '../entity/dynamic-contract.entity';

@Injectable()
export class DynamicContractRepository {
  constructor(
    @InjectRepository(DynamicContract)
    private readonly repo: Repository<DynamicContract>,
  ) {}

  /**
   * 동적으로 생성된 팩토리 자식 주소를 모두 불러옵니다.
   */
  async findAllAddresses(): Promise<string[]> {
    const contracts = await this.repo.find({
      select: ['childAddress'],
      where: { delYn: 'N' },
    });
    return contracts.map(c => c.childAddress);
  }

  /**
   * 새로운 동적 주소를 저장합니다. 중복은 무시합니다.
   */
  async saveAddress(factoryAddress: string, childAddress: string, createdBlock: number): Promise<void> {
    const contract = new DynamicContract();
    contract.factoryAddress = factoryAddress.toLowerCase();
    contract.childAddress = childAddress.toLowerCase();
    contract.createdBlock = createdBlock;

    await this.repo.createQueryBuilder()
      .insert()
      .into(DynamicContract)
      .values(contract)
      .orIgnore() // idx_dynamic_contracts_child unique index 덕분에 중복 무시
      .execute();
  }
}
