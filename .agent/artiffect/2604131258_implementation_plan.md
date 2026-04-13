# 문서 구조 리팩토링 (AGENTS.md 및 상세 비즈니스 로직 분리)

AI 보조 개발 환경과 시스템의 장기적인 유지보수 관리를 위해 현재 `PRD.md`에 집중된 내용을 역할별로 분리하고, AI의 진입점(Entry Point)이 될 수 있는 `AGENTS.md`를 표준화하여 구축합니다.

## User Review Required

> [!IMPORTANT]
> 문서의 내용 생략이나 삭제 없이 **구조적인 이동**만 수행합니다. 분산된 문서를 연결하는 링크 구조가 프로젝트 루트 및 `.agent/docs/` 폴더 전반에 걸쳐 올바르게 동작하는지 확인이 필요합니다.

## Proposed Changes

문서의 성격에 따라 다음 파일 생성 및 수정 작업을 진행합니다.

---

### 마스터 진입점 문서 생성

#### [NEW] [AGENTS.md](file:///home/touguy/dev/poc-monitoring-indexer-rsh/AGENTS.md)
AI 에이전트(혹은 새로운 개발자)가 프로젝트에 투입되었을 때 가장 먼저 읽어야 할 핵심 규칙과 문서 구조(Index)를 정의합니다.
- **포함될 내용:**
  1. 프로젝트 핵심 메타데이터 및 AI의 포지션 설정 (NestJS / 이더리움 블록체인 인덱서)
  2. 에이전트 핵심 행동 지침 (금지 사항, 코드 수정 원칙)
  3. **문서 지도 (Documentation Map)**: 기능 구현, DB 열람, API 스펙 파악 등을 위해 어떤 문서를 보아야 하는지 명시적으로 링킹.

---

### 상세 문서 (Detail Documents) 생성

#### [NEW] [BUSINESS_LOGIC.md](file:///home/touguy/dev/poc-monitoring-indexer-rsh/.agent/BUSINESS_LOGIC.md)
`PRD.md` 내 가장 방대한 양을 차지하던 **"7. 핵심 비즈니스 로직 상세 설계"** 부분을 완전히 덜어내어 이쪽으로 이관합니다.
- **포함될 내용:**
  - 초기 동기화 엔진 (Initial Sync) 알고리즘
  - WebSocket 기반 실시간 수신 큐 알고리즘 (Phase 1)
  - Polling 기반 상태 자동화 및 Reorg, Gap 감지 알고리즘 (Phase 2)
  - 스마트 컨트랙트 이벤트 모니터링 아키텍처 (Phase 3)

#### [NEW] [SYSTEM_POLICY.md](file:///home/touguy/dev/poc-monitoring-indexer-rsh/.agent/SYSTEM_POLICY.md)
운영 설정 및 규칙에 관련된 내용을 이관합니다. 기존 `PRD.md`의 **5. 공통 컴포넌트 정책** 및 **6. 환경 변수 스펙** 부분입니다.
- **포함될 내용:**
  - 의존성 주입, 예외 처리(ResultResDto), 로깅 규칙 등
  - 동적 구성을 위한 필수 `.env` 리스트와 목적

---

### 기존 문서 (Master) 슬림화

#### [MODIFY] [PRD.md](file:///home/touguy/dev/poc-monitoring-indexer-rsh/PRD.md)
세부 구현 내용은 모두 위 파일들로 이관하고, 프로젝트를 빠르게 파악할 수 있는 **상위 개념(High-level)**만 남깁니다.
- **유지할 내용:** 프로젝트 개요, 기술 스택, 앱 계층(Layer) 아키텍처 원칙.
- **수정할 내용:** "주의 사항" 및 문서 목차 부분에 `AGENTS.md`, `BUSINESS_LOGIC.md`, `SYSTEM_POLICY.md`를 포함한 전체 하위 문서 링크 갱신.

## Open Questions

> [!NOTE]
> `PRD.md`가 참조할 상세 문서들의 경로(`/.agent/`) 외에, 폴더명을 다른 것으로 변경하고 싶으신 부분이 있으신가요? (예: `docs/`, `AI_MD/` 등). 없으시면 현행유지(`.agent/docs/`)로 진행하겠습니다.

## Verification Plan

### Manual Verification
- 파일들이 모두 올바른 경로에 생성되었는지 텍스트 탐색 후 확인.
- Markdown 프리뷰를 띄워 파일 간의 링크(`[문서명](경로)`) 클릭 시 정상적으로 다른 파일로 이동 가능한지(Broken link 여부) 확인.
