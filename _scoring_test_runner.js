/**
 * 스코어링 로직 최적화 테스트 러너
 * - 16개 고정 질문으로 검색 품질 평가
 * - 동적 커트라인 통과 문서 전체 기록
 * - 실제 챗봇과 100% 동일한 환경 (search.js 스코어링만 변경)
 */

const BASE_URL = 'http://localhost:3003';
const fs = require('fs');

// 버전 번호는 CLI arg로 전달: node _scoring_test_runner.js 1
const VERSION = process.argv[2] || '1';

const USER_SPECIALTY = {
    code: '미용',
    value: '미용',
    label: '미용',
    emoji: '✨',
    keywords: [
        '피부', '미용', '성형', '레이저', '보톡스', '필러', '리프팅', '피부과', '성형외과',
        '주름', '탄력', '모공', '여드름', '색소', '미백', '홍조',
        '슈링크', '울쎄라', '써마지', '인모드', '튠페이스',
        'IPL', 'M22', '피코레이저', '피코', '프락셔널', 'CO2', 'CO2레이저',
        '고주파', 'RF', 'HIFU', '초음파리프팅',
        '얼굴', '눈가', '이마', '팔자', '턱선', '목주름',
        '안티에이징', '쁘띠', '비침습', '동안'
    ]
};

// ========== 고정 16개 질문 + Edge Case 5개 ==========
const FIXED_QUESTIONS = [
    '개원 절차가 어떻게 되나요?',
    '인테리어 업체 추천해주세요',
    '개원 비용이 대략 얼마나 드나요?',
    '강남 명동 홍대의 외국인 마케팅',
    '미용 의료기기는 뭐가 필요한가요?',
    '간판 업체 추천해주세요',
    '보톡스 필러 장비 어떤 걸 써야 하나요?',
    '세무사는 언제 정해야 되나요?',
    '레이저 장비 추천해주세요',
    '인테리어 비용이 얼마나 드나요?',
    'EMR 시스템 추천해주세요',
    '직원 채용은 어떻게 하나요?',
    '소방 검사는 어떻게 준비하나요?',
    '냉난방기 인수하는 게 유리한가요?',
    '홈페이지 제작 비용은 얼마인가요?',
    '간호사들 연봉은 어떻게 정하나요?',
    // ── Edge Case: 데이터 없는 질문 (NO_DATA가 정답) ──
    '의료 폐기물 처리 업체 추천해주세요',       // E01: 폐기물 처리 파트너 데이터 없음
    '병원 주차장 설계 기준이 어떻게 되나요?',    // E02: 주차장 관련 데이터 없음
    '의료사고 배상책임보험 가입은 어떻게 하나요?', // E03: 보험 관련 데이터 없음
    '개원 후 폐업 절차가 궁금합니다',            // E04: 폐업 관련 데이터 없음
    '원내 약국 개설 절차와 비용이 궁금합니다',    // E05: 원내 약국 관련 데이터 없음
];

// Edge case 인덱스 (0-based): 16,17,18,19,20 → Q17~Q21
const EDGE_CASE_START = 16;  // 0-based index where edge cases begin

// queryPlan의 배열 필드를 첫 번째 값으로 변환
function normalizeQueryPlan(plan) {
    const p = { ...plan };
    if (Array.isArray(p.subIntent)) p.subIntent = p.subIntent[0] || '';
    if (Array.isArray(p.targetCategory)) p.targetCategory = p.targetCategory[0] || '';
    if (Array.isArray(p.targetSubCategory)) p.targetSubCategory = p.targetSubCategory[0] || '';
    if (Array.isArray(p.topic)) p.topic = p.topic[0] || '';
    if (!p.keywords && p.coreKeywords) p.keywords = p.coreKeywords;
    return p;
}

// ========== 대화 히스토리 ==========
class ConversationHistory {
    constructor() { this.turns = []; }
    addUserMessage(msg) { this.turns.push({ role: 'user', text: msg }); }
    addBotMessage(msg) {
        const clean = msg
            .replace(/\[TOPIC:[^\]]+\]\n?/g, '')
            .replace(/\[NO_DATA\]/g, '')
            .replace(/\[OFF_TOPIC\]/g, '')
            .replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/g, '')
            .trim();
        this.turns.push({ role: 'bot', text: clean });
    }
    getContextPrompt() {
        if (this.turns.length === 0) return '(첫 대화)';
        const recent = this.turns.slice(-10);
        return recent.map(t => {
            const role = t.role === 'user' ? '사용자' : 'AI';
            const text = t.text.length > 300 ? t.text.substring(0, 300) + '...' : t.text;
            return `${role}: ${text}`;
        }).join('\n');
    }
    getAlreadyMentioned() {
        const keywords = new Set();
        const botTexts = this.turns.filter(t => t.role === 'bot').map(t => t.text).join(' ');
        const boldMatches = botTexts.match(/\*\*([^*]+)\*\*/g);
        if (boldMatches) {
            boldMatches.forEach(m => {
                const name = m.replace(/\*\*/g, '').trim();
                if (name.length >= 2 && name.length <= 20) keywords.add(name);
            });
        }
        return Array.from(keywords).slice(0, 15);
    }
}

// ========== API 함수 ==========
async function getQueryPlan(userQuery, recentContext = '', alreadyMentioned = []) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery, mode: 'plan',
            userSpecialty: USER_SPECIALTY,
            recentContext, alreadyMentioned
        })
    });
    if (!res.ok) throw new Error(`QueryPlan 실패: ${res.status}`);
    const data = await res.json();
    if (!data.success || !data.plan) throw new Error('QueryPlan 생성 실패');
    return data.plan;
}

async function smartSearch(queryPlan) {
    const normalized = normalizeQueryPlan(queryPlan);
    const isPartnerList = normalized.subIntent === '파트너사목록' || normalized.targetCategory === 'partners';
    const maxResults = isPartnerList ? 15 : 30;
    const res = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', queryPlan: normalized, maxResults, userSpecialty: USER_SPECIALTY })
    });
    if (!res.ok) throw new Error(`Search 실패: ${res.status}`);
    const data = await res.json();
    return { results: data.results || [], filterInfo: data.filterInfo || null };
}

function formatDoc(item, idx) {
    let prefix = `[${idx}]`;
    if (item.metadata?.tier) prefix += ` [tier:${item.metadata.tier}]`;
    if (item.specialty && item.specialty !== '공통' && item.specialty !== 'ALL') prefix += ` (특화: ${item.specialty})`;
    return `${prefix} Q: ${item.question}\nA: ${item.answer}`;
}

// ========== buildSystemPrompt — script.js 원본 동일 ==========
function buildSystemPrompt({ historyText, contextText, specialtyInfo, deduplicationRule, topicGenerationRule }) {
    return `당신은 병원 개원 전문 AI 컨설턴트입니다. 친절하고 전문적인 어조로 답변하되, **잘 구조화된 보고서 형식**으로 출력하세요.

${specialtyInfo ? '# 사용자 진료과\n' + specialtyInfo + '\n' : ''}
${deduplicationRule}
${topicGenerationRule}

# [Visual Formatting Protocol] (답변 포맷 규칙 - 최우선 적용) 🎨
**모든 답변은 다음 마크다운 표준을 엄격히 준수하며, 선언된 형식을 절대 벗어나지 마세요.**

1.  **Top-Down Summary**
    * 답변의 첫 줄은 반드시 질문에 대한 핵심 결론 또는 명확한 수치나 결과를 **한 문장**으로 작성합니다.
    * **[주의]**: "핵심 결론:", "핵심 답변:", "요약:" 등 어떠한 말머리 라벨도 붙이지 마세요. 그냥 문장으로 바로 시작하세요.

2.  **Standard Markdown Structure**
    * 주제 전환 시 반드시 \`### 소제목\` 을 사용합니다.
    * **####, #####등 4단계 이하 소제목은 절대 사용 금지.** 업체명이나 항목명은 **굵게(bold)** 로 표시합니다.
    * 여백 규칙: 소제목 직전에는 반드시 공백 라인을 1개만 삽입하여 시각적 가독성을 높입니다.
    * 가독성 규칙: 한 단락은 최대 **3줄**을 넘지 않으며, 초과 시 강제로 줄바꿈을 적용합니다.

3.  **Emphasis & Listing**
    * 핵심 키워드만 **굵게(bold)** 처리합니다. (문장 전체 볼드 금지)
    * 단계별 절차는 \`1.\`, 단순 나열은 \`-\` 기호를 사용하며, 리스트 간 들여쓰기는 2칸 공백을 유지합니다.

4.  **Termination Protocol (Strict)**
    * 답변 본문은 반드시 **마침표(.)** 하나로 끝맺음합니다.
    * 마침표 이후 특수문자, 공백, 부연설명을 추가하지 마세요. (\`...\`, \`.,\` 등 금지)

---

# 이전 대화
${historyText ? historyText : '(첫 대화)'}

# 참고문서
${contextText ? contextText : '(관련 데이터 없음)'}

# 🚫 인용/참고문서 표시 금지
참고문서의 번호, 출처, 인용 표시([1], [ID:1], "참고문서 n번", "출처:" 등)를 절대 포함하지 마세요.
→ 참고문서는 내부 근거일 뿐, 사용자에게 보여주지 않습니다.

# 핵심 규칙 (비즈니스 로직)

# ⚠️ 파트너사 추천 규칙 (필수)
참고문서에 [tier:1], [tier:2], [tier:3] 태그가 있으면 파트너사입니다.
- 파트너사 추천 시 **[tier:1] 태그가 붙은 모든 파트너사**를 빠짐없이 추천하세요. 하나만 골라서 추천하지 마세요.
- [tier:2], [tier:3] 문서는 첫 추천에 **절대 사용하지 마세요.**
- 사용자가 "더 없어?", "다른 업체도" 등 추가 요청 시에만 [tier:2] **모든 파트너사**를 추천하세요.
- 그래도 더 요구하면 [tier:3] 모든 파트너사를 추천하세요.
- ⛔ **tier 정보는 내부 분류 기준이므로 답변에 절대 노출 금지.** "Tier 1", "Tier 2", "[tier:1]", "1순위 파트너사", "추천 인테리어 파트너사 (Tier 1)" 등 등급/순위 표현을 사용하지 마세요. 자연스럽게 추천만 하세요.

1. **[질문 범위 준수]**: 사용자가 묻는 것에만 답변하세요. 참고문서에 관련 분야의 다른 내용이 있더라도, 질문에서 묻지 않은 내용은 포함하지 마세요.

2. **[중복 답변 금지]**: **# ⛔ 중복 금지** 섹션의 항목은 제외하고 **새로운 데이터 위주로** 답변하세요.

3. **[정보 선별]**:
   - 질문 의도가 '업체 추천'이 아닌 '방법/정보 요청'이면 **절차와 가이드 위주로** 답변하세요.
   - 업체 정보 제공 시, 특화 진료과가 사용자와 다르면: "해당 정보는 주로 **[참고문서의 진료과]**에 특화되어 있어, 원장님의 **[사용자 진료과]**에는 확인이 필요할 수 있습니다."

4. **[주제 일관성]**: 현재 대화의 주제를 중심으로 답변하세요. 새로운 정보가 없다면 정직하게 전달하세요.

5. 참고문서에 없는 내용을 지어내지 마세요 (할루시네이션 금지). 단, 참고문서에 있다고 모두 사용하지 말고, 질문의 핵심 대상과 직접 관련된 내용만 선별하세요.

6. 병원 개원과 무관한 질문 → "[OFF_TOPIC]죄송합니다. 해당 질문에 대해서는 답변을 드리기 어렵습니다."

7. **[NO_DATA] 태그 규칙**:
   아래 경우에 [NO_DATA] 태그를 사용하세요:
   - **(A)** 참고문서에 질문에 대한 직접적인 정보가 없는 경우
   - **(B)** 유사 정보로 대체 답변하는 경우
   - **(C)** 사용자가 파트너사 미팅, 의료기기 구매, 플래너 연결 등 **AI가 직접 수행할 수 없는 행동을 요청**하는 경우
   - ⚠️ 단, 참고문서에 질문과 **직접 관련된** 업체·제품·서비스 정보가 있으면 그 정보를 활용하여 답변하세요. 이 경우 [NO_DATA]를 사용하지 마세요.
   - [NO_DATA] 태그있으면 고정 안내 문구 다음에 플래너 연락 버튼을 표시합니다.
   - 일반 답변에서는 "플래너에게 연락" 문구를 사용하지 마세요.
   - **형식**: [NO_DATA] → 감사/사과 → 관련 내용 → 고정 안내 문구 → 플래너 연락 버튼
   - **고정 안내 문구**: "질문하신 내용에 대해 문의 사항 있으시면 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다."

# 토킹 포인트 (후속 질문 추천) — GREETING, OUT_OF_SCOPE일 때는 생략
답변 본문이 끝난 후, 참고문서 내용을 바탕으로 사용자가 자연스럽게 이어서 궁금해할 만한 주제를 1~2줄로 안내하세요.

**규칙:**
1. 반드시 참고문서 범위 내의 주제만 언급하세요. 답변할 수 없는 내용은 절대 추천 금지.
2. 현재 답변에서 이미 다룬 내용은 제외하세요.
3. 태그나 특수 형식 없이, 답변의 마지막 문단으로 자연스럽게 작성하세요.
4. "혹시 ~에 대해서도 궁금하신가요?" 같은 정형 문구는 피하고, 대화 흐름에 맞게 작성하세요.

**예시:**
... (답변 본문)

참고로 무아디자인의 포트폴리오나 다른 인테리어 업체 비교에 대해서도 안내해 드릴 수 있어요.`;
}

// ========== Chat Stream (SSE 소비) ==========
async function callChatStream(userQuery, systemPrompt) {
    const emphasizedQuery = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n# 🎯 현재 사용자 질문 (반드시 이 질문에만 답변하세요)\n\n"${userQuery}"\n\n⚠️ 위 질문에만 답변하세요. 이전 대화에서 다루지 못한 주제가 있더라도, 반드시 현재 질문의 주제에만 답변하세요.\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    const res = await fetch(`${BASE_URL}/api/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery: emphasizedQuery, systemPrompt })
    });
    if (!res.ok) throw new Error(`Chat Stream 실패: ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let rawSSE = '';
    let fullResponse = '';
    let model = '';
    let isDone = false;

    while (!isDone) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        rawSSE += chunk;
        const lines = chunk.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('event: model')) {
                const dataLine = lines[i + 1]?.trim();
                if (dataLine?.startsWith('data: ')) {
                    try { model = JSON.parse(dataLine.slice(6)).model || ''; } catch (e) { }
                }
            } else if (line.startsWith('event: token')) {
                const dataLine = lines[i + 1]?.trim();
                if (dataLine?.startsWith('data: ')) {
                    try {
                        const p = JSON.parse(dataLine.slice(6));
                        if (p.text) fullResponse += p.text;
                    } catch (e) { }
                }
            } else if (line.startsWith('event: done')) {
                isDone = true;
            }
        }
    }

    if (!fullResponse && rawSSE.length > 0) {
        const allLines = rawSSE.split('\n');
        for (let i = 0; i < allLines.length; i++) {
            if (allLines[i].trim().startsWith('event: token')) {
                const d = allLines[i + 1]?.trim();
                if (d?.startsWith('data: ')) {
                    try { const p = JSON.parse(d.slice(6)); if (p.text) fullResponse += p.text; } catch (e) { }
                }
            }
        }
    }

    return { text: fullResponse, model };
}

// ========== 1턴 실행 ==========
async function runOneTurn(userQuery, history) {
    const historyText = history.getContextPrompt();
    const alreadyMentioned = history.getAlreadyMentioned();
    const isFirstMessage = history.turns.length === 0;

    // Stage 1: Query Plan
    const queryPlan = await getQueryPlan(userQuery, historyText, alreadyMentioned);

    if (!queryPlan.requiresSearch && queryPlan.directAnswer) {
        history.addUserMessage(userQuery);
        history.addBotMessage(queryPlan.directAnswer);
        return {
            question: userQuery, answer: queryPlan.directAnswer,
            intent: queryPlan.intent, model: 'query-planner', searchResults: [],
            filterInfo: null, queryPlan, skipped: true, isNoData: false, isOffTopic: false
        };
    }

    // Stage 2: Search
    const { results: searchResults, filterInfo } = await smartSearch(queryPlan);
    const contextText = searchResults.slice(0, 30).map((item, idx) => formatDoc(item, idx)).join('\n\n---\n\n');

    // Stage 3: Build prompt + Chat
    const specialtyInfo = `사용자는 **${USER_SPECIALTY.label}** 개원을 준비 중입니다.

**[중요] 답변 생성 규칙:**
1. 검색 결과 중 **[${USER_SPECIALTY.label}✓]** 태그가 있는 문서를 **최우선**으로 참고하세요.
2. 태그가 없어도 본문에 ${USER_SPECIALTY.keywords.slice(0, 5).join(', ')} 등 ${USER_SPECIALTY.label} 관련 내용이 있으면 우선 포함하세요.
3. 다른 진료과 내용보다 **${USER_SPECIALTY.label} 관련 정보를 먼저** 설명하세요.
4. 파트너사/의료기기/비용 등의 질문에서도 **${USER_SPECIALTY.label}에 적합한 항목을 우선 추천**하세요.`;

    let deduplicationRule = '';
    if (alreadyMentioned.length > 0) {
        deduplicationRule = `\n# ⛔ 중복 금지 (이미 설명한 항목)\n${alreadyMentioned.slice(0, 15).join(', ')}\n\n→ 위 항목은 다시 설명하지 마세요. 새로운 정보만 답변하거나, 없으면 "추가 정보가 없습니다"라고 하세요.\n`;
    }

    const topicGenerationRule = isFirstMessage ? `\n# ⭐ 토픽 생성 (첫 대화일 때만)\n- 이 대화의 주제를 한글 10자 이내로 요약하여 답변의 **맨 첫 줄**에 다음 형식으로 작성하세요: \`[TOPIC: 주제]\`\n` : '';

    const systemPrompt = buildSystemPrompt({ historyText, contextText, specialtyInfo, deduplicationRule, topicGenerationRule });
    const result = await callChatStream(userQuery, systemPrompt);

    let cleanAnswer = result.text
        .replace(/\[TOPIC:[^\]]+\]\n?/g, '')
        .replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/g, '')
        .trim();

    history.addUserMessage(userQuery);
    history.addBotMessage(cleanAnswer);

    const isNoData = /\[NO_DATA\]/.test(result.text);
    const isOffTopic = /\[OFF_TOPIC\]/.test(result.text);

    return {
        question: userQuery,
        answer: cleanAnswer.replace(/\[NO_DATA\]/g, '').replace(/\[OFF_TOPIC\]/g, '').trim(),
        intent: queryPlan.intent, model: result.model,
        searchResults, filterInfo, queryPlan,
        skipped: false, isNoData, isOffTopic
    };
}

// ========== 메인 ==========
async function main() {
    const history = new ConversationHistory();
    let output = '';

    output += '='.repeat(100) + '\n';
    output += `  스코어링 테스트 v${VERSION} — ${new Date().toLocaleString('ko-KR')}\n`;
    output += `  진료과: ${USER_SPECIALTY.label} | 질문: ${FIXED_QUESTIONS.length}개 | 고정 질문\n`;
    output += `  환경: localhost:3003, search.js v${VERSION} 적용\n`;
    output += '='.repeat(100) + '\n\n';

    const summaryRows = [];

    for (let i = 0; i < FIXED_QUESTIONS.length; i++) {
        const question = FIXED_QUESTIONS[i];
        const turnNum = i + 1;

        output += '━'.repeat(100) + '\n';
        output += `Q${String(turnNum).padStart(2, '0')} / ${FIXED_QUESTIONS.length}\n`;
        output += '━'.repeat(100) + '\n\n';

        console.log(`\n${'━'.repeat(60)}`);
        console.log(`Q${turnNum}/${FIXED_QUESTIONS.length}: "${question}"`);

        try {
            const result = await runOneTurn(question, history);

            // ── 질문 & QueryPlan ──
            output += `  질문: ${result.question}\n`;
            output += `  Intent: ${result.intent} | 모델: ${result.model}\n`;
            if (result.queryPlan) {
                output += `  coreKeywords: ${JSON.stringify(result.queryPlan.coreKeywords || [])}\n`;
                output += `  expandedKeywords: ${JSON.stringify(result.queryPlan.expandedKeywords || [])}\n`;
                output += `  topic: ${JSON.stringify(result.queryPlan.topic || '')}\n`;
                output += `  targetCategory: ${result.queryPlan.targetCategory || ''}\n`;
                output += `  subIntent: ${result.queryPlan.subIntent || ''}\n`;
            }

            // ── 커트라인 정보 ──
            if (result.filterInfo) {
                output += `\n  [커트라인] top=${result.filterInfo.topScore}, cutoff=${result.filterInfo.cutoff}, mean=${result.filterInfo.mean}, σ=${result.filterInfo.stdDev}\n`;
                output += `  [통과] ${result.filterInfo.passedCount}개 / [제외] ${(result.filterInfo.scoredCount || 0) - (result.filterInfo.passedCount || 0)}개\n`;
            }

            // ── 동적 커트라인 통과한 문서 전체 ──
            if (result.searchResults && result.searchResults.length > 0) {
                output += `\n  ──── 통과 문서 (${result.searchResults.length}개) ────\n`;
                result.searchResults.forEach((doc, idx) => {
                    const score = doc.score?.toFixed(4) || '?';
                    const field = doc.metadata?.field || '';
                    const specialty = doc.specialty || '';
                    const tier = doc.metadata?.tier ? `[tier:${doc.metadata.tier}]` : '';
                    const qText = (doc.question || '').substring(0, 80);
                    output += `  [${idx + 1}] ${score} | ${field} | ${specialty} ${tier} | ${qText}\n`;
                });
                output += `  ──── 끝 ────\n`;
            }

            // ── 답변 전문 ──
            if (result.skipped) {
                output += `\n  ⏭️ DirectAnswer (검색 스킵)\n`;
            }
            if (result.isNoData) output += `  🚨 [NO_DATA]\n`;
            if (result.isOffTopic) output += `  🚨 [OFF_TOPIC]\n`;

            output += `\n  ──── 답변 (${(result.answer || '').length}자) ────\n`;
            output += (result.answer || '').split('\n').map(l => `  ${l}`).join('\n') + '\n';
            output += `  ──── 끝 ────\n\n`;

            // 요약 저장
            const answerSnippet = (result.answer || '').substring(0, 80);
            const status = result.isNoData ? 'NO_DATA' : result.isOffTopic ? 'OFF_TOPIC' : result.skipped ? 'SKIP' : 'OK';
            summaryRows.push({
                qNum: turnNum, question, status,
                docsCount: result.searchResults?.length || 0,
                topScore: result.filterInfo?.topScore || '?',
                answerSnippet,
                answerFull: result.answer || ''
            });

            console.log(`  ✅ 완료: 문서 ${result.searchResults?.length || 0}개, 답변 ${(result.answer || '').length}자`);

        } catch (err) {
            output += `  ❌ 에러: ${err.message}\n\n`;
            summaryRows.push({ qNum: turnNum, question, status: 'ERROR', docsCount: 0, topScore: '?', answerSnippet: err.message });
            console.error(`  ❌ ${err.message}`);
        }

        // 턴 간 대기
        await new Promise(r => setTimeout(r, 2000));
    }

    // ══════════════════════════════════════════════════════════════
    // 자동 채점 시스템 (100점 만점)
    // ══════════════════════════════════════════════════════════════

    // 정답지: 각 질문의 기대 결과
    const GROUND_TRUTH = {
        // 기본 질문 (Q01~Q16) — 기대: OK
        1: { expect: 'OK', type: 'info', keywords: ['절차', '단계', '로드맵', '개원'] },
        2: { expect: 'OK', type: 'partner', keywords: ['인투익스', '무아디자인', '메이드바이'], partnerField: 'interior' },
        3: { expect: 'OK', type: 'info', keywords: ['비용', '만원', '억', '천만'] },
        4: { expect: 'OK', type: 'info', keywords: ['외국인', '마케팅', '영문', '홈페이지'] },
        5: { expect: 'OK', type: 'info', keywords: ['의료기기', '레이저', '피코', '슈링크', '울쎄라', '써마지'] },
        6: { expect: 'OK', type: 'partner', keywords: ['LS디자인', '디자인캐프'], partnerField: 'signage' },
        7: { expect: 'OK', type: 'info', keywords: ['보톡스', '필러', '주사'] },
        8: { expect: 'OK', type: 'info', keywords: ['세무사', '세무', '임대차', '계약'] },
        9: { expect: 'OK', type: 'info', keywords: ['레이저', '피코', 'IPL', '장비'] },
        10: { expect: 'OK', type: 'info', keywords: ['인테리어', '비용', '평당', '만원', '억'] },
        11: { expect: 'OK', type: 'info', keywords: ['EMR', 'CRM', '전자차트', '시스템'] },
        12: { expect: 'OK', type: 'info', keywords: ['채용', '직원', '구인', '공고'] },
        13: { expect: 'OK', type: 'info', keywords: ['소방', '검사', '스프링클러', '소화기'] },
        14: { expect: 'OK', type: 'info', keywords: ['냉난방', '에어컨', '인수', '시스템'] },
        15: { expect: 'OK', type: 'info', keywords: ['홈페이지', '비용', '제작', '만원'] },
        16: { expect: 'OK', type: 'info', keywords: ['간호사', '연봉', '급여', '임금', '노무'] },
        // Edge Case (Q17~Q21) — 기대: NO_DATA
        17: { expect: 'NO_DATA', type: 'edge', keywords: [] },
        18: { expect: 'NO_DATA', type: 'edge', keywords: [] },
        19: { expect: 'NO_DATA', type: 'edge', keywords: [] },
        20: { expect: 'NO_DATA', type: 'edge', keywords: [] },
        21: { expect: 'NO_DATA', type: 'edge', keywords: [] },
    };

    // 질문별 채점 함수
    function gradeQuestion(row, truth) {
        const result = { grade: 'FAIL', points: 0, error: null, cause: null };

        if (truth.expect === 'NO_DATA') {
            // Edge Case: NO_DATA가 정답
            if (row.status === 'NO_DATA') {
                result.grade = 'PASS';
                result.points = 5;
            } else if (row.status === 'SKIP') {
                // DirectAnswer SKIP → 검색 로직 외 문제
                result.grade = 'PARTIAL';
                result.points = 3;
                result.cause = 'QueryPlanner가 DirectAnswer로 처리';
            } else {
                // OK인데 NO_DATA여야 함 → FALSE_POSITIVE
                result.grade = 'FAIL';
                result.points = 0;
                result.error = 'FALSE_POSITIVE';
                // 원인: 문서가 많이 통과했으면 검색 문제, 적으면 AI 문제
                result.cause = row.docsCount > 5 ? '검색: 무관한 문서 다량 통과' : 'AI: 소수 문서에서 억지 답변';
            }
        } else {
            // 기본 질문: OK가 정답
            if (row.status === 'OK') {
                // 답변에 핵심 키워드가 포함되어 있는지 확인
                const answer = (row.answerFull || row.answerSnippet || '').toLowerCase();
                const keywordHits = truth.keywords.filter(kw => answer.includes(kw.toLowerCase())).length;
                const hitRate = truth.keywords.length > 0 ? keywordHits / truth.keywords.length : 1;

                if (hitRate >= 0.3) {
                    result.grade = 'PASS';
                    result.points = 5;
                } else {
                    result.grade = 'PARTIAL';
                    result.points = 3;
                    result.cause = `답변 키워드 매칭률 낮음 (${keywordHits}/${truth.keywords.length})`;
                }

                // 파트너 질문: tier 1 파트너사가 언급되었는지 추가 확인
                if (truth.type === 'partner' && truth.keywords.length > 0) {
                    const partnerHits = truth.keywords.filter(kw => answer.includes(kw.toLowerCase())).length;
                    if (partnerHits === 0) {
                        result.grade = 'PARTIAL';
                        result.points = 3;
                        result.cause = 'tier 1 파트너사 미언급';
                    }
                }
            } else if (row.status === 'NO_DATA') {
                // FALSE_NEGATIVE: 데이터 있는데 NO_DATA
                result.grade = 'FAIL';
                result.points = 0;
                result.error = 'FALSE_NEGATIVE';
                result.cause = row.docsCount === 0 ? '검색: 관련 문서 0개 통과' : 'AI: 문서 있는데 NO_DATA 판정';
            } else if (row.status === 'SKIP') {
                result.grade = 'PARTIAL';
                result.points = 3;
                result.cause = 'DirectAnswer로 처리됨 (검색 미실행)';
            } else {
                result.grade = 'FAIL';
                result.points = 0;
                result.cause = `상태: ${row.status}`;
            }
        }

        return result;
    }

    // ── 채점 실행 ──
    const grades = [];
    summaryRows.forEach(row => {
        const truth = GROUND_TRUTH[row.qNum];
        if (!truth) return;
        const grade = gradeQuestion(row, truth);
        grades.push({ ...row, ...grade, truth });
    });

    // 점수 계산
    const totalPoints = grades.reduce((sum, g) => sum + g.points, 0);
    const maxPoints = grades.length * 5;
    const baseScore = Math.round((totalPoints / maxPoints) * 100);

    const falsePositives = grades.filter(g => g.error === 'FALSE_POSITIVE').length;
    const falseNegatives = grades.filter(g => g.error === 'FALSE_NEGATIVE').length;
    const penalty = (falsePositives * -5) + (falseNegatives * -2);
    const finalScore = Math.max(0, baseScore + penalty);

    const gradeLabel = finalScore >= 90 ? 'S' : finalScore >= 80 ? 'A' : finalScore >= 70 ? 'B' : finalScore >= 60 ? 'C' : 'F';

    // ── 요약 출력 ──
    output += '\n' + '='.repeat(100) + '\n';
    output += `  📊 스코어링 v${VERSION} 결과 요약 (${FIXED_QUESTIONS.length}개 질문)\n`;
    output += '='.repeat(100) + '\n\n';

    // 기본 16개 질문 요약
    output += `  ── 기본 질문 (Q01~Q16) ──\n`;
    grades.filter(g => g.qNum <= 16).forEach(g => {
        const icon = g.grade === 'PASS' ? '✅' : g.grade === 'PARTIAL' ? '⚠️' : '❌';
        output += `  Q${String(g.qNum).padStart(2, '0')} ${icon} [${g.grade}] ${g.points}점 | ${g.status} | 문서 ${g.docsCount}개 | top=${g.topScore}\n`;
        output += `    질문: ${g.question}\n`;
        output += `    답변: ${g.answerSnippet}...\n`;
        if (g.error) output += `    ⛔ 에러: ${g.error}\n`;
        if (g.cause) output += `    🔍 원인: ${g.cause}\n`;
        output += '\n';
    });

    // Edge Case 요약
    const edgeCases = grades.filter(g => g.qNum > 16);
    if (edgeCases.length > 0) {
        output += `  ── Edge Case (Q17~Q21: 기대=NO_DATA) ──\n`;
        edgeCases.forEach(g => {
            const icon = g.grade === 'PASS' ? '✅' : g.grade === 'PARTIAL' ? '⚠️' : '❌';
            output += `  Q${String(g.qNum).padStart(2, '0')} ${icon} [${g.grade}] ${g.points}점 | ${g.status} | 문서 ${g.docsCount}개 | top=${g.topScore}\n`;
            output += `    질문: ${g.question}\n`;
            output += `    답변: ${g.answerSnippet}...\n`;
            if (g.error) output += `    ⛔ 에러: ${g.error}\n`;
            if (g.cause) output += `    🔍 원인: ${g.cause}\n`;
            output += '\n';
        });
    }

    // 100점 점수
    output += '='.repeat(100) + '\n';
    output += `  🏆 최종 점수: ${finalScore}점 / 100점 (${gradeLabel}등급)\n`;
    output += '='.repeat(100) + '\n\n';
    output += `  기본점수: ${baseScore}점 (${totalPoints}/${maxPoints})\n`;
    output += `  PASS: ${grades.filter(g => g.grade === 'PASS').length}개\n`;
    output += `  PARTIAL: ${grades.filter(g => g.grade === 'PARTIAL').length}개\n`;
    output += `  FAIL: ${grades.filter(g => g.grade === 'FAIL').length}개\n`;
    output += `  에러 감점: ${penalty}점 (FALSE_POSITIVE ${falsePositives}건×-5 + FALSE_NEGATIVE ${falseNegatives}건×-2)\n\n`;

    // 실패 원인 분석 요약
    const failures = grades.filter(g => g.grade !== 'PASS');
    if (failures.length > 0) {
        output += `  ── 실패/부분 원인 분석 ──\n`;
        failures.forEach(g => {
            output += `  Q${String(g.qNum).padStart(2, '0')} [${g.grade}] ${g.error || ''} → ${g.cause || '미분류'}\n`;
        });
        output += '\n';

        // 검색 vs AI 문제 집계
        const searchIssues = failures.filter(g => g.cause && g.cause.startsWith('검색')).length;
        const aiIssues = failures.filter(g => g.cause && g.cause.startsWith('AI')).length;
        const otherIssues = failures.length - searchIssues - aiIssues;
        output += `  원인 분류: 검색 문제 ${searchIssues}건 | AI 문제 ${aiIssues}건 | 기타 ${otherIssues}건\n\n`;
    }

    const filename = `_scoring_test_v${VERSION}.txt`;
    fs.writeFileSync(filename, output, 'utf-8');
    console.log(`\n📄 결과 저장: ${filename} (${output.length}자)`);
    console.log(`\n🏆 최종 점수: ${finalScore}점 / 100점 (${gradeLabel}등급)`);
    console.log(`   PASS=${grades.filter(g => g.grade === 'PASS').length} | PARTIAL=${grades.filter(g => g.grade === 'PARTIAL').length} | FAIL=${grades.filter(g => g.grade === 'FAIL').length}`);
    console.log(`   감점: FP=${falsePositives}(-${falsePositives * 5}) FN=${falseNegatives}(-${falseNegatives * 2})`);
}

main().catch(err => { console.error('테스트 에러:', err); process.exit(1); });
