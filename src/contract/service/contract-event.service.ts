import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ethers } from 'ethers';
import { ContractEventRepository } from '../repository/contract-event-record.repository';
import { ContractEventRecord } from '../entity/contract-event-record.entity';
import { BlockchainRpcService } from '../../blockchain/service/blockchain-rpc.service';

/**
 * 스마트 컨트랙트 이벤트 수집 및 파싱 서비스 (Phase 3)
 */
@Injectable()
export class ContractEventService implements OnModuleInit {
  private targetAddresses: string[] = [];
  private targetTopics: string[] = [];

  // 파싱을 위한 공통 ABI 모음
  private readonly abi = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)',
    'event Mint(address indexed to, uint amount)',
    'event Burn(address indexed burner, uint256 value)',
    'event Deposit(address indexed dst, uint wad)',
    'event Withdrawal(address indexed src, uint wad)'
  ];
  private iface: ethers.Interface;

  constructor(
    private readonly contractEventRepo: ContractEventRepository,
    private readonly rpcService: BlockchainRpcService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) { }

  onModuleInit() {
    this.iface = new ethers.Interface(this.abi);

    try {
      const addressesStr = this.configService.get<string>('CONTRACT_ADDRESSES');
      const topicsStr = this.configService.get<string>('CONTRACTS_TOPICS');

      if (addressesStr && topicsStr) {
        this.targetAddresses = addressesStr.split(',').map(a => a.trim().toLowerCase());
        
        const eventNames = topicsStr.split(',').map(t => t.trim());
        this.targetTopics = eventNames.map(name => {
          const formattedName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
          const fragment = this.iface.getEvent(formattedName);
          if (fragment) return fragment.topicHash;
          this.logger.warn(`ABI does not contain event: ${formattedName}`);
          return null;
        }).filter((t): t is string => t !== null);

        this.logger.info(`ContractEventService initialized. Listening to ${this.targetAddresses.length} addresses and ${this.targetTopics.length} topics.`);
      } else {
        this.logger.warn('CONTRACT_ADDRESSES or CONTRACTS_TOPICS is not configured in .env');
      }
    } catch (err: any) {
      this.logger.error(`Failed to parse contract configuration: ${err.message}`);
    }
  }

  /**
   * BlockService에서 새 블록을 인덱싱할 때 호출하여 해당 블록의 설정된 하위 컨트랙트 이벤트들을 일괄 수집합니다.
   * 
   * @param blockNumber 수집 대상 블록 번호
   * @param timestamp 블록의 타임스탬프
   */
  async fetchAndSaveEventsForBlock(blockNumber: number, timestamp: Date): Promise<void> {
    if (this.targetAddresses.length === 0 || this.targetTopics.length === 0) return;

    try {
      // 주소 및 토픽 리스트 기반 RPC 필터 구성 (단일 getLogs 호출로 I/O 최소화)
      const filter: ethers.Filter = {
        fromBlock: blockNumber,
        toBlock: blockNumber,
        address: this.targetAddresses,
        topics: [this.targetTopics], // RPC 레벨에서 지정 토픽 중 하나라도 매칭(OR)되는 로그만 필터링
      };

      const logs = await this.rpcService.getLogs(filter);
      if (!logs || logs.length === 0) return;

      const recordsToSave: ContractEventRecord[] = [];

      for (const log of logs) {
        try {
          const parsed = this.iface.parseLog({
            topics: [...log.topics],
            data: log.data,
          });

          if (!parsed) continue;

          const record = new ContractEventRecord();
          record.transactionHash = log.transactionHash;
          record.blockNumber = log.blockNumber;
          record.logIndex = log.index;
          record.contractAddress = log.address;
          record.eventName = parsed.name; // 예: 'Transfer'
          record.timestamp = timestamp;

          // 제너릭 컬럼 매핑 로직
          if (parsed.name === 'Transfer') {
            record.arg1 = parsed.args[0]?.toString() || null; // from
            record.arg2 = parsed.args[1]?.toString() || null; // to
            record.val1 = parsed.args[2]?.toString() || null; // value
          } else if (parsed.name === 'Approval') {
            record.arg1 = parsed.args[0]?.toString() || null; // owner
            record.arg2 = parsed.args[1]?.toString() || null; // spender
            record.val1 = parsed.args[2]?.toString() || null; // value
          } else if (parsed.name === 'Mint' || parsed.name === 'Deposit') {
            record.arg1 = null; // from에 해당하는 주소 없음
            record.arg2 = parsed.args[0]?.toString() || null; // to 또는 dst
            record.val1 = parsed.args[1]?.toString() || null; // amount 또는 wad
          } else if (parsed.name === 'Burn' || parsed.name === 'Withdrawal') {
            record.arg1 = parsed.args[0]?.toString() || null; // burner 또는 src
            record.arg2 = null; // to에 해당하는 주소 없음
            record.val1 = parsed.args[1]?.toString() || null; // value 또는 wad
          } else {
            // 알 수 없는(정의되지 않은 패턴) 예외 이벤트인 경우 로데이터 최소 보존
            record.arg1 = parsed.args[0]?.toString() || null;
            record.arg2 = parsed.args[1]?.toString() || null;
            record.arg3 = parsed.args[2]?.toString() || null;
          }

          recordsToSave.push(record);
        } catch (parseError) {
          // ABI에 없는 이벤트 토픽인 경우 무시 (Silent ignore)
          this.logger.debug(`Unknown log parsing skipped: ${log.transactionHash} - ${log.topics[0]}`);
        }
      }

      if (recordsToSave.length > 0) {
        await this.contractEventRepo.saveEventsBulk(recordsToSave);
        this.logger.info(`Block ${blockNumber}: ${recordsToSave.length} contract events parsed and saved.`);
      }

    } catch (e: any) {
      this.logger.error(`Failed to fetch events for block ${blockNumber}: ${e.message}`, { stack: e.stack });
    }
  }

  /**
   * Reorg로 인해 롤백이 필요할 때 호출됩니다.
   */
  async rollbackEvents(blockNumber: number): Promise<void> {
    try {
      await this.contractEventRepo.invalidateEventsFromBlock(blockNumber);
    } catch (e: any) {
      this.logger.error(`Failed to rollback events for block ${blockNumber}: ${e.message}`);
    }
  }
}
