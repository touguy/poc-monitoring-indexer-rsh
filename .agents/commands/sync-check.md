# /project:sync-check — 인덱서 동기화 상태 점검

인덱서가 최신 블록을 따라가고 있는지 진단한다.

## 실행 절차

1. **인덱서 상태 API 조회**
   ```bash
   curl -s http://localhost:3000/indexer/states | jq .
   ```

2. **상태 분석 항목**
   각 컨트랙트에 대해:
   - `lastProcessedBlock` vs 현재 블록 차이 계산
   - `status` 값 확인 (`live` / `syncing` / `error`)
   - `errorMessage`가 있는 경우 원인 분석

3. **판정 기준**
   | 블록 차이 | 상태 | 조치 |
   |-----------|------|------|
   | 0~10 | ✅ 정상 | 없음 |
   | 11~100 | ⚠️ 약간 지연 | 로그 모니터링 |
   | 100 이상 | ❌ 심각한 지연 | 재싱크 필요 |
   | `error` status | ❌ 오류 | 에러 원인 분석 |

4. **로그 확인**
   ```bash
   docker-compose logs --tail=50 app | grep -E "(ERROR|WARN|syncing|sync complete)"
   ```

5. **문제 발견 시**
   - `IndexerService.checkSyncHealth()` 수동 트리거 방법 안내
   - RPC 연결 상태 확인: `src/blockchain/blockchain.service.ts`의 Provider 초기화 로그 확인
   - DB 연결 상태 확인
