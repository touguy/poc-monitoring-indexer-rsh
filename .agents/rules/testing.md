# 테스트 규칙

## 파일 위치
- 유닛 테스트: 소스 파일과 같은 디렉터리 (`*.spec.ts`)
- E2E 테스트: `test/*.e2e-spec.ts`

## 유닛 테스트 기준
- 테스트 대상: Service 레이어 (비즈니스 로직 집중)
- 목표 커버리지: 서비스 레이어 **80% 이상**
- Repository는 typed mock 사용. 실제 DB 연결 금지.

## Mock 패턴
```typescript
// Repository 모킹
const mockRepo = {
  find: jest.fn(),
  findOneBy: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  upsert: jest.fn(),
} as unknown as Repository<TransferEvent>;

// BlockchainService 모킹
const mockBlockchainService = {
  getCurrentBlock: jest.fn().mockResolvedValue(20000000),
  fetchTransferEvents: jest.fn().mockResolvedValue([]),
  getContractMetadata: jest.fn().mockResolvedValue({
    address: '0xabc',
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
    totalSupply: 1000000n,
  }),
} as Partial<BlockchainService>;
```

## 테스트 구조
```typescript
describe('StablecoinService', () => {
  let service: StablecoinService;
  let repo: jest.Mocked<Repository<TransferEvent>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StablecoinService,
        { provide: getRepositoryToken(TransferEvent), useValue: mockRepo },
      ],
    }).compile();

    service = module.get(StablecoinService);
  });

  describe('findAll', () => {
    it('should return all transfer events', async () => {
      // Arrange
      mockRepo.find.mockResolvedValue([]);
      // Act
      const result = await service.findAll();
      // Assert
      expect(result).toEqual([]);
      expect(mockRepo.find).toHaveBeenCalledTimes(1);
    });
  });
});
```

## 테스트 명명 규칙
- `describe`: 클래스명 또는 메서드명
- `it`: `'should <동작> when <조건>'` 패턴
  - ✅ `'should return empty array when no events exist'`
  - ❌ `'test1'`, `'works correctly'`

## 금지 사항
- 테스트에서 `console.log` 사용 금지 (테스트 출력 오염)
- `setTimeout` / `sleep` 사용 금지 → jest fake timers 사용
- 실제 RPC 엔드포인트 호출 금지 (네트워크 의존 테스트)
- 테스트 간 공유 상태(전역 변수) 사용 금지
