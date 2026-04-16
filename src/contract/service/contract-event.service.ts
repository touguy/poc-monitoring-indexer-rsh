import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ethers } from 'ethers';
import { ContractEventRepository } from '../repository/contract-event-record.repository';
import { ContractEventRecord } from '../entity/contract-event-record.entity';
import { BlockchainRpcService } from '../../blockchain/service/blockchain-rpc.service';

/**
 * 스마트 컨트랙트 모니터링 필터 구조체
 */
interface MonitorConfig {
  address: string;
  topics: string[];
}

/**
 * 스마트 컨트랙트 이벤트 수집 및 파싱 서비스 (Phase 3)
 */
@Injectable()
export class ContractEventService implements OnModuleInit {
  private monitorConfigs: MonitorConfig[] = [];
  
  // 파싱을 위한 최소 공통 ABI 모음 (본 PoC에서는 Transfer 예시 사용)
  private readonly abi = [
    'event Transfer(address indexed from, address indexed to, uint256 value)',
    'event Approval(address indexed owner, address indexed spender, uint256 value)'
  ];
  private iface: ethers.Interface;

  constructor(
    private readonly contractEventRepo: ContractEventRepository,
    private readonly rpcService: BlockchainRpcService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  onModuleInit() {
    this.iface = new ethers.Interface(this.abi);
    
    try {
      const configJson = this.configService.get<string>('MONITOR_CONTRACTS_JSON');
      if (configJson) {
        this.monitorConfigs = JSON.parse(configJson);
        this.logger.info(`ContractEventService initialized with ${this.monitorConfigs.length} contracts to monitor.`);
      } else {
        this.logger.warn('MONITOR_CONTRACTS_JSON is not configured in .env');
      }
    } catch (err: any) {
      this.logger.error(`Failed to parse MONITOR_CONTRACTS_JSON: ${err.message}`);
    }
  }

  /**
   * BlockService에서 새 블록을 인덱싱할 때 호출하여 해당 블록의 설정된 하위 컨트랙트 이벤트들을 일괄 수집합니다.
   * 
   * @param blockNumber 수집 대상 블록 번호
   * @param timestamp 블록의 타임스탬프
   */
  async fetchAndSaveEventsForBlock(blockNumber: number, timestamp: Date): Promise<void> {
    if (this.monitorConfigs.length === 0) return;

    try {
      // 효율성을 위해 모든 모니터 대상 주소를 배열로 묶어 단일 getLogs 호출 (RPC I/O 최소화)
      const addresses = this.monitorConfigs.map(c => c.address);
      // 토픽 필터 최적화 (본 PoC에서는 가장 단순한 방식으로 OR 필터 설정, 혹은 주소로만 필터하고 로컬에서 파싱)
      // 토픽이 여러 개일 수 있으나 Ethers/RPC 스펙상 [[topic1], [topic2]] 방식이 복잡할 수 있으므로, 
      // 주소 기반 필터링 후 로컬에서 토픽 검증하는 방식 채택

      const filter: ethers.Filter = {
        fromBlock: blockNumber,
        toBlock: blockNumber,
        address: addresses,
      };

      const logs = await this.rpcService.getLogs(filter);
      if (!logs || logs.length === 0) return;

      const recordsToSave: ContractEventRecord[] = [];

      for (const log of logs) {
        // 모니터링 토픽에 해당하는 로그만 선별
        const isTargetTopic = this.monitorConfigs.some(config => 
          config.address.toLowerCase() === log.address.toLowerCase() && 
          config.topics.includes(log.topics[0])
        );

        if (!isTargetTopic) continue;

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
