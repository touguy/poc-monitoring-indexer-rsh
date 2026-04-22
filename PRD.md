# PRD.md — PoC Monitoring Indexer (RSH)

## 1. 프로젝트 개요
NestJS와 PostgreSQL을 사용하여 이더리움(Sepolia/Mainnet 호환) 네트워크의 Chain Reorg(체인 재조직)를 실시간으로 감지하고, 상태를 추적하며, Reorg 발생 시 DB 기록 및 알림(로그)을 수행하고 지정된 스마트 컨트랙트의 이벤트를 수집하여 DB에 저장하는 고성능 백엔드 애플리케이션입니다.

## 2. 핵심 아키텍처 사양 (High-Performance Core)
본 시스템은 대량의 블록체인 데이터를 효율적으로 처리하기 위해 Ponder Core의 최적화 전략을 표준 사양으로 채택하고 있습니다.

### 🚀 고성능 데이터 수집 및 네트워크 최적화
- **WebSocket Block Header 수집**: `newHeads` 페이로드(해시, 부모 해시, 타임스탬프 등)를 직접 파싱하여 RPC 호출 없이 실시간 인덱싱을 수행합니다. (Primary Realtime Path)
- **JSON-RPC Batching**: 여러 RPC 요청을 단일 HTTP 페이로드로 묶어 전송함으로써 TCP 오버헤드를 줄이고 Rate Limit을 효과적으로 방어합니다.
- **Bulk & Dynamic Chunking**: 초기 동기화 시 `Promise.all` 병렬 처리를 수행하며, 노드 한도 초과 시 범위를 유연하게 조정하여 안정성을 확보합니다.
- **Bloom Filter 기반 필터링**: 블록 헤더의 `logsBloom`을 먼저 검사하여, 필요한 이벤트가 존재할 가능성이 있을 때만 로그 조회 RPC를 수행합니다.

### 🛡️ 실시간 Chain Reorg 대응
- **Realtime Backtracing**: 실시간 블록 수신 즉시 부모 해시를 대조하여 분기를 감지하고, 즉각적인 역추적 및 롤백을 수행합니다.
- **Multi-stage Finality 관리**: 노드의 `safe`, `finalized` 태그를 추적하여 DB 내 블록 상태를 단계적으로 확정합니다.

---

## 3. 기술 스택
| 구분 | 기술 / 라이브러리 |
|--------|------|
| **Framework** | NestJS 11 |
| **Language** | TypeScript 5.7 (ES2023, module nodenext) |
| **DB & ORM** | PostgreSQL (`pg`) + TypeORM 0.3 |
| **Blockchain** | ethers.js 6 (WebSocket 및 순수 RPC 읽기 용도) |
| **Scheduling** | `@nestjs/schedule` (Cron Job 상태 폴링 검증 용도) |
| **Validation** | `class-validator` + `class-transformer` |
| **Logging** | `nest-winston` + `winston` + `winston-daily-rotate-file` |
| **Environment** | `@nestjs/config` (`ConfigService`) + `dotenv-cli` |

---

## 4. 문서 지도 (Documentation Map)
상세한 비즈니스 로직과 시스템 정책은 아래 문서를 참조하십시오.

- 🤖 **[AGENTS.md (AI 지침 및 문서 인덱스)](./AGENTS.md)**
- 📄 **[BUSINESS_LOGIC.md (핵심 비즈니스 로직 / 동기화 알고리즘)](.agent/BUSINESS_LOGIC.md)**
- 📄 **[SYSTEM_POLICY.md (전역 예외/로깅 시스템 규칙 및 환경 변수)](.agent/SYSTEM_POLICY.md)**
- 📄 **[DB_SCHEMA.md (데이터베이스 스키마 스펙)](.agent/DB_SCHEMA.md)**
- 📄 **[API_SPEC.md (REST API 명세서)](.agent/API_SPEC.md)**
- 📄 **[CODING_CONVENTION.md (코딩 스타일 가이드 및 컨벤션)](.agent/CODING_CONVENTION.md)**