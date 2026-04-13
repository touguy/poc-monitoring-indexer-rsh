# 코딩 컨벤션 및 스타일 가이드 (Coding Conventions)

본 문서는 이더리움 체인 모니터링 인덱서 시스템의 일관된 코드 품질을 유지하고, AI 및 개발자 간 협업 시 유지보수를 원활히 하기 위한 필수 개발 스타일 가이드(Best Practice)입니다.

---

## 1. 코드 스타일 및 명명 규칙 (.prettierrc 기준)
- 문자열은 **단일 따옴표(`singleQuote: true`)**를 사용하며, 스페이스 2칸 들여쓰기, 후행 쉼표(all) 포맷을 강제합니다.
- **명명 규칙 (Naming Rule)**:
  - 클래스, 인터페이스, 열거형: `PascalCase`
  - 메서드, 변수명, 파라미터: `camelCase`
  - 파일, 폴더명: `kebab-case` (예: `transfer-event.entity.ts`)
  - 상수, 환경 변수: `UPPER_SNAKE_CASE`
  - DB 컬럼: Entity 내부 데코레이터에서 엄격하게 뱀표기법 선언 `@Column({ name: 'block_number' })`
- **타입 제약**: `any` 타입 사용을 원칙적으로 금지합니다. 단, TypeORM이나 라이브러리 타입 호환 불량으로 인해 부득이할 시 무조건 `@ts-expect-error` 주석에 사유를 명시해야 합니다.

## 2. NestJS 아키텍처 및 공통 처리 패턴
- **계층 분리 체계화**: 컨트롤러는 HTTP 입출력과 직렬화에만 집중합니다. DB 조작 등 핵심 비즈니스 로직은 철저하게 Service에 격리되어야 합니다.
- **DTO 유효성 검사**: API 진입 시 `class-validator`의 `@IsString()`, `@IsOptional()` 등으로 값을 강제로 필터링합니다. (White List 필터링 적용 연계)
- **로깅 규칙**:
  - `console.log`의 사용을 법적으로 파기하며 전역 `WinstonLogger` 만을 주입(`WINSTON_MODULE_PROVIDER`) 받아 사용합니다.
- **표준화된 응답과 에러**:
  - 비즈니스 통과 시 `GlobalResponseInterceptor`에 의해 자동으로 `ResultResDto`에 JSON Data가 래핑 처리됩니다.
  - 에러 처리 시 직접 원시 객체를 던지지 않고, `BusinessException(ErrorCode)`을 발생시켜 `GlobalExceptionsFilter`가 책임지고 잡도록 합니다.

## 3. 블록체인(Ethers.js) 연동 및 설계 상세 정책
- **EVM 데이터 처리 디테일**: 컨트랙트 반환 `BigInt` 자료형은 Nest 환경의 JSON 직렬화 불가(Exception)를 방어하기 위해 DB나 응답 페이로드로 들어가기 전 무조건 `.toString()` 처리되어야 합니다.
- **블록/해시 정규표현 정책**: 이더리움 단에서 던져지는 대소문자 혼합 해시나 Address 문자열은 DB에서 효율적인 인덱스와 무결성을 점유하기 위해 삽입 전 필히 `.toLowerCase()`로 정규화합니다.
- **RPC 네트워크 단절 대비 안전성 (재시도 및 백오프 전략)**:
  - 노드의 일시적 `429 Too Many Requests` 상태 등을 고려하여, Promise Call 실패 시 즉각 탈주하지 않고 지수승 기반 시간 연장(예: 1초, 2초, 4초 대기 추가)하는 Retry 기믹을 필수로 붙여야 합니다.
  - `eth_getLogs` 등 무거운 이벤트 구간 조회 시 과부하 셧다운을 방지하기 위해 chunkSize 설정(예: 한번에 2000 블록 이내로 Split)을 고려해 짜여야 합니다.

## 4. 유닛 테스트 (Unit Testing) 구조 규격
- **테스트 핵심 집중 구역**: Controller 및 Repository가 아닌 로직이 모여있는 `Service` 계층을 커버리지 우선 순위(80% 이상)로 잡고 작성합니다.
- **Mocking 전략 (Jest 중심)**: 데이터베이스 연동 테스트 지연을 방지하기 위해 실제 DB 커넥션을 금하며, Repository 메서드(`find`, `save` 등)를 `jest.fn().mockResolvedValue` 등으로 철저히 목(Mock)업 치환하여 통과시킵니다.
- **`it` 기술 설명 패턴**:
  - 조건부 명세 구조: `'should <수행 동작 목표> when <기준 트리거 및 상황>'` (예: *should return empty array when no blocks exist*)
