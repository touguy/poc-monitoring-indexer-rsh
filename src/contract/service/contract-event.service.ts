import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { ethers } from 'ethers';
import { ContractEventRepository } from '../repository/contract-event-record.repository';
import { ContractEventRecord } from '../entity/contract-event-record.entity';
import { BlockchainRpcService } from '../../blockchain/service/blockchain-rpc.service';
import { DynamicContractRepository } from '../repository/dynamic-contract.repository';
import { InternalTransactionRecordRepository } from '../repository/internal-transaction-record.repository';
import { InternalTransactionRecord } from '../entity/internal-transaction-record.entity';
import { BloomUtil } from '../../common/utils/bloom.util';

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
    'event Withdrawal(address indexed src, uint wad)',
    'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
    'event Created(address indexed child)'
  ];
  private iface: ethers.Interface;
  private dynamicAddresses: Set<string> = new Set();

  constructor(
    private readonly contractEventRepo: ContractEventRepository,
    private readonly dynamicContractRepo: DynamicContractRepository,
    private readonly internalTxRepo: InternalTransactionRecordRepository,
    private readonly rpcService: BlockchainRpcService,
    private readonly configService: ConfigService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) { }

  async onModuleInit() {
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

        // 🚀 [Ponder 확장 기능 - 옵션 3] DB에 저장된 기존 동적 팩토리 주소들을 로드합니다.
        const dynamicList = await this.dynamicContractRepo.findAllAddresses();
        dynamicList.forEach(addr => this.dynamicAddresses.add(addr.toLowerCase()));

        this.logger.info(`ContractEventService initialized. Listening to ${this.targetAddresses.length} static addresses, ${this.dynamicAddresses.size} dynamic addresses, and ${this.targetTopics.length} topics.`);
      } else {
        this.logger.warn('CONTRACT_ADDRESSES or CONTRACTS_TOPICS is not configured in .env');
      }
    } catch (err: any) {
      this.logger.error(`Failed to parse contract configuration: ${err.message}`);
    }
  }

  /**
   * 단일 블록 또는 특정 블록 범위의 설정된 컨트랙트 이벤트를 일괄 수집합니다.
   * 다중 블록일 경우 두 번째 인자로 toBlockNumber를 추가 전달합니다.
   * 
   * @param blockNumber 수집 시작 블록 번호
   * @param toBlockNumber 수집 끝 블록 번호 (범위 조회 시)
   * @param logsBloom 블록 헤더의 블룸 필터 문자열 (선택)
   * @param blockHash 블록 해시 문자열 (선택, 내부 트랜잭션 수집 시 사용)
   */
  async fetchAndSaveEventsForBlock(blockNumber: number, toBlockNumber?: number, logsBloom?: string, blockHash?: string): Promise<void> {
    if (this.targetAddresses.length === 0 || this.targetTopics.length === 0) return;

    const fromBlock = blockNumber;
    const toBlock = toBlockNumber ?? blockNumber;

    try {
      // 🚀 [Ponder 확장 기능 - 옵션 1] Bloom Filter 최적화 적용
      const combinedAddresses = [...this.targetAddresses, ...Array.from(this.dynamicAddresses)];
      if (logsBloom && !BloomUtil.isRelevant(logsBloom, combinedAddresses, this.targetTopics)) {
        this.logger.debug(`[Bloom Filter] 블록 ${blockNumber}에는 관심 대상 이벤트가 존재하지 않으므로 RPC 호출을 스킵합니다.`);
        return;
      }

      // 주소 및 토픽 리스트 기반 RPC 필터 구성
      const filter: ethers.Filter = {
        fromBlock,
        toBlock,
        address: combinedAddresses.length > 0 ? combinedAddresses : undefined,
        topics: [this.targetTopics], // RPC 레벨에서 지정 토픽 중 하나라도 매칭(OR)되는 로그만 필터링
      };

      const fetchLogsPromise = this.rpcService.getLogs(filter);
      
      let fetchTracesPromise: Promise<any[]> = Promise.resolve([]);
      // 🚀 [Ponder 확장 기능 - 옵션 4] 내부 트랜잭션 수집 (환경변수 토글)
      if (this.configService.get<string>('ENABLE_TRACE_SYNC') === 'true' && blockHash) {
        fetchTracesPromise = this.rpcService.debugTraceBlockByHash(blockHash).catch(e => {
          this.logger.error(`[Trace Sync] Trace 호출 실패: ${e.message}`);
          return [];
        });
      }

      const [logs, traces] = await Promise.all([fetchLogsPromise, fetchTracesPromise]);

      if (traces && traces.length > 0) {
        const traceRecordsToSave = traces.map((t: any) => {
          const traceEntity = new InternalTransactionRecord();
          traceEntity.transactionHash = t.transactionHash || '';
          traceEntity.blockNumber = blockNumber;
          traceEntity.fromAddress = t.result?.from || '';
          traceEntity.toAddress = t.result?.to || null;
          traceEntity.value = t.result?.value || null;
          traceEntity.callType = t.result?.type || 'CALL';
          return traceEntity;
        });
        await this.internalTxRepo.saveTracesBulk(traceRecordsToSave);
        this.logger.info(`Block ${blockHash}: ${traces.length} internal traces saved.`);
      }

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

          // 제너릭 컬럼 매핑 로직
          if (parsed.name === 'Transfer') {
            record.arg1 = parsed.args[0]?.toString() || null; // from
            record.arg2 = parsed.args[1]?.toString() || null; // to
            record.val1 = parsed.args[2]?.toString() || null; // value
          } else if (parsed.name === 'Approval') {
            record.arg1 = parsed.args[0]?.toString() || null; // owner
            record.arg2 = parsed.args[1]?.toString() || null; // spender
            record.val1 = parsed.args[2]?.toString() || null; // value
          } else if (parsed.name === 'PairCreated' || parsed.name === 'Created') {
            // 🚀 [Ponder 확장 기능 - 옵션 3] 동적 팩토리 주소 추출 및 캐싱
            const childAddr = (parsed.args[2] || parsed.args.pair || parsed.args.child)?.toString();
            if (childAddr) {
              await this.dynamicContractRepo.saveAddress(log.address, childAddr, log.blockNumber);
              this.dynamicAddresses.add(childAddr.toLowerCase());
              this.logger.info(`[Dynamic Factory] 새 자식 컨트랙트 감지: ${childAddr}`);
            }
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

      const rangeStr = fromBlock === toBlock ? fromBlock.toString() : `${fromBlock}-${toBlock}`;

      if (recordsToSave.length > 0) {
        await this.contractEventRepo.saveEventsBulk(recordsToSave);
        this.logger.info(`Block(s) ${rangeStr}: ${recordsToSave.length} contract events parsed and saved.`);
      }

    } catch (e: any) {
      const rangeStr = fromBlock === toBlock ? fromBlock.toString() : `${fromBlock}-${toBlock}`;
      this.logger.error(`Failed to fetch events for block(s) ${rangeStr}: ${e.message}`, { stack: e.stack });
    }
  }

  /**
   * Reorg로 인해 롤백이 필요할 때 호출됩니다.
   */
  async rollbackEvents(blockNumber: number): Promise<void> {
    try {
      await this.contractEventRepo.invalidateEventsFromBlock(blockNumber);
      await this.internalTxRepo.invalidateTracesFromBlock(blockNumber);
    } catch (e: any) {
      this.logger.error(`Failed to rollback events for block ${blockNumber}: ${e.message}`);
    }
  }
}
