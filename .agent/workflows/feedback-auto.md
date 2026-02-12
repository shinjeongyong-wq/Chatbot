---
description: 피드백 10개 자동 분석 및 개선 프로세스 (v3)
---

# 피드백 자동화 워크플로우 (v3 - Supabase)

## 🔔 트리거
- 사용자가 `/feedback-auto` 입력 시 실행
- Slack 알림: "피드백 10개 도달!" 메시지 수신 후

## 📋 프로세스

### 1. 버전 관리 시작
```bash
// turbo
git checkout staging
// turbo
git pull origin staging
// turbo
git checkout -b feature/auto-feedback-batch-{YYYYMMDD-HHMM}
```

### 2. 피드백 데이터 수집 (Supabase)
```bash
// turbo
node fetch-feedback.js
```
- Supabase `feedback` 테이블에서 `processed = null` 인 피드백 조회
- **결과를 `_feedback_data.json` 파일로 저장**
- 각 피드백의 다음 정보 확인:
  - type (Good/Bad)
  - question (질문)
  - answer (답변)
  - content (상세내용)
  - context_prompt (맥락정보)
  - user_name, specialty
  - **search_log** (queryPlan, docs[rank/name/score/tier])

### 3. 피드백 분석

#### 3-1. Bad 피드백 원인 분류 (MECE 6분류)

**search_log가 있는 경우 → 자동 원인 추론:**
| 조건 | 분류 |
|---|---|
| intent 오분류 (SPECIFIC↔OUT_OF_SCOPE 오판) | A. 쿼리 플래너 |
| 검색 결과가 질문과 무관한 문서 위주 | B. 검색 엔진 |
| 검색 적절 + 답변 품질 불만 (길이/형식/내용) | C. 프롬프트/응답 규칙 |
| 검색 결과 0개 또는 score 극히 낮음 | D. 데이터 부족 |
| 버튼 미표시, 렌더링 깨짐, CSS 문제 | E. UI/렌더링 |
| 테스트성 입력, 사용자 오해, 수정 불필요 | F. 비해당 |

**분류별 수정 대상 파일:**
| 분류 | 파이프라인 단계 | 수정 대상 |
|---|---|---|
| A. 쿼리 플래너 | ① 의도 분류 | `api/chat.js` (plan 프롬프트) |
| B. 검색 엔진 | ② 문서 검색 | `api/search.js` (스코어링, 부스트, 커트라인) |
| C. 프롬프트/응답 규칙 | ③④ 프롬프트+LLM | `script.js` → `buildSystemPrompt` |
| D. 데이터 부족 | ⑥ 지식베이스 | `data/notion/*.json` (문서 추가/수정) |
| E. UI/렌더링 | ⑤ 화면 표시 | `index.html`, `script.js` (렌더링 함수) |
| F. 비해당 | - | 수정 불필요 (사유 기록만) |

#### 3-2. Good 피드백 활용
- Good 피드백 질문을 **회귀 테스트 풀**(`_regression_questions.json`)에 누적
- 중복 제거, 최대 50개 유지 (오래된 것 자동 제거)

#### 3-3. 개선 방안 도출
- 분류별 구체적 작업 계획 수립 후 보고 (승인 불필요, 보고만)

### 4. 코드 수정
1. 분석 결과에 따라 해당 파일 수정
2. 각 수정마다 커밋:
```bash
git add .
git commit -m "fix(feedback): {분류코드}-{피드백 내용 요약}"
# 예: fix(feedback): C-볼드체 남발 제한 규칙 추가
```

### 5. 테스트 (2단계, 20개 질문)

#### 5-1. 질문 풀 구성 (20개)
| 구분 | 수량 | 출처 |
|---|---|---|
| 피드백 질문 | 10개 | 해당 배치의 Bad+Good 질문 전체 (10개 미만이면 전체 사용) |
| AI 생성 질문 | 10개 | 아래 카테고리에서 골고루 생성 |

**AI 생성 질문 카테고리 (매 배치마다 새로 생성):**
- 파트너사 추천 2개 (인테리어, 간판/가구/마케팅 등 분야 다르게)
- 일반 정보 2개 (절차, 비용, 일정 중 택)
- 의료기기 1개
- 채용/노무 1개
- 마케팅 1개
- 플래너 연결/행동 요청 1개 ([NO_DATA] 검증용)
- OFF_TOPIC 1개
- 인사/GREETING 1개

#### 5-2. Phase A — 검색 파이프라인 테스트
```bash
// turbo
node _feedback_test.js --phase-a
```
- 쿼리 플래너 → 검색 API 호출
- 검증 항목:
  | 항목 | 기준 |
  |---|---|
  | API 응답 | 성공 (에러 없음) |
  | intent 분류 | 질문 유형에 맞는 intent |
  | 검색 결과 수 | ≥ 1개 (검색 필요 질문 기준) |
  | 파트너사 추천 시 T1 존재 | tier:1 문서 포함 |

#### 5-3. Phase B — AI 응답 품질 테스트
```bash
// turbo
node _feedback_test.js --phase-b
```
- **실제 streaming API 호출** → 최종 답변 텍스트 수신
- 자동 검증 항목 (MECE 4영역, 10개 항목):

**[형식 검증] — 프롬프트 규칙 준수 여부**
| # | 검증 항목 | 기준 | 판정 방법 |
|---|---|---|---|
| F1 | 볼드체 개수 | ≤ 10개 | `**텍스트**` 패턴 카운트 |
| F2 | 답변 길이 | ≤ 25줄 | 줄 수 카운트 (태그/버튼 제외) |
| F3 | 마침표 종결 | 본문 마침표(.)로 끝남 | 마지막 문장 검사 |
| F4 | 4단계+ 헤딩 금지 | ####, ##### 사용 0회 | 정규식 `^#{4,}` 검색 |
| F5 | [RELATED_TOPICS] 존재 | 일반 답변에 포함 | 태그 존재 여부 확인 |

**[정보 보안 검증] — 내부 정보 노출 차단**
| # | 검증 항목 | 기준 | 판정 방법 |
|---|---|---|---|
| S1 | tier 노출 금지 | 0회 | "Tier 1", "tier:", "[tier" 패턴 검색 |
| S2 | 참고문서 번호 노출 금지 | 0회 | "[1]", "[ID:", "참고문서", "출처:" 패턴 검색 |

**[기능 검증] — 비즈니스 로직 정합성**
| # | 검증 항목 | 기준 | 판정 방법 |
|---|---|---|---|
| L1 | [NO_DATA] 적절성 | 플래너 연결/행동 요청 시 포함 | 태그 존재 여부 |
| L2 | [OFF_TOPIC] 적절성 | 개원 무관 질문 시 포함 | 태그 존재 여부 |

**[시스템 검증] — 기본 동작**
| # | 검증 항목 | 기준 | 판정 방법 |
|---|---|---|---|
| SY1 | API 응답 성공 | HTTP 200 + 텍스트 존재 | 응답 상태 + 빈 문자열 체크 |

### 6. 결과 확인 및 반복

**"미해결" 판정 기준:**
- Phase A에서 FAIL 항목 존재
- Phase B에서 한 질문에 검증 항목 2개 이상 FAIL

```
반복 횟수 = 0
WHILE (FAIL 존재) AND (반복 횟수 < 3):
    1. FAIL 항목 원인 분석 (3-1 분류 기준)
    2. 추가 코드 수정 + 커밋
    3. 재테스트 (Phase A + B)
    4. 반복 횟수 += 1

IF 반복 3회 후에도 FAIL:
    → "해결 불가" 표시, 결과 보고에 포함
```

### 7. 피드백 처리 완료
- Supabase `feedback` 테이블: 해당 ID들 `processed = true`
- Good 피드백 → `_regression_questions.json` 누적

### 8. 결과 보고

```markdown
## 📊 피드백 자동화 배치 결과

### 피드백 원인 분류 (MECE 6분류)
| 분류 | 건수 | 주요 내용 |
|---|---|---|
| A. 쿼리 플래너 | N건 | intent 오분류 등 |
| B. 검색 엔진 | N건 | 무관 문서 검색 등 |
| C. 프롬프트/응답 규칙 | N건 | 볼드 남발, 길이 등 |
| D. 데이터 부족 | N건 | 정보 없음 |
| E. UI/렌더링 | N건 | 버튼, CSS 등 |
| F. 비해당 | N건 | 사유: ... |

### 수정된 파일
| 파일 | 분류 | 변경 내용 |
|---|---|---|
| script.js | C | ... |

### 테스트 결과
| 단계 | PASS | WARN | FAIL |
|---|---|---|---|
| Phase A (검색) | X | Y | Z |
| Phase B (AI 응답) | X | Y | Z |

### Phase B 검증 상세
| 항목 | PASS | FAIL |
|---|---|---|
| F1 볼드체 ≤10 | X | Y |
| F2 길이 ≤25줄 | X | Y |
| F3 마침표 종결 | X | Y |
| F4 ####+ 금지 | X | Y |
| F5 RELATED_TOPICS | X | Y |
| S1 tier 노출 | X | Y |
| S2 참고문서 노출 | X | Y |
| L1 NO_DATA | X | Y |
| L2 OFF_TOPIC | X | Y |
| SY1 API 성공 | X | Y |

### 피드백 반영 현황
| # | 타입 | 분류 | 피드백 요약 | 상태 |
|---|---|---|---|---|
| 1 | Bad | C | 볼드 남발 | ✅ |

### 반복 횟수
- 총 N회 반복
- 해결 불가 항목: N건

### Supabase 변경
- 스키마 변경: {있음/없음}
- DOWN 마이그레이션: {기록됨/해당없음}
```

### 9. 사용자 승인 및 배포
```
사용자 응답:
├─ "OK" / "승인" → staging merge & push & main push
├─ "수정 필요" → 함께 수정 후 merge & push
└─ "롤백" → feature 브랜치 삭제, staging 복귀
```

## ⚠️ 주의사항
- **Production 절대 건드리지 않음** (staging만 수정)
- 각 수정 후 반드시 Phase A + B 테스트
- 사용자 승인 없이 staging push 금지
- **Supabase 스키마 변경 시 DOWN 마이그레이션 SQL을
  `_migrations_rollback.sql`에 기록**
- Good 회귀 풀 최대 50개 유지
