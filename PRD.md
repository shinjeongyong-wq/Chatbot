# 🏥 병원 개원 상담 AI 챗봇 — Product Requirements Document (PRD)
**Version**: v2.6.16 (2026-02-06)  
**Last Updated**: 2026-02-10

---

## 1. 제품 개요

### 1.1. 제품명
**개원 상담 챗봇** (Hospital Opening Consultation Chatbot)

### 1.2. 미션
병원 개원을 준비하는 의료인(원장님)에게 **인테리어, 의료기기, 세무, 마케팅, 파트너사 추천** 등 개원 전 과정에 대해 AI 기반 전문 컨설팅을 제공합니다.

### 1.3. 핵심 가치
- **전문성**: 실제 컨설턴트가 답변하는 것처럼 자연스럽고 신뢰감 있는 응답
- **학습 기반**: 검증된 Q&A + FAQ + Notion 문서 기반 RAG (총 198개 Notion 항목 포함)
- **실시간 스트리밍**: ChatGPT 수준의 타이핑 효과로 자연스러운 대화 경험
- **진료과 맞춤**: 피부과(미용)/치과/내과/통증의학과 4개 전공별 맞춤 답변

---

## 2. 시스템 아키텍처 (멀티 에이전트 — 이미 구현됨)

> ⚠️ **중요**: 이 시스템은 이미 **4개의 독립된 AI 에이전트**로 분리된 멀티 에이전트 아키텍처입니다. 각 에이전트는 **별도의 LLM 호출 또는 별도의 서버 로직**을 수행하며, 단일 프롬프트 내 역할극이 아닙니다.

### 2.1. 에이전트 구조 (구현 완료)

```
사용자 질문
    ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Agent 1] Planner Agent (api/chat.js, mode: 'plan')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - LLM: Google Gemini API 직접 호출
  - 모델: gemini-2.5-flash → gemini-3-flash-preview (순차 폴백)
  - 역할: 사용자 질문의 의도 분류 (MECE 6분류) + 검색 키워드 추출 + 검색 전략 수립
  - 입력: userQuery + userSpecialty(진료과) + recentContext(최근 대화 맥락) + alreadyMentioned(중복 방지 목록)
  - 출력: JSON { intent, requiresSearch, subIntent, topic, coreKeywords, expandedKeywords, excludeKeywords, targetCategory, targetSubCategory, searchStrategy, directAnswer }
  - MECE 6분류:
    ├── GREETING (인사/소개) → requiresSearch: false, directAnswer로 즉시 응답
    ├── ABUSE (부적절) → requiresSearch: false, 정중한 거절
    ├── OFF_TOPIC (무관한 잡담) → requiresSearch: false, 범위 안내
    ├── OUT_OF_SCOPE (전문가 영역) → requiresSearch: true, 검색 후 없으면 플래너 연결
    ├── AMBIGUOUS (모호한 질문) → requiresSearch: false, 역질문(Clarification)
    └── SPECIFIC (명확한 전문 상담) → requiresSearch: true, 전체 파이프라인 가동
  - 재시도: exponential backoff (500ms × attempt), 최대 2회
  - finishReason이 STOP이 아닌 경우에도 자동 재시도
  - 실패 시: 기본 플랜 반환 (intent: SPECIFIC, searchStrategy: broad)
            ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Agent 2] Smart Search Engine (api/search.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - LLM 아님 — 서버사이드 Node.js 알고리즘 (Vercel Serverless)
  - 역할: Planner의 JSON queryPlan을 기반으로 실제 지식 베이스에서 문서 검색
  - 데이터 로드: fs.readFileSync()로 `data/` 폴더 전체를 재귀적으로 로드
  - 5분 인메모리 캐시 (CACHE_DURATION = 300,000ms)
  - 검색 파이프라인:
    1. T+C+K 사전 필터링 (Topic OR Category OR Keyword 중 하나라도 매칭)
    2. 제외 키워드 필터링 (excludeKeywords)
    3. Smart Score 계산:
       - 핵심 키워드 매칭 (최대 +0.6, 제목 매칭 시 추가 +0.5)
       - 확장 키워드 매칭 (최대 +0.25)
       - 토픽 매칭 (+0.1, 배열 지원)
       - 토픽 보너스 (+0.5, 문서 메타데이터 매칭 시)
       - 파트너사 의도 가중치 (+0.2, subIntent가 '파트너사목록'일 때)
    4. 진료과 보너스: specialties 필드 매칭 (+0.2), 키워드 매칭 (최대 +0.15)
    5. 진료과 민감 카테고리 페널티: partners/medical_device에서 진료과 불일치 시 ×0.6
    6. Dynamic Cutoff: 최고 점수의 25% 미만 결과 제거
  - 동의어 사전: 시간(밤/야간/심야), 비용(가격/요금/금액), 장소(의원/병원/클리닉) 등 13개 그룹
  - 한국어 조사 제거: 은/는/이/가/을/를/에/에서/으로/로/의/와/과/도/만
  - 출력: 관련도 순 정렬된 문서 배열 (기본 최대 30개, 파트너사 목록은 15개)
            ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Agent 3] Response Synthesizer (api/chat-stream.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - LLM: Google Gemini API 직접 호출 (streamGenerateContent?alt=sse)
  - 모델: gemini-2.5-flash → gemini-1.5-flash (순차 폴백)
  - 역할: 검색된 컨텍스트를 기반으로 전문 상담 답변 생성
  - 전송 방식: SSE (Server-Sent Events) 토큰 단위 스트리밍
  - SSE 이벤트: event:model (모델명), event:token (텍스트 청크), event:done (완료), event:error (오류)
  - 입력: systemPrompt(검색 결과 + 진료과 + 중복 배제 + 관련 주제 목록 포함) + userQuery
  - systemPrompt 구성:
    - 사용자 진료과 우선순위 규칙
    - 중복 금지 목록 (이미 언급된 업체/항목)
    - 토픽 생성 규칙 (첫 대화 시 [TOPIC: 주제] 태그)
    - 이전 대화 맥락 (chatMemory.getContextPrompt())
    - 검색된 참고문서 (최대 30개, answer 15,000자 제한)
    - 핵심 규칙 6개 (중복 금지, 정보 선별, 주제 일관성, 할루시네이션 금지, OFF_TOPIC, NO_DATA)
    - 가독성 규칙 (빈 줄, 볼드체, 줄바꿈)
    - 관련 주제 추천 규칙 ([RELATED_TOPICS] 블록, 앵커 주제 목록에서만 선택)
  - generationConfig: temperature 0.2, maxOutputTokens 8192
  - 부분 응답 보존: 에러 발생 시에도 누적된 텍스트가 있으면 partial로 전달
  - 폴백: api/chat.js (일반 모드)로 비스트리밍 답변 생성 가능
            ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Agent 4] Context Manager (api/chat.js, mode: 'summary')
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - LLM: Google Gemini API 직접 호출
  - 모델: gemini-2.5-flash → gemini-3-flash-preview (순차 폴백)
  - 역할: 대화 5턴 초과 시 오래된 대화를 3~5문장 요약으로 압축
  - 입력: contextHistory (질문-답변 쌍 배열)
  - 출력: 요약 텍스트 (이후 Planner의 recentContext와 Synthesizer의 systemPrompt에 전달)
  - 트리거: ChatMemory.triggerSummaryLoop() — recentBuffer가 5턴 초과 시 자동 호출
  - 요약 규칙: 사용자 질문 주제 명시, 업체명/제품명/가격 등 핵심 디테일 유지
            ↓
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Stage 4] Display & Finalization (클라이언트 script.js)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  - Citation 제거: Regex로 [1], [ID: n], [참고 n] 등 인용 표시 원천 차단
  - Safe Markdown 렌더링: renderMarkdownSafe() — 스트리밍 중 실시간 변환
  - 타이핑 효과 버퍼:
    - 스트리밍: TYPING_SPEED=20ms, CHARS_PER_TICK=1 (초당 ~50글자)
    - 로컬 타이핑 (directAnswer): TYPING_SPEED=30ms, CHARS_PER_TICK=1 (초당 ~33글자)
  - [RELATED_TOPICS] 파싱 → 클릭 가능한 주제 버튼 생성
  - [NO_DATA] 태그 → 플래너 연결 버튼 표시
  - [OFF_TOPIC] 태그 → 범위 외 안내 메시지 표시
  - [TOPIC: 주제] 태그 → 세션 제목 자동 업데이트
  - 피드백 버튼 (Good/Bad/Copy) 삽입
  - chatMemory.addTurn() → 대화 메모리에 저장
  - Supabase에 메시지 저장
  - 답변 완료 시: 사용자 질문이 화면 최상단에 오도록 스크롤 (scrollToMessageTop)
```

### 2.2. 에이전트 간 데이터 흐름

```
┌──────────────────────────────────────────────────────────────┐
│                    클라이언트 (script.js)                      │
│                                                              │
│  사용자 질문                                                   │
│       ↓                                                      │
│  chatMemory.getContextPrompt()  →  요약 + 최근 5턴            │
│  extractMentionedKeywords()     →  이미 언급된 업체/항목       │
│  getUserSpecialty()             →  사용자 진료과 (SPECIALTIES) │
│       ↓                                                      │
│  ┌─── fetch('/api/chat', {mode:'plan'}) ───────────────┐     │
│  │  [Agent 1] Planner (Gemini 2.5 Flash)                │     │
│  │  → JSON: intent, keywords, searchStrategy            │     │
│  └──────────────────────────────────────────────────────┘     │
│       ↓                                                      │
│  requiresSearch === false → displayWithTypingEffect()        │
│  requiresSearch === true  ↓                                  │
│       ↓                                                      │
│  ┌─── fetch('/api/search', {queryPlan}) ──────────────┐      │
│  │  [Agent 2] Smart Search (Node.js 알고리즘)           │      │
│  │  → 관련도 순 문서 배열 (최대 30개)                    │      │
│  └──────────────────────────────────────────────────────┘     │
│       ↓                                                      │
│  + findForcedDocsByCompanyName() → 업체명 강제 포함           │
│  → 검색 결과를 systemPrompt에 [참고문서] 섹션으로 삽입        │
│       ↓                                                      │
│  ┌─── fetch('/api/chat-stream') ──────────────────────┐      │
│  │  [Agent 3] Response Synthesizer (SSE)                │      │
│  │  Gemini 2.5 Flash → 실시간 토큰 스트리밍              │      │
│  └──────────────────────────────────────────────────────┘     │
│       ↓                                                      │
│  Display & Finalization (Citation 제거, Markdown, 피드백)     │
│       ↓                                                      │
│  chatMemory.addTurn() → 5턴 초과 시:                         │
│  ┌─── fetch('/api/chat', {mode:'summary'}) ───────────┐      │
│  │  [Agent 4] Context Manager (Gemini 2.5 Flash)        │      │
│  │  오래된 대화 → 3~5문장 요약 → 다음 턴에 전달           │      │
│  └──────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 2.3. 기술 스택

| 레이어 | 기술 | 상세 |
|--------|------|------|
| **Frontend** | Vanilla HTML/CSS/JS | `index.html` (~99KB) + `script.js` (3,298줄) + `chat-history.js` (954줄) + `sheets-loader.js` (671줄) + `styles.css` (16KB) |
| **Backend** | Vercel Serverless Functions (Node.js) | `api/` 폴더에 12개 엔드포인트 |
| **LLM (Planner)** | Google Gemini API 직접 호출 | gemini-2.5-flash → gemini-3-flash-preview 폴백 |
| **LLM (Synthesizer)** | Google Gemini API 직접 호출 (SSE) | gemini-2.5-flash → gemini-1.5-flash 폴백 |
| **LLM (Context Manager)** | Google Gemini API 직접 호출 | gemini-2.5-flash → gemini-3-flash-preview 폴백 |
| **LLM (Summarize)** | Google Gemini API 직접 호출 | gemini-2.0-flash (**폴백 없음**, 하드코딩) |
| **검색 엔진** | 서버사이드 Node.js | api/search.js (키워드 매칭 + 동의어 + T+C+K 필터링) |
| **DB** | Supabase (PostgreSQL) | 사용자/세션/메시지 저장, 피드백 저장 |
| **데이터 저장** | 로컬 JSON 파일 (`data/` 폴더) | 898+ Q&A + 198 Notion 항목 |
| **데이터 수집** | Google Apps Script + Google Sheets | 사용자 질문 수집 |
| **알림** | Slack Webhook | 피드백 알림 + 플래너 연결 알림 |
| **배포** | Vercel (자동) | main 브랜치 push → Production 자동 배포 |
| **코드 보호** | javascript-obfuscator v5.2.1 | script.js, chat-history.js, sheets-loader.js → dist/ |

### 2.4. API 엔드포인트 전체 목록

| 엔드포인트 | 메서드 | 역할 | 에이전트 | 사용 환경변수 |
|-----------|--------|------|---------|-------------|
| `api/chat.js` (mode: plan) | POST | Query Planner — 의도 분류 + 키워드 추출 | **Agent 1** | `GEMINI_API_KEY` |
| `api/chat.js` (mode: summary) | POST | Context Manager — 대화 요약 | **Agent 4** | `GEMINI_API_KEY` |
| `api/chat.js` (일반) | POST | 비스트리밍 답변 생성 (폴백용) | Agent 3 대체 | `GEMINI_API_KEY` |
| `api/chat-stream.js` | POST | SSE 스트리밍 답변 생성 | **Agent 3** | `GEMINI_API_KEY` |
| `api/search.js` | POST | Smart Search Engine — 문서 검색 | **Agent 2** | 없음 (fs 직접 로드) |
| `api/auth.js` | POST | 사용자 로그인/등록 (이름+진료과) | - | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `api/sessions.js` | GET/POST/DELETE | 채팅 세션 CRUD | - | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `api/messages.js` | GET/POST | 메시지 저장/조회 (단일 + Bulk) | - | `SUPABASE_URL`, `SUPABASE_ANON_KEY` |
| `api/collect.js` | POST | 사용자 질문 수집 (Google Sheets) | - | `GOOGLE_APPS_SCRIPT_URL` |
| `api/slack.js` | POST | 플래너 연결 요청 알림 (Slack) | - | `SLACK_WEBHOOK_URL` |
| `api/slack-notify.js` | POST | 피드백 자동화 알림 (Slack) | - | `SLACK_WEBHOOK_URL` |
| `api/sheets-proxy.js` | GET | Google Sheets API 프록시 | - | `GOOGLE_API_KEY` or `GEMINI_API_KEY`, `SPREADSHEET_ID` |
| `api/summarize.js` | POST | 문서 요약 생성 (gemini-2.0-flash) | - | `GEMINI_API_KEY` |

### 2.5. Vercel 함수 설정 (vercel.json)
```json
{
    "outputDirectory": ".",
    "functions": {
        "api/chat.js": { "memory": 1024, "maxDuration": 30 }
    }
}
```
> ⚠️ chat.js만 메모리/타임아웃 커스텀 설정. 나머지 함수는 Vercel 기본값 사용.

---

## 3. 데이터 구조

### 3.1. 지식 베이스 (Knowledge Base)

| 소스 | 파일 | 검증된 항목 수 | 설명 |
|------|------|----------|------|
| **Q&A** | `data/qa/qna.json` (~12MB) | 다수 (핵심 데이터) | 수동 검증된 전문가 Q&A, Google Sheets에서 동기화 |
| **FAQ** | `data/qa/faq.json` (~1.2MB) | 다수 | 생성형 FAQ (토픽 경로 기반 분류) |
| **Notion** | `data/notion/**/*.json` | 198개 (index.json v5.2 기준) | 구조화된 개원 가이드 |
| **Topics** | `data/topics_shortened.json` | 835개 | 관련 주제 추천용 앵커 토픽 |

### 3.2. Q&A 스키마 (Google Sheets 원본 → JSON 변환)
```json
{
  "id": "qa-0",
  "source": "qa",
  "question": "병원 인테리어 평당가는 어떻게 되나요?",
  "answer": "일반적으로 평당 250~400만원 사이이며...",
  "metadata": {
    "field": "인테리어",
    "category": "비용"
  }
}
```
> Google Sheets 원본 열 매핑: QUESTION=2, ANSWER=3, FIELD=7, CATEGORY=8

### 3.3. Notion 데이터 구조
```
data/notion/
├── index.json (v5.2, 총 198개 항목, 32개 카테고리)
├── hospital-opening-roadmap.json (1개)
├── partners/ (8개 파일)
│   ├── pre-construction/ → interior(12), signage(14), homepage(4), bank(3), pc-network(3)
│   └── post-construction/ → furniture(6), emr-crm(4), marketing(1)
├── hospital-basics/ (14개 파일)
│   ├── pre-construction/ → interior, signage, marketing, medical-device, tax-loan, demolition
│   ├── during-construction/ → furniture(1), infrastructure(4), textiles(3), waste(1)
│   └── post-opening/ → admin(1), emr-crm(1), management(1), pharmacy(2)
├── advanced/ (6개 파일)
│   ├── interior(1), signage(1)
│   └── medical-device-beauty(1), medical-device-dental(1), medical-device-internal(1), medical-device-pain(1)
├── checklist/ (3개 파일)
│   └── facilities(13), general(24), regulations(1)
└── portfolio/ (1개 파일)
    └── customers(86)
```

### 3.4. 데이터 로딩 전략
```
[클라이언트] sheets-loader.js:
  1순위: LocalStorage('CRYSTAL_HORIZON_DB_V1') 사본
  2순위: 로컬 파일(qaData.js) — 100개 이상일 때만
  3순위: api/sheets-proxy.js → Google Sheets API 최초 1회 다운로드
  + 항상: data/notion/ 폴더에서 fetch()로 최신 Notion 데이터 병합

[서버] api/search.js:
  fs.readFileSync()로 data/ 폴더 전체 재귀 로드
  5분 인메모리 캐시 (서버 콜드스타트 시 재로드)
```

---

## 4. Planner Agent 상세 (Agent 1)

### 4.1. MECE 6분류 체계

| Intent | 설명 | 검색 필요 | 처리 방식 |
|--------|------|-----------|----------|
| **GREETING** | 인사, 감사, 챗봇 소개 | ❌ | directAnswer → displayWithTypingEffect() |
| **ABUSE** | 욕설, 부적절 표현 | ❌ | directAnswer → 정중한 거절 |
| **OFF_TOPIC** | 개원과 무관한 잡담 | ❌ | directAnswer → 범위 안내 |
| **OUT_OF_SCOPE** | 개원 관련이나 데이터 밖 | ✅ | 검색 진행, 없으면 [NO_DATA] + 플래너 연결 |
| **AMBIGUOUS** | 모호한 1~2단어 입력 | ❌ | directAnswer → 역질문 + [RELATED_TOPICS] |
| **SPECIFIC** | 구체적인 전문 상담 질문 | ✅ | 전체 파이프라인 (Search → Synthesize) |

### 4.2. Planner 출력 스키마
```json
{
  "intent": "SPECIFIC",
  "requiresSearch": true,
  "subIntent": ["파트너사목록", "비용"],
  "topic": ["인테리어", "의료기기"],
  "targetCategory": ["qa", "partners", "advanced"],
  "targetSubCategory": ["pre-construction/interior", "advanced/medical-device-beauty"],
  "specialtyRelevant": true,
  "coreKeywords": ["인테리어", "평당가", "비용"],
  "expandedKeywords": ["견적", "시공비", "예산"],
  "excludeKeywords": ["○○업체"],
  "searchStrategy": "semantic|broad|exact"
}
```

### 4.3. 맥락 인식 (후속 질문 처리)
- `recentContext`: chatMemory.getContextPrompt() — 요약 + 최근 5턴
- `alreadyMentioned`: extractMentionedKeywords() — 이전 답변에서 추출한 업체명/장비명
- 후속 질문 규칙: "더/또/추가/다른" → 이전 intent/topic 유지, excludeKeywords에 기존 항목 추가

---

## 5. 핵심 기능 상세

### 5.1. Smart Search Engine (api/search.js, 418줄)
- **T+C+K Gating**: Planner가 생성한 Topic/Category/Keyword 기반 1차 필터링 — OR 로직
- **Smart Score 계산**: 코어(+0.6), 확장(+0.25), 토픽 기초(+0.1), 토픽 보너스(+0.5)
- **진료과 처리**:
  - specialties 필드 매칭 시 +0.2
  - 키워드 매칭 시 최대 +0.15
  - 민감 카테고리(partners, medical_device)에서 불일치 시 ×0.6 감점
- **동의어 확장**: 13개 그룹 (밤/야간/심야, 비용/가격/요금, 개원/오픈/창업 등)
- **조사 제거**: 한국어 조사(은/는/이/가/을/를/에/에서/으로/로/의/와/과/도/만) 자동 스트리핑
- **고유명사 강제 포함**: 클라이언트 측 findForcedDocsByCompanyName()으로 업체명 매칭 문서 강제 병합
- **Dynamic Cutoff**: 최고 점수의 25% 미만 결과 자동 제거
- **폴백**: 서버 오류 시 클라이언트 localFallbackSearch() — 기본 키워드 매칭

### 5.2. Streaming Response (SSE)
- **서버**: api/chat-stream.js에서 `streamGenerateContent?alt=sse` 엔드포인트 호출
- **SSE 이벤트**: `event:model`, `event:token`, `event:done`, `event:error`
- **클라이언트 타이핑 버퍼**: 네트워크 지터와 시각적 속도 분리
  - 스트리밍: 20ms/글자, 1글자/tick (초당 ~50글자)
  - 로컬 타이핑: 30ms/글자, 1글자/tick (초당 ~33글자)
- **Safe Markdown 렌더링**: renderMarkdownSafe() — 부분 텍스트에서도 안전한 HTML 변환
- **Citation 자동 제거**: 프롬프트 지시 + Regex 이중 보호
- **부분 응답 보존**: 에러 발생 시에도 누적된 텍스트 보존 (partial: true)
- **중지 기능**: AbortController 기반 — 사용자가 전송 버튼(■ 아이콘)을 클릭하면 API 호출 즉시 취소

### 5.3. 대화 메모리 (ChatMemory 클래스, script.js)
- **세션별 분리**: setSession(sessionId)으로 세션 전환 시 메모리 독립
- **Short-Term**: recentBuffer에 최근 5턴 유지 (question + answer 쌍)
- **Long-Term**: Agent 4(Context Manager)가 생성한 요약을 contextSummary에 저장
- **getContextPrompt()**: "[이전 대화 요약]\n{summary}\n\n[최근 대화]\n{recent}" 포맷
- **중복 방지**: extractMentionedKeywords()로 이전 답변에서 업체명/장비명/제품명 추출
- **Used Topics 추적**: addUsedTopic()으로 이미 추천한 관련 주제 기록 → 중복 추천 방지
- **요약 루프**: triggerSummaryLoop() — 5턴 초과 시 api/chat(mode:summary) 비동기 호출

### 5.4. UX Stage Indicators
- **Stage 1**: 4개 롤링 문구 ("질문의 의도와 맥락을 분석하고 있습니다..." 등)
- **Stage 2**: 4개 롤링 문구 ("데이터베이스에서 최적의 정보를 찾고 있어요..." 등)
- **Stage 3**: 5개 롤링 문구 ("가장 정확한 정보로 답변을 구성하고 있습니다..." 등)
- 2초 간격 롤링 (startTypingMessageRolling/stopTypingMessageRolling)
- 실제 에이전트 호출과 동기화 (프롬프트 내 가짜 단계 아님)

### 5.5. 사용자 인증 (api/auth.js)
- POST `/api/auth` { name, specialty }
- 진료과: '통증', '미용', '내과', '치과' (4개 고정)
- 중복 체크: 이름+진료과 조합 unique → 기존 사용자면 로그인, 없으면 신규 등록
- localStorage에 사용자 정보 캐시

### 5.6. 대화 히스토리 (chat-history.js, 954줄)
- Supabase 클라이언트 직접 호출 (프론트엔드, SDK 사용)
- 세션 CRUD: 생성/삭제/제목 업데이트
- 메시지 저장: 단일 + Bulk insert 지원
- 사이드바에서 이전 대화 목록 조회
- [TOPIC: 주제] 태그 → 세션 제목 자동 업데이트
- 메시지 내용 검색 (Supabase ilike 쿼리)
- 확인 모달: 세션 삭제 시 커스텀 confirm 모달

### 5.7. 피드백 시스템
- Good/Bad 버튼으로 사용자 평가 수집 → Supabase feedback 테이블
- 10개 누적 시 Slack 자동 알림 (api/slack-notify.js)
- Slack 알림 내용: "10개의 피드백이 쌓였습니다! /feedback-auto를 입력하세요"
- 비밀 피드백 대시보드: PC에서 로고 5회 클릭 (2초 이내) → 이스터에그 대시보드 열림

### 5.8. 플래너 연결 시스템
- [NO_DATA] 답변 시 플래너 연결 버튼 표시
- 사용자 클릭 → 플래너 선택 모달 → api/slack.js로 Slack 알림
- 알림 내용: 질문, 날짜/시간, 담당 플래너명

### 5.9. 관련 주제 추천 (Related Topics)
- topics_shortened.json에서 835개 앵커 주제 로드
- findRelatedAnchorTopics(): 사용자 질문과 키워드 매칭하여 관련 주제 추출
- AI가 [RELATED_TOPICS]주제1|주제2|주제3[/RELATED_TOPICS] 형식으로 출력
- 본문 내 **볼드** 주제를 clickable-topic 링크로 변환
- chatMemory.usedTopics로 이미 추천한 주제 제외

### 5.10. 진료과별 키워드 (SPECIALTIES 상수, script.js)
```
통증: 통증, 정형외과, 재활, 물리치료, 도수치료, X-ray, 척추, 관절, C-arm, 저출력레이저 등
내과: 내과, 소화기, 내시경, 초음파, 투석, 심전도, EKG, CT, MRI, 종합검진 등
미용: 피부, 미용, 성형, 레이저, 보톡스, 필러, 리프팅, 울쎄라, 쁘띠성형 등
치과: 치과, 임플란트, 교정, 보철, X-ray, 파노라마, CAD/CAM, 구강스캐너 등
```

---

## 6. 프론트엔드 아키텍처

### 6.1. 파일 구조
| 파일 | 크기 | 줄 수 | 역할 |
|------|------|-------|------|
| `index.html` | 99KB | - | 메인 페이지 (인라인 CSS 포함) |
| `script.js` | 140KB | 3,298줄 | 핵심 로직 전체 (RAG, UI, 피드백, 검색, 메모리 등) |
| `chat-history.js` | 34KB | 954줄 | Supabase 연동, 인증, 세션/메시지 관리 |
| `sheets-loader.js` | 28KB | 671줄 | 데이터 로딩, Smart Search 클라이언트, 동의어 |
| `styles.css` | 16KB | - | 추가 CSS (stop-mode 애니메이션 등) |
| `console-guard.js` | 515B | - | 프로덕션 환경 콘솔 출력 비활성화 |
| `bot_avatar.png` | 531KB | - | 봇 아바타 이미지 |

### 6.2. 난독화 빌드
```
node build-obfuscate.js
  → script.js, chat-history.js, sheets-loader.js
  → dist/ 폴더에 난독화된 버전 생성
  → index-obfuscated.html에서 로드
```
- **난독화 수준**: 높음 (controlFlowFlattening, deadCodeInjection, stringArrayEncoding:base64)
- **renameGlobals**: false (다른 스크립트와의 호환성 유지)

### 6.3. 반응형 디자인
- **PC**: 사이드바(280px, 접기/펼치기 가능) + 채팅 영역 + FAQ 패널 (슬라이드)
- **모바일 (≤768px)**:
  - Aggressive Isolation: JS가 768px 이하 감지 → DOM 직접 조작
    - 아바타 .remove()
    - 사이드바 body로 이동 (fixed position)
    - 햄버거 메뉴 바인딩
    - CSS !important 오버라이드
  - iOS Safe Area 대응 (env(safe-area-inset-*))
  - iOS 자동줌 방지 (textarea font-size: 16px)
  - window.load에서 initMobileUI 재호출 (안전장치)

### 6.4. 내보내기 기능
- 클립보드에 복사 (exportToClipboard)
- TXT 파일 저장 (exportToTxt, BOM 포함 UTF-8)
- PDF 저장 (exportToPdf, CSS print 스타일 활용)

### 6.5. 테마
- 라이트 모드 고정 (toggleTheme 함수 존재하지만 비활성화)

---

## 7. Supabase 스키마

### 7.1. 테이블 구조
```sql
-- users (사용자)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT NOT NULL CHECK (specialty IN ('통증', '미용', '내과', '치과')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, specialty)
);

-- chat_sessions (채팅 세션)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT DEFAULT '새로운 채팅',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- messages (메시지)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2. 인덱스
- `idx_users_name_specialty` ON users(name, specialty)
- `idx_chat_sessions_user_id` ON chat_sessions(user_id)
- `idx_chat_sessions_created_at` ON chat_sessions(created_at DESC)
- `idx_messages_session_id` ON messages(session_id)
- `idx_messages_created_at` ON messages(created_at)

### 7.3. RLS (Row Level Security)
- 모든 테이블 RLS 활성화
- anon 사용자에게 모든 권한 부여 (개발용, 프로덕션 조정 필요)

---

## 8. 인프라 & 배포

### 8.1. 배포 파이프라인
```
로컬 개발 → git push (feature branch) → Vercel Preview 배포
                                          ↓ (merge to main)
                                   Vercel Production 배포 (자동)
```

### 8.2. 환경 변수 (Vercel 환경변수 + 로컬 .env)

| 변수명 | 용도 | 사용하는 파일 |
|--------|------|-------------|
| `GEMINI_API_KEY` | Google Gemini API 키 (전 에이전트 공통) | chat.js, chat-stream.js, summarize.js, sheets-proxy.js |
| `GOOGLE_API_KEY` | Google Sheets API 키 (GEMINI_API_KEY 폴백) | sheets-proxy.js |
| `SPREADSHEET_ID` | Google Sheets 스프레드시트 ID | sheets-proxy.js |
| `GOOGLE_APPS_SCRIPT_URL` | Google Apps Script 웹훅 URL | collect.js |
| `SLACK_WEBHOOK_URL` | Slack 웹훅 URL | slack.js, slack-notify.js |
| `SUPABASE_URL` | Supabase 프로젝트 URL | lib/supabase.js |
| `SUPABASE_ANON_KEY` | Supabase anon 키 | lib/supabase.js |

> ⚠️ chat-history.js에 Supabase URL/Key가 하드코딩되어 있음 (클라이언트 측, anon key이므로 보안 이슈 낮음)

### 8.3. 의존성 (package.json)
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.94.0",
    "dotenv": "^17.2.3",
    "googleapis": "^171.2.0"
  },
  "devDependencies": {
    "javascript-obfuscator": "^5.2.1"
  }
}
```

---

## 9. 성능 지표

| 지표 | 현재 수치 |
|------|-----------|
| 지식 베이스 총량 | Q&A + FAQ + 198개 Notion 문서 |
| 에이전트 수 | 4개 (Planner, Search, Synthesizer, Context Manager) |
| LLM 호출 수/질문 | 1~3회 (Planner 필수, Synthesizer 조건부, Context Manager 5턴마다) |
| 검색 정확성 (Wave) | 100% (벤치마크 검증) |
| 첫 토큰 도달 시간 | ~1-3초 (Planner + Search + Synthesizer 초기화) |
| 스트리밍 속도 | 20ms/글자 (약 초당 50글자) |
| 인메모리 캐시 | 5분 (서버 콜드스타트 시 재로드) |
| 대화 메모리 | 5턴 상세 + 이전 요약 (무제한 턴 지원) |
| RT 앵커 주제 수 | 835개 |
| Vercel 타임아웃 | chat.js: 30초, 나머지: 기본값(10초) |
| Vercel 메모리 | chat.js: 1024MB, 나머지: 기본값(128MB) |

---

## 10. 현재 한계점 & 개선 기회

> 아래는 기존 4-Agent 구조 위에 **추가로 도입할 수 있는** 개선 사항입니다.

### 10.1. 검색 품질
- **문제**: 키워드 기반 검색의 한계 — 의미적으로 관련 있지만 키워드가 다른 문서 누락 가능
- **현재 대응**: 동의어 사전(13개 그룹) + Planner의 expandedKeywords
- **개선 기회**: 검색 결과에 대한 LLM Re-ranking (별도 에이전트), 벡터 검색 재도입 (v2.4.0에서 시도 후 롤백됨)

### 10.2. 복합 질문 분해
- **문제**: "인테리어 비용이랑 의료기기 추천 알려줘" 같은 복합 질문에서 하나의 검색만 수행
- **현재 대응**: Planner가 coreKeywords, topic, targetCategory를 배열로 복수 반환
- **개선 기회**: Planner가 서브쿼리 배열을 반환 → Search를 N번 호출 → 결과 합치기

### 10.3. 할루시네이션 검증
- **문제**: Synthesizer가 검색 결과에 없는 내용을 지어낼 수 있음
- **현재 대응**: 프롬프트에 "참고문서 내용 기반으로만 답변 (할루시네이션 금지)" 규칙
- **개선 기회**: 별도 Fact Checker 에이전트 (비동기, 답변 표시 후 검증)

### 10.4. summarize.js 모델 불일치
- **문제**: summarize.js만 gemini-2.0-flash 하드코딩 (폴백 없음), 다른 에이전트는 2.5-flash 사용
- **개선 기회**: 모델 통일 또는 폴백 추가

### 10.5. 보안
- chat-history.js에 Supabase URL/Key 하드코딩 (anon key이므로 위험도 낮음)
- RLS 정책이 "모든 anon 허용" — 프로덕션에서는 사용자별 필터링 필요

### 10.6. 데이터 관리
- JSON 파일 기반 → 실시간 업데이트 불가 (배포 사이클 필요)
- Q&A 추가 시 수동 작업 → 자동화 파이프라인 미흡

### 10.7. 사용자 경험
- 긴 답변 시 스크롤 관리 최적화 필요
- 이미지/차트 등 리치 미디어 응답 미지원
- 다국어 지원 없음 (한국어 전용)
- 테마 라이트 모드 고정 (다크 모드 비활성화 상태)
