# 코드 스타일 규칙

## 포맷 (.prettierrc 기준)
- 문자열: 단일 따옴표 (`singleQuote: true`)
- 후행 쉼표: 모든 위치 (`trailingComma: all`)
- 들여쓰기: 스페이스 2칸

## TypeScript 명명 규칙
| 대상 | 규칙 | 예시 |
|------|------|------|
| 클래스, 인터페이스, 열거형 | PascalCase | `BlockchainService`, `ParsedTransferEvent` |
| 메서드, 변수, 파라미터 | camelCase | `getLatestBlock`, `fromBlock` |
| 상수, 환경 변수 | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `RPC_URL` |
| 파일, 폴더 | kebab-case | `blockchain.service.ts`, `transfer-event.entity.ts` |
| private 클래스 멤버 | 접두사 없이 camelCase | `httpProvider` (언더스코어 접두사 사용 안 함) |
| DB 컬럼명 | snake_case (명시적 선언) | `@Column({ name: 'block_number' })` |

## 타입 규칙
- `any` 사용 금지. 불가피한 경우 `@ts-expect-error` + 이유 주석.
- 모든 `public` 메서드에 반환 타입 명시.
- 객체 형태(shape) → `interface`. 유니언/유틸리티 타입 → `type`.
- `null` 대신 `undefined` 선호. 단, TypeORM nullable 컬럼은 `null` 허용.
- `BigInt`를 DB에 저장할 때는 반드시 `.toString()` 변환 후 저장.

## 로깅 패턴
- `console.log` 금지. `WinstonModule`을 통한 `Logger` 주입 사용.
- 서비스 생성자에서 `WINSTON_MODULE_PROVIDER`로 주입:
  ```typescript
  import { Inject } from '@nestjs/common';
  import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
  import { Logger } from 'winston';

  @Injectable()
  export class IndexerService {
    constructor(
      @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
    ) {}

    someMethod(): void {
      this.logger.info('Processing block', { blockNumber: 123 });
      this.logger.error('RPC failed', { error: err.message });
    }
  }
  ```
- 로그 레벨: `error` (복구 불가 오류), `warn` (주의 필요), `info` (상태 변경), `debug` (디버깅용)

## 금지 패턴
```typescript
// ❌ 금지
console.log(data);
const x: any = response;
process.env.RPC_URL;
@ts-ignore

// ✅ 대안
this.logger.info('data', { data });
const x: ParsedTransferEvent = response;
this.config.getOrThrow<string>('RPC_URL');
// @ts-expect-error — ethers v6 type mismatch in EventLog.args
```

## import 순서
1. Node.js 내장 모듈
2. 외부 패키지 (`@nestjs/*`, `ethers`, `typeorm`, `winston`)
3. 내부 모듈 (`../`, `./`)
