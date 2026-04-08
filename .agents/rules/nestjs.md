# NestJS 패턴 규칙

## 모듈 구조
각 도메인 폴더는 다음 서브디렉토리 구조를 따른다:
```
src/<domain>/
  controller/
    <domain>.controller.ts
  service/
    <domain>.service.ts
  repository/
    <domain>.repository.ts
  entity/
    <domain>.entity.ts
  dto/
    <domain>-create-req.dto.ts
    <domain>-query.dto.ts
  <domain>.module.ts
```

## Controller
- HTTP 요청/응답 변환만 담당. 비즈니스 로직 작성 금지.
- 서비스 결과를 그대로 반환하고 직렬화는 `GlobalResponseInterceptor`에 위임.
- DTO로 입력 검증을 위임. Controller에서 직접 검증 로직 작성 금지.

```typescript
// ✅ 올바른 패턴
@Get()
findAll(): Promise<TransferEvent[]> {
  return this.transferEventService.findAll();
}

// ❌ 잘못된 패턴 — 비즈니스 로직이 Controller에 있음
@Get()
async findAll() {
  const events = await this.repo.find();
  return events.filter(e => e.amount > 0);
}
```

## Service
- 생성자 주입으로만 의존성 주입. `new Service()` 직접 생성 금지.
- `async/await` 사용. `Promise` 체인(`.then().catch()`) 지양.
- 모든 외부 호출(RPC, DB)은 try/catch 감싸고 Logger로 에러 기록.
- `WINSTON_MODULE_PROVIDER`로 Logger 주입:
  ```typescript
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}
  ```

## Repository
- `BaseRepository`를 상속하여 구현:
  ```typescript
  @Injectable()
  export class TransferEventRepository extends BaseRepository {
    constructor(dataSource: DataSource) {
      super(dataSource);
    }

    private repo(entityManager?: EntityManager): Repository<TransferEvent> {
      return this.getRepository(TransferEvent, entityManager);
    }

    findByContractAddress(address: string): Promise<TransferEvent[]> {
      return this.repo().find({ where: { contractAddress: address } });
    }
  }
  ```
- Module에서 `DataSource`를 Provider로 주입해야 함.
- Service에서 TypeORM `Repository<T>`를 직접 `@InjectRepository()`로 주입하는 것 지양.

## DTO
- `class-validator` 데코레이터로 모든 필드 검증.
- 선택 필드는 `@IsOptional()` + 타입 검증 데코레이터 함께 사용.
- 요청 DTO 명명 패턴: `<Domain>CreateReqDto`, `<Domain>QueryDto`.

```typescript
export class QueryTransferEventDto {
  @IsOptional()
  @IsString()
  contractAddress?: string;

  @IsOptional()
  @IsNumberString()
  fromBlock?: string;
}
```

## Entity
- `BaseEntity`를 상속: `delYn`, `sysRegDtm`, `sysUpdDtm` 자동 포함.
- PK: `@PrimaryGeneratedColumn()` (bigint auto-increment) 또는 `@PrimaryGeneratedColumn('uuid')`
- DB 인덱스: `@Index()` 데코레이터 선언 (복합 인덱스 포함)
- BigInt 컬럼은 `@Column({ type: 'varchar' })`로 string 저장
- 비즈니스 로직 포함 금지. 데이터 매핑 스키마만 정의.
- 컬럼명은 `@Column({ name: 'snake_case_name' })`으로 명시.

```typescript
@Entity({ name: 'transfer_events' })
@Index(['contractAddress', 'blockNumber'])
export class TransferEvent extends BaseEntity {
  @PrimaryGeneratedColumn({ name: 'id' })
  id: number;

  @Column({ name: 'block_number', type: 'varchar', length: 20 })
  blockNumber: string; // ← BigInt를 string으로 저장

  @Column({ name: 'contract_address', type: 'varchar', length: 42 })
  contractAddress: string;
}
```

## 응답 형식 (ResultResDto)
- 모든 Controller 반환값은 `GlobalResponseInterceptor`가 자동으로 `ResultResDto`로 래핑.
- 메시지를 함께 반환하려면 서비스에서 `{ data, message }` 형태로 반환:
  ```typescript
  // Service
  return { data: events, message: '조회 성공' };

  // GlobalResponseInterceptor가 ResultResDto.successWithMessage(data, message)로 변환
  ```

## 예외 처리 (BusinessException)
- 비즈니스 규칙 위반 시 `BusinessException` 사용:
  ```typescript
  throw new BusinessException(ErrorCode.NOT_FOUND_TRANSFER_EVENT);
  ```
- `ErrorCode`는 `src/common/exceptions/error-code.enum.ts`에 중앙 관리:
  ```typescript
  static readonly NOT_FOUND_TRANSFER_EVENT = new ErrorCode(
    HttpStatus.NOT_FOUND,
    'I001',
    '이벤트를 찾을 수 없습니다',
  );
  ```
- `GlobalExceptionsFilter`가 전역 적용되어 있으므로 Controller에서 try/catch 불필요.

## Config
- 환경 변수 접근은 항상 `ConfigService` 경유:
  ```typescript
  // ✅
  this.config.getOrThrow<string>('RPC_URL');
  // ❌
  process.env.RPC_URL
  ```
- 없으면 앱이 시작되지 않아야 할 변수는 `getOrThrow()` 사용.
- 선택적 변수는 `get<T>('KEY', defaultValue)` 사용.

## AppModule
- 모듈 조합만 담당. 비즈니스 로직, Provider 직접 선언 금지.
- `WinstonModule.forRoot(winstonOptions)` 전역 등록 필수.
- `APP_INTERCEPTOR`로 `GlobalResponseInterceptor` 전역 등록.
- `APP_FILTER`로 `GlobalExceptionsFilter` 전역 등록.
