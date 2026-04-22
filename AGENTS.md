# AGENTS.md — AI Assistant Guidelines & Project Index

모든 답변은 한국어로 해주세요. 그리고 AI 계획 및 실행 관련 Artiffect 들은 생성후 ./.agent/artiffect 로 YYMMDDhhmm_ 형식을 앞에 추가 해서 저장해주세요. 

이 문서는 이더리움 블록체인 인덱서 (PoC Monitoring Indexer) 프로젝트의 AI 지원 개발을 위한 전역 가이드라인 및 문서 색인입니다.
모든 AI 에이전트(Claude, Antigravity 등)는 코드베이스 분석 및 수정 시 반드시 이 문서와 연결된 하위 문서들을 우선적으로 준수해야 합니다.

## 1. 프로젝트 주요 메타데이터
- **소개**: NestJS와 PostgreSQL을 기반으로 동작하는 이더리움(Sepolia/Mainnet) 네트워크 특화 Chain Reorg 감지, 상태 관리, 이벤트 캡처 모니터링 시스템.
- **핵심 프레임워크**: NestJS 11, TypeScript 5.7, TypeORM 0.3, ethers.js 6

## 2. AI 행동 지침 및 원칙
1. **코드 수정 전 문서 확인**: 아키텍처나 비즈니스 로직을 변경하기 전에 본 문서의 '문서 지도'를 참고하여 담당 규칙을 숙지할 것.
2. **도메인 분리 유지**: 시스템은 도메인 주도 단위(Module)로 엄격히 철저하게 분리(`AppModule`, `BlockModule`, `ReorgModule` 등)되어 동작하므로, 타 도메인의 관심사를 침범하는 강결합 코드를 작성하지 말 것.
3. **주석 강제화**: 신규 로직이나 메서드 작성 시, 반드시 동작 원리와 목적을 설명하는 한글 주석(JSDoc 포함)을 작성할 것. (문서화 주도 개발 지향)
4. **비즈니스 격리**: Controller나 Entity 파일 내부에 비즈니스 로직을 삽입하는 행위를 절대 금지함.

## 3. 문서 지도 (Documentation Map)
수행하려는 태스크의 성격에 따라 아래 분리된 상세 문서를 우선적으로 읽고 지침에 맞춰 구현하세요.

### 📌 기획 및 설계 (Architecture & Product)
- 📄 **[PRD.md](./PRD.md)**: 프로젝트 개요, 기본 기술 스택, 최상위 아키텍처 (Layer 원리 및 폴더 구조) 요약 (마스터 시작점)
- 📄 **[BUSINESS_LOGIC.md](./.agent/BUSINESS_LOGIC.md)**: 블록 동기화 워커, Reorg 검증 및 복구 워커, WebSocket 큐, 지연 보상 최적화 등 핵심 인덱싱 메커니즘 딥다이브 (+ 🚀 Ponder 확장 기능 명세 포함)

### ⚙️ 코어 규칙 및 정책 (Core Policy)
- 📄 **[SYSTEM_POLICY.md](./.agent/SYSTEM_POLICY.md)**: 시스템 공통 원칙 (ResultResDto 응답 변환, 글로벌 예외 필터, Winston 로깅 및 `.env` 환경변수 스펙)
- 📄 **[CODING_CONVENTION.md](./.agent/CODING_CONVENTION.md)**: 네이밍 컨벤션, 코드 포맷팅 원칙, 블록체인 노드 RPC 에러 대비 재시도(Retry) 매커니즘 등 세부 코딩 스타일

### 💾 외부 연동 규격 (Interface Specs)
- 📄 **[DB_SCHEMA.md](./.agent/DB_SCHEMA.md)**: PostgreSQL 데이터베이스 설계 규칙, 테이블 컬럼 스키마 및 `BaseEntity` 패턴 활용법
- 📄 **[API_SPEC.md](./.agent/API_SPEC.md)**: 컨트롤러 단의 REST HTTP 요청/응답 규격 (DTO Validation, Swagger 속성 명세)
