# Security Review Skill

## 트리거 조건
다음 파일이 수정되면 자동으로 이 스킬을 실행한다:
- `src/blockchain/**`
- `src/**/*.entity.ts`
- `.env*`
- `docker-compose.yml`
- `Dockerfile`

## 보안 점검 체크리스트

### 시크릿 / 인증 정보
- [ ] 코드에 하드코딩된 private key, API key, RPC URL이 없는가?
  ```bash
  grep -r "0x[a-fA-F0-9]\{64\}" src/  # private key 패턴
  grep -r "infura\|alchemy\|https://" src/ --include="*.ts"
  ```
- [ ] `.env` 파일이 `.gitignore`에 등록되어 있는가?
- [ ] 로그에 민감한 정보(주소, 금액)가 과도하게 출력되지 않는가?

### 입력 검증
- [ ] Controller의 모든 입력 파라미터에 class-validator 데코레이터가 있는가?
- [ ] 컨트랙트 주소 입력 시 `ethers.isAddress()` 검증이 있는가?
- [ ] 블록 범위 파라미터(fromBlock, toBlock)에 상한선이 있는가?

### RPC / 외부 호출
- [ ] RPC 실패 시 에러가 외부에 그대로 노출되지 않는가?
- [ ] RPC 응답 데이터를 신뢰하기 전에 타입 검증이 있는가?

### DB / TypeORM
- [ ] Raw query 사용 시 파라미터 바인딩을 사용하는가? (SQL injection 방지)
- [ ] 민감한 컬럼에 불필요한 `@Column({ select: false })` 누락은 없는가?

### Docker / 인프라
- [ ] `docker-compose.yml`에 DB 비밀번호가 하드코딩되어 있지 않은가?
- [ ] 컨테이너가 root 권한으로 실행되지 않는가?

## 보고 형식
점검 결과를 다음 형식으로 출력:
```
🔒 보안 점검 결과
==================
수정된 파일: <파일명>

✅ 통과 항목: X개
⚠️  주의 항목: Y개
❌ 취약점 발견: Z개

[취약점 상세]
- <파일:라인>: <설명> → <권장 수정 방법>
```
