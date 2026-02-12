---
description: 피드백 10개 자동 분석 및 개선 프로세스
---

# 피드백 자동화 워크플로우 (v2 - Supabase)

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
- 각 피드백의 다음 정보 확인:
  - type (Good/Bad)
  - question (질문)
  - answer (답변)
  - content (상세내용)
  - context_prompt (맥락정보)
  - user_name, specialty

### 3. 피드백 분석
1. Bad 피드백 우선 분석
2. 문제점 분류:
   - 답변 품질 문제 → api/chat.js 프롬프트 수정
   - 검색 로직 문제 → script.js 수정
   - 데이터 부족 → data/topics_new.json 수정
   - UI/UX 문제 → index.html, CSS 수정
3. 개선 방안 도출 및 작업 계획 수립

### 4. 코드 수정
1. 분석 결과에 따라 해당 파일 수정
2. 각 수정마다 커밋:
```bash
git add .
git commit -m "fix(feedback): {피드백 내용 요약}"
```

### 5. 테스트 (20개 질문)
1. 피드백에서 받은 질문 10개 테스트
2. 일반 개원 준비 질문 10개 테스트:
   - 개원 절차가 어떻게 되나요?
   - 인테리어 파트너사 추천해주세요
   - 의료기기 구매 방법은?
   - 개원 비용은 얼마나 드나요?
   - 세무사 추천 부탁드려요
   - 간호사 채용은 어떻게 하나요?
   - 개원 위치 선정 기준은?
   - 전자차트 추천해주세요
   - 개원 일정은 어떻게 잡나요?
   - 병원 마케팅은 어떻게 하나요?

### 6. 결과 확인 및 반복
```
반복 횟수 = 0
WHILE (미해결 피드백 존재) AND (반복 횟수 < 5):
    1. 미해결 피드백 분석
    2. 추가 개선 방안 도출
    3. 코드 수정
    4. 재테스트
    5. 반복 횟수 += 1
```

### 7. 피드백 처리 완료 표시
Supabase에서 처리된 피드백들의 `processed` 컬럼을 `true`로 업데이트

### 8. 결과 보고
사용자에게 다음 내용 보고:

```markdown
## 📊 피드백 자동화 배치 결과

### 수정된 파일
- {파일명}: {변경 내용}

### 테스트 결과
- 성공: X/20
- 실패: Y/20

### 피드백 반영 현황
| # | 피드백 요약 | 상태 |
|---|------------|------|
| 1 | ... | ✅/❌ |

### 반복 횟수
- 총 N회 반복
```

### 9. 사용자 승인 및 배포
```
사용자 응답:
├─ "OK" / "승인" → staging merge & push
├─ "수정 필요" → 함께 수정 후 merge & push
└─ "롤백" → feature 브랜치 삭제, staging 복귀
```

## ⚠️ 주의사항
- **Production은 절대 건드리지 않음** (staging만 수정)
- 각 수정 후 반드시 테스트 진행
- 사용자 승인 없이 staging push 금지
