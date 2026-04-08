# /project:review — 코드 리뷰

다음 순서로 현재 변경된 파일 또는 지정된 파일을 리뷰한다.

## 실행 절차

1. **변경 파일 확인**
   ```bash
   git diff --name-only HEAD
   ```
   변경 파일이 없으면 `$ARGUMENTS`로 전달된 파일 경로를 대상으로 한다.

2. **각 파일에 대해 아래 체크리스트를 순서대로 점검**

### 아키텍처 점검
- [ ] Controller에 비즈니스 로직이 없는가?
- [ ] Service에서 `process.env` 직접 접근이 없는가?
- [ ] Entity에 비즈니스 로직이 없는가?
- [ ] 생성자 주입을 사용하는가?
- [ ] Repository가 `BaseRepository`를 상속하는가?
- [ ] 도메인 폴더가 `controller/`, `service/`, `repository/`, `entity/`, `dto/` 서브디렉토리 구조인가?

### 코드 품질 점검
- [ ] `any` 타입 사용 여부
- [ ] `console.log` 사용 여부 (`WINSTON_MODULE_PROVIDER` Logger로 교체 필요)
- [ ] 명시적 반환 타입이 선언되었는가?
- [ ] 명명 규칙 준수 (PascalCase, camelCase, UPPER_SNAKE_CASE)

### 응답/예외 패턴 점검
- [ ] Controller가 `ResultResDto`를 직접 생성하지 않는가? (인터셉터에 위임)
- [ ] 비즈니스 예외에 `BusinessException(ErrorCode.XXX)`를 사용하는가?
- [ ] Controller에서 불필요한 try/catch가 없는가? (GlobalExceptionsFilter에 위임)

### 블록체인 레이어 점검 (blockchain/, indexer/ 변경 시)
- [ ] BigInt → string 변환 후 DB 저장하는가?
- [ ] 주소를 `.toLowerCase()`로 정규화하는가?
- [ ] RPC 호출에 에러 핸들링이 있는가?
- [ ] Provider를 `BlockchainService` 외부에서 직접 생성하지 않는가?

### 보안 점검
- [ ] 하드코딩된 private key, API key, RPC URL이 없는가?
- [ ] 사용자 입력에 class-validator 검증이 적용되었는가?

3. **리뷰 결과 출력**
   각 항목에 대해 ✅ 통과 / ⚠️ 주의 / ❌ 문제 로 표시하고, 문제가 있는 경우 수정 제안 코드를 함께 제시한다.
