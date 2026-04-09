# REST API 명세서 (API Spec)

이 문서는 외부 통신을 위해 개방된 HTTP REST 엔드포인트를 정의합니다. 
(Swagger `@ApiTags` 데코레이터를 이용해 코드상에 명세가 1:1로 일대일 매핑되어야 합니다.)

---

## 1. 전역 응답 및 예외 규격

### 1-1. `ResultResDto` 공통 응답 규격
시스템에서 반환되는 HTTP 비즈니스 응답은 컨트롤러 단에서 리턴 시 무조건 전역 Interceptor(`GlobalResponseInterceptor`)를 거쳐 아래와 같이 `ResultResDto<T>` 포맷으로 매핑(Wrapping)되어 반환됩니다.

**성공 시 JSON 응답 예시:**
```json
{
  "success": true,
  "message": "요청이 성공적으로 처리되었습니다.",  // 또는 응답 커스텀 메시지
  "data": { ... } // 실제 페이로드 객체
}
```

### 1-2. 에러 (Exception) 반환 규격
비즈니스 로직에서 예상된 에러 발생 시 `throw new BusinessException(ErrorCode.XXX)`을 발생시키며, 전역 익셉션 필터(`GlobalExceptionsFilter`)가 이를 가로채어 다음과 같이 안전한 포맷으로 변환합니다. HTTP 상태 코드와 무관하게 규격이 안전하게 떨어집니다.

**실패 시 JSON 응답 예시:**
```json
{
  "success": false,
  "message": "[에러 코드] 비즈니스 실패 메시지 명",
  "data": null
}
```

---

## 2. 블록 모니터링 관련 엔드포인트 (`/blocks`)

**블록 목록 조회 (GET /blocks)**
- **용도**: 수집된 블록 리스트를 다중 조회하며, 상태코드 기반 페이징을 지원
- **Query Parameters**:
  - `status` (String, Optional): 필터 조건 (예: `'UNFINALIZED'`, `'SAFE'`, `'FINALIZED'`)
  - `page` (Number, 기본 1): 조회할 페이지 번호
  - `limit` (Number, 기본 10): 1회당 호출할 페이징 갯수 사이즈
- **반환 데이터 포맷**:
  ```ts
  {
    "data": [...BlockRecord 엔티티 목록],
    "total": 1234
  }
  ```

**블록 단일 레코드 조회 (GET /blocks/:blockNumber)**
- **용도**: URL Path 파라미터로 주어진 특정 블록 번호의 정밀한 상태를 조회
- **Path Parameters**:
  - `blockNumber` (Number, Required, *NestJS `ParseIntPipe` 적용 필수*)
- **실패 예외**:
  - DB에서 해당 블록을 찾지 못할 경우 비즈니스 에러 (`ErrorCode.NOT_FOUND_BLOCK`) 발생
- **반환 데이터 포맷**: `BlockRecord` 엔티티 단일 객체 반환.

---

## 3. 재조직 이력 조회 엔드포인트 (`/reorgs`)

**체인 분기 감지 이력 조회 (GET /reorgs)**
- **용도**: 지금까지 시스템이 발굴한 블록 체인 Reorg (분기/고아블록 발생) 감지 정보 조회용
- **Query Parameters (필터 기능 지원)**:
  - `fromBlock` (Number, Optional): 조회를 시작할 최하 블록 번호 범위조건
  - `toBlock` (Number, Optional): 조회를 마칠 최상 블록 번호 범위조건
- **반환 데이터 포맷**:
  ```ts
  {
    "data": [...ReorgLog 엔티티 목록],
    "total": 5
  }
  ```
