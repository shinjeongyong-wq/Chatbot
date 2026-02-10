# 🏥 병원 개원 상담 AI 챗봇 — Product Requirements Document (PRD)

## 1. 제품 개요

### 1.1. 제품명
**개원 상담 챗봇** (Hospital Opening Consultation Chatbot)

### 1.2. 미션
병원 개원을 준비하는 의료인(원장님)에게 **인테리어, 의료기기, 세무, 마케팅, 파트너사 추천** 등 개원 전 과정에 대해 AI 기반 전문 컨설팅을 제공합니다.

### 1.3. 핵심 가치
- **전문성**: 실제 컨설턴트가 답변하는 것처럼 자연스럽고 신뢰감 있는 응답
- **학습 기반**: 898개+ 검증된 Q&A + Notion 문서 기반 RAG
- **실시간 스트리밍**: ChatGPT 수준의 타이핑 효과로 자연스러운 대화 경험
- **진료과 맞춤**: 피부과/치과/내과/통증의학과 등 전공별 맞춤 답변

---

## 2. 시스템 아키텍처

### 2.1. 전체 파이프라인 (Selective Pipeline Architecture)
```
사용자 질문
    ↓
[Stage 1] Intent Classification (Planner)
    ├── GREETING → 인사말 템플릿 (로컬 타이핑 효과)
    ├── OFF_TOPIC → 범위 외 안내
    ├── OUT_OF_SCOPE → 비의료 거절
    ├── AMBIGUOUS → 명확화 요청
    └── PROCESS_GUIDE / RAG 필요 → Stage 2로 진행
            ↓
[Stage 2] Context Retrieval (Smart Search Engine)
    ├── T+C+K Gating (Topic + Category + Keyword 필터링)
    ├── Smart Score 계산 (가중 키워드 매칭)
    ├── Specialty-Aware Ranking (진료과별 가중/감점)
    └── Dynamic Cutoff (노이즈 제거)
            ↓
[Stage 3] Response Synthesis (SSE Streaming)
    ├── OpenRouter API (Gemini-2.0-Flash → 1.5-Flash 폴백)
    ├── Server-Sent Events로 실시간 전송
    └── 클라이언트 타이핑 버퍼 (20ms/글자)
            ↓
[Stage 4] Display & Finalization
    ├── Citation 제거 (Regex)
    ├── Markdown 렌더링
    ├── 관련 주제 추천 버튼 삽입
    ├── 피드백 버튼 (Good/Bad/Copy)
    └── 대화 히스토리 저장
```

### 2.2. 기술 스택

| 레이어 | 기술 |
|--------|------|
| **Frontend** | Vanilla HTML/CSS/JS (단일 `index.html` + `script.js`) |
| **Backend (API)** | Vercel Serverless Functions (Node.js) |
| **LLM** | OpenRouter → Gemini-2.0-Flash (fallback: 1.5-Flash) |
| **데이터 저장** | 로컬 JSON 파일 (`data/` 폴더), Supabase (세션/피드백) |
| **배포** | Vercel (main 브랜치 자동 배포) |
| **코드 보호** | javascript-obfuscator (클라이언트 난독화) |

### 2.3. API 엔드포인트

| 엔드포인트 | 역할 |
|-----------|------|
| `api/search.js` | Smart Search Engine (키워드 검색 + 점수 매칭) |
| `api/chat-stream.js` | SSE 스트리밍 응답 생성 |
| `api/chat.js` | 비스트리밍 응답 (폴백용) |
| `api/auth.js` | 인증 |
| `api/sessions.js` | 대화 세션 관리 |
| `api/messages.js` | 메시지 저장/조회 |
| `api/collect.js` | 피드백 수집 |
| `api/slack-notify.js` | Slack 알림 전송 |
| `api/summarize.js` | 대화 요약 |
| `api/sheets-proxy.js` | Google Sheets 프록시 |

---

## 3. 데이터 구조

### 3.1. 지식 베이스 (Knowledge Base)

| 소스 | 파일 | 항목 수 | 설명 |
|------|------|---------|------|
| **Q&A** | `data/qa/qna.json` | 898개 | 수동 검증된 전문가 Q&A (핵심 데이터) |
| **Notion** | `data/notion/*.json` | ~200개 파일 | 구조화된 개원 가이드 (Wave 1/2/3) |
| **Topics** | `data/topics_new.json` | 다수 | 개원 단계별 주제 분류 |

### 3.2. Q&A 스키마
```json
{
  "id": "qa-001",
  "source": "qa",
  "specialty": "공통|미용|치과|내과|통증",
  "question": "병원 인테리어 평당가는 어떻게 되나요?",
  "answer": "일반적으로 평당 250~400만원 사이이며...",
  "category": "인테리어"
}
```

### 3.3. 데이터 소스
- **Notion 문서**: 개원 단계별 가이드 (1차/2차/3차 웨이브)
- **카카오톡 채팅**: 실제 컨설팅 대화에서 추출한 전문 Q&A
- **수동 작성**: 도메인 전문가가 직접 작성한 FAQ

---

## 4. 핵심 기능

### 4.1. Smart Search Engine (`api/search.js`)
- **T+C+K Gating**: Topic/Category/Keyword 기반 1차 필터링
- **동의어 확장**: 한국어 변형 처리 (`비용` → `가격/요금/금액`)
- **조사 제거**: 한국어 조사(은/는/이/가/을/를) 자동 스트리핑
- **진료과 가중치**: 사용자 진료과와 문서 진료과 매칭 시 +0.2 보너스
- **5분 인메모리 캐시**: 반복 디스크 I/O 방지

### 4.2. Streaming Response
- **SSE (Server-Sent Events)**: `api/chat-stream.js`에서 토큰 단위 전송
- **타이핑 버퍼**: 네트워크 지터와 시각적 속도 분리 (20ms/글자)
- **Safe Markdown 렌더링**: 스트리밍 중 실시간 마크다운 변환
- **Citation 자동 제거**: `[1]`, `[ID: n]` 등 인용 표시 원천 차단

### 4.3. 대화 메모리
- **Short-Term**: `window.chatMemory`에 최근 5턴 유지
- **Context Rehydration**: 이전 AI 요약을 현재 프롬프트에 첨부
- **중복 답변 방지**: 이미 언급한 업체/정보를 추적하여 새로운 정보만 제공

### 4.4. UX Stage Indicators
- **Stage 1**: "질문을 분석하고 있어요..." (Intent Classification)
- **Stage 2**: "898개 문서에서 검색 중..." (Smart Search)
- **Stage 3**: "답변을 작성하고 있어요..." (Response Generation)
- 2초 간격 롤링 메시지로 체감 대기 시간 최소화

### 4.5. 대화 히스토리
- Supabase에 세션/메시지 저장
- 사이드바에서 이전 대화 목록 조회
- 토픽 자동 생성 (`[TOPIC: 주제]` 태그 파싱)

### 4.6. 피드백 시스템
- Good/Bad 버튼으로 사용자 평가 수집
- Slack 자동 알림 (`api/slack-notify.js`)
- 피드백 기반 자동 분석 & 개선 파이프라인 (10개 누적 시 트리거)

---

## 5. 프론트엔드 아키텍처

### 5.1. 구조
- **단일 파일**: `index.html` (CSS 인라인 포함, 약 2800줄)
- **스크립트**: `script.js` (3100+줄, 핵심 로직) + `chat-history.js`
- **난독화**: `dist/` 폴더에 빌드된 난독화 버전

### 5.2. 반응형 디자인
- **PC**: 사이드바(280px) + 채팅 영역 + FAQ 패널
- **모바일 (≤768px)**: 
  - 사이드바 → 햄버거 메뉴 (오버레이)
  - Aggressive Isolation (JS-driven DOM 제어)
  - iOS Safe Area 대응
  - v6.2.6: 가로 스크롤 제거, 말풍선 가장자리 밀착, iOS 줌 방지

### 5.3. 모바일 UI 전략 (Aggressive Isolation)
```
HTML (기본 숨김) → JS 감지 (768px 이하) → DOM 직접 조작
    ├── 아바타 제거 (.remove())
    ├── 사이드바 body로 이동 (fixed position)
    ├── 햄버거 메뉴 바인딩
    └── CSS !important 오버라이드
```

---

## 6. 인프라 & 배포

### 6.1. 배포 파이프라인
```
로컬 개발 → git push (feature branch) → Vercel Preview 배포
                                          ↓ (merge to main)
                                   Vercel Production 배포
```

### 6.2. 환경 변수
- `OPENROUTER_API_KEY`: LLM API 키
- `SUPABASE_URL` / `SUPABASE_KEY`: 데이터베이스
- `SLACK_WEBHOOK_URL`: 알림

---

## 7. 현재 한계점 & 개선 기회

### 7.1. 검색 품질
- 키워드 기반 검색의 한계: 의미적으로 관련 있지만 키워드가 다른 문서 누락 가능
- 벡터 검색 미적용 상태 (규모 확장 시 필요)

### 7.2. Intent Classification
- 단일 LLM 호출로 의도 분류 → 복잡한 멀티턴 대화에서 정확도 저하 가능
- "여러 주제가 섞인 질문" 처리 미흡

### 7.3. 응답 품질
- 단일 LLM (Gemini) 의존 → 할루시네이션 검증 메커니즘 없음
- 답변 후 자체 품질 평가(self-evaluation) 없음

### 7.4. 사용자 경험
- 긴 답변 시 스크롤 관리 최적화 필요
- 이미지/차트 등 리치 미디어 응답 미지원
- 다국어 지원 없음 (한국어 전용)

### 7.5. 데이터 관리
- JSON 파일 기반 → 실시간 업데이트 불가 (배포 사이클 필요)
- Q&A 추가 시 수동 작업 → 자동화 파이프라인 미흡

---

## 8. 성능 지표

| 지표 | 현재 수치 |
|------|-----------|
| 지식 베이스 총량 | 898개 Q&A + ~200개 Notion 문서 |
| 검색 정확성 (Wave) | 100% (벤치마크 검증) |
| 첫 토큰 도달 시간 | ~1-3초 (Stage 1+2 포함) |
| 스트리밍 속도 | 20ms/글자 (약 초당 50글자) |
| 인메모리 캐시 | 5분 (서버 재시작 시 초기화) |

---

## 9. 향후 방향성: 멀티 에이전트 도입 검토

현재 시스템은 **단일 파이프라인** (Intent → Search → Synthesize)으로 동작합니다.
버그 개선과 UX 향상을 위해 **멀티 에이전트 아키텍처** 도입을 검토 중입니다.

### 검토 중인 영역:
1. **검색 품질 향상 에이전트** (Search Quality Agent)
2. **응답 품질 검증 에이전트** (Response Validator)
3. **사용자 의도 분석 강화 에이전트** (Intent Refinement)
4. **자동 피드백 분석 에이전트** (Feedback Analyzer)
5. **데이터 자동 확장 에이전트** (Knowledge Expander)
