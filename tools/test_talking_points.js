/**
 * 챗봇 종합 품질 테스트 v4 — 반응형 대화 (5턴 검증)
 * 진료과: 미용
 * 이름: 오피앤
 */

const BASE_URL = 'http://localhost:3003';
const fs = require('fs');

const USER_SPECIALTY = {
    code: '미용',       // ★ search.js의 calculateSpecialtyBonus가 참조
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

// queryPlan의 배열 필드를 첫 번째 값으로 변환 (API 호환)
function normalizeQueryPlan(plan) {
    const p = { ...plan };
    if (Array.isArray(p.subIntent)) p.subIntent = p.subIntent[0] || '';
    if (Array.isArray(p.targetCategory)) p.targetCategory = p.targetCategory[0] || '';
    if (Array.isArray(p.targetSubCategory)) p.targetSubCategory = p.targetSubCategory[0] || '';
    if (Array.isArray(p.topic)) p.topic = p.topic[0] || '';
    // keywords = coreKeywords 매핑 (search.js 호환)
    if (!p.keywords && p.coreKeywords) p.keywords = p.coreKeywords;
    return p;
}

const TOPIC_POOL = [
    '개원 절차가 어떻게 되나요?',
    '인테리어 업체 추천해주세요',
    '개원 비용이 대략 얼마나 드나요?',
    '의료기기는 뭐가 필요한가요?',
    '간판 업체 추천해주세요',
];

// ========== 대화 히스토리 ==========
class ConversationHistory {
    constructor() {
        this.turns = [];
    }
    addUserMessage(msg) {
        this.turns.push({ role: 'user', text: msg });
    }
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

// ========== API ==========
async function getQueryPlan(userQuery, recentContext = '', alreadyMentioned = []) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery,
            mode: 'plan',
            userSpecialty: USER_SPECIALTY,
            recentContext,
            alreadyMentioned
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
    return data.results || [];
}

function formatDoc(item, idx) {
    let prefix = `[${idx}]`;
    if (item.metadata?.tier) prefix += ` [tier:${item.metadata.tier}]`;
    if (item.specialty && item.specialty !== '공통' && item.specialty !== 'ALL') prefix += ` (특화: ${item.specialty})`;
    return `${prefix} Q: ${item.question}\nA: ${item.answer}`;
}

// ========== buildSystemPrompt — script.js 원본 ==========
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
   - **(A)** 참고문서에 정확한 정보가 없는 경우
   - **(B)** 유사 정보로 대체 답변하는 경우
   - **(C)** 사용자가 파트너사 미팅, 의료기기 구매, 플래너 연결 등 **AI가 직접 수행할 수 없는 행동을 요청**하는 경우
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

// ========== Chat Stream (SSE 완전 소비 방식) ==========
async function callChatStream(userQuery, systemPrompt) {
    // ★ 답변 밀림 방지: 현재 질문을 강력하게 강조
    const emphasizedQuery = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n# 🎯 현재 사용자 질문 (반드시 이 질문에만 답변하세요)\n\n"${userQuery}"\n\n⚠️ 위 질문에만 답변하세요. 이전 대화에서 다루지 못한 주제가 있더라도, 반드시 현재 질문의 주제에만 답변하세요.\n━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    const res = await fetch(`${BASE_URL}/api/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery: emphasizedQuery, systemPrompt })
    });
    if (!res.ok) throw new Error(`Chat Stream 실패: ${res.status}`);

    // ReadableStream으로 chunk 단위로 읽기
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

        // 각 chunk에서 SSE 이벤트 파싱
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

    // 응답이 비었으면 rawSSE에서 한번 더 파싱 시도
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

// ========== 토킹포인트 추출 ==========
function extractTalkingPoint(responseText) {
    if (/\[NO_DATA\]/.test(responseText)) return null;
    if (/\[OFF_TOPIC\]/.test(responseText)) return null;

    const cleaned = responseText
        .replace(/\[TOPIC:[^\]]+\]/g, '')
        .replace(/\[NO_DATA\]/g, '')
        .replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/g, '')
        .trim();

    const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 0);
    if (paragraphs.length === 0) return null;

    const lastParagraph = paragraphs[paragraphs.length - 1].trim();

    const tpPatterns = [
        /(?:안내|설명|도움|알려|답변).*(?:드릴|해드릴|줄)\s*수/,
        /궁금하/,
        /확인해?\s*보/,
        /참고로/,
        /문의.*주/,
        /추천.*드/,
        /비교.*해/,
        /말씀해\s*주/,
        /알아보실/,
        /추가로/,
        /필요하시면/,
        /제공해?\s*드/,
        /확인하시면/,
    ];

    return tpPatterns.some(p => p.test(lastParagraph)) ? lastParagraph : null;
}

function talkingPointToQuestion(tp) {
    if (/플래너에게\s*연락/.test(tp)) return null;
    if (/문의\s*사항\s*있으시면/.test(tp)) return null;

    const cleaned = tp
        .replace(/^참고로\s*/, '')
        .replace(/^또한[,\s]*/, '')
        .replace(/에\s*대해서도\s*(자세히\s*)?(안내|설명|도움|알려|정보를 제공).*$/, '')
        .replace(/도\s*(안내|설명|추가적인\s*정보를?\s*제공).*$/, '')
        .replace(/[.!~]+$/, '')
        .trim();

    if (cleaned.length > 5 && cleaned.length < 80) return cleaned + '에 대해 알려주세요';
    return tp.replace(/[.!~]+$/, '').trim() + '에 대해 알려주세요';
}

function extractKeyEntities(answer) {
    const entities = [];
    const bold = answer.match(/\*\*([^*]{2,30})\*\*/g);
    if (bold) bold.forEach(m => entities.push(m.replace(/\*\*/g, '')));
    return [...new Set(entities)].slice(0, 10);
}

function decideNextQuestion(prevResult, topicPool, usedTopics, turnNum, consecutiveFollowups) {
    const decision = { question: '', reason: '' };
    const rand = Math.random();

    if (prevResult.talkingPoint && consecutiveFollowups < 2 && rand < 0.6) {
        const tpQ = talkingPointToQuestion(prevResult.talkingPoint);
        if (tpQ) {
            decision.question = tpQ; decision.reason = 'TP_FOLLOW';
            return decision;
        }
    }
    if (!prevResult.isNoData && !prevResult.skipped && rand < 0.4 && consecutiveFollowups < 2) {
        const entities = extractKeyEntities(prevResult.answer || '');
        const newEntities = entities.filter(e => !usedTopics.has(e));
        if (newEntities.length > 0) {
            const pick = newEntities[Math.floor(Math.random() * Math.min(3, newEntities.length))];
            decision.question = `${pick}에 대해 좀 더 자세히 알려주세요`;
            decision.reason = 'ENTITY_FOLLOW';
            usedTopics.add(pick);
            return decision;
        }
    }
    if (topicPool.length > 0) {
        decision.question = topicPool.shift(); decision.reason = 'NEW_TOPIC';
        return decision;
    }
    decision.question = '개원 준비할 때 중요한 것들을 알려주세요';
    decision.reason = 'FALLBACK';
    return decision;
}

// ========== 1턴 실행 ==========
async function runOneTurn(userQuery, history) {
    const historyText = history.getContextPrompt();
    const alreadyMentioned = history.getAlreadyMentioned();
    const isFirstMessage = history.turns.length === 0;

    // ---- Stage 1: Query Plan ----
    const queryPlan = await getQueryPlan(userQuery, historyText, alreadyMentioned);

    if (!queryPlan.requiresSearch && queryPlan.directAnswer) {
        history.addUserMessage(userQuery);
        history.addBotMessage(queryPlan.directAnswer);
        return {
            question: userQuery, answer: queryPlan.directAnswer,
            intent: queryPlan.intent, model: 'query-planner', docsCount: 0,
            talkingPoint: null, skipped: true, isNoData: false, isOffTopic: false
        };
    }

    // ---- Stage 2: Search ----
    const searchResults = await smartSearch(queryPlan);
    const filteredContexts = searchResults.slice(0, 30);
    const contextText = filteredContexts.map((item, idx) => formatDoc(item, idx)).join('\n\n---\n\n');

    // ---- Stage 3: Build prompt + Chat ----
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

    console.log(`    💬 AI 호출 시작 (문서 ${searchResults.length}개)...`);
    const result = await callChatStream(userQuery, systemPrompt);
    console.log(`    ✅ 응답 완료: ${result.text.length}자, 모델: ${result.model}`);

    // 히스토리에 추가
    let cleanAnswer = result.text
        .replace(/\[TOPIC:[^\]]+\]\n?/g, '')
        .replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/g, '')
        .trim();

    history.addUserMessage(userQuery);
    history.addBotMessage(cleanAnswer);

    const isNoData = /\[NO_DATA\]/.test(result.text);
    const isOffTopic = /\[OFF_TOPIC\]/.test(result.text);
    const tp = extractTalkingPoint(result.text);

    return {
        question: userQuery,
        answer: cleanAnswer.replace(/\[NO_DATA\]/g, '').replace(/\[OFF_TOPIC\]/g, '').trim(),
        rawAnswer: result.text, intent: queryPlan.intent, model: result.model,
        docsCount: searchResults.length, talkingPoint: tp, skipped: false,
        isNoData, isOffTopic,
        queryPlanDetail: {
            keywords: queryPlan.keywords,
            targetCategory: queryPlan.targetCategory,
            subIntent: queryPlan.subIntent
        }
    };
}

// ========== 메인 ==========
async function main() {
    const MAX_TURNS = 5;
    const history = new ConversationHistory();
    const results = [];
    const topicPool = [...TOPIC_POOL];
    const usedTopics = new Set();
    let output = '';
    let consecutiveFollowups = 0;

    output += '='.repeat(100) + '\n';
    output += `  챗봇 종합 품질 테스트 v4 — ${new Date().toLocaleString('ko-KR')}\n`;
    output += `  진료과: ${USER_SPECIALTY.label} | 이름: 오피앤 | ${MAX_TURNS}턴 검증\n`;
    output += `  환경: localhost:3003, buildSystemPrompt 원본 동일\n`;
    output += '='.repeat(100) + '\n\n';

    let nextQuestion = topicPool.shift();
    let nextReason = 'FIRST_MSG';

    for (let turn = 1; turn <= MAX_TURNS; turn++) {
        output += '-'.repeat(100) + '\n';
        output += `Q${String(turn).padStart(2, '0')} [${nextReason}]\n`;
        output += '-'.repeat(100) + '\n\n';

        console.log(`\n${'━'.repeat(60)}`);
        console.log(`Q${turn}/${MAX_TURNS} [${nextReason}]: "${nextQuestion}"`);

        try {
            const result = await runOneTurn(nextQuestion, history);

            // ── 질문↔답변 매칭 검증 ──
            const answerFirst50 = (result.answer || '').substring(0, 50);
            output += `  질문: ${result.question}\n`;
            output += `  Intent: ${result.intent} | 모델: ${result.model} | 문서: ${result.docsCount}개\n`;
            if (result.queryPlanDetail) {
                output += `  QueryPlan: keywords=${JSON.stringify(result.queryPlanDetail.keywords)}, category=${result.queryPlanDetail.targetCategory}\n`;
            }
            if (result.isNoData) output += `  🚨 [NO_DATA]\n`;
            if (result.isOffTopic) output += `  🚨 [OFF_TOPIC]\n`;
            if (result.skipped) output += `  ⏭️ DirectAnswer (검색 스킵)\n`;

            // 답변 전문 출력 (절삭 없음)
            output += `\n  ─── 답변 전문 (${(result.answer || '').length}자) ───\n`;
            output += (result.answer || '').split('\n').map(l => `  ${l}`).join('\n') + '\n';
            output += `  ─── 끝 ───\n`;

            if (result.talkingPoint) {
                output += `\n  🗣️ TP: "${result.talkingPoint}"\n`;
            } else if (!result.skipped && !result.isNoData) {
                output += `\n  ⚠️ TP 미감지\n`;
            }
            output += '\n';

            results.push({ ...result, reason: nextReason, qNum: turn });

            // 다음 질문 결정
            if (nextReason === 'TP_FOLLOW' || nextReason === 'ENTITY_FOLLOW') {
                consecutiveFollowups++;
            } else {
                consecutiveFollowups = 0;
            }

            if (turn < MAX_TURNS) {
                const decision = decideNextQuestion(result, topicPool, usedTopics, turn, consecutiveFollowups);
                nextQuestion = decision.question;
                nextReason = decision.reason;
                output += `  📌 다음: [${decision.reason}] "${decision.question.substring(0, 60)}"\n\n`;
            }

        } catch (err) {
            output += `  ❌ 에러: ${err.message}\n\n`;
            results.push({ question: nextQuestion, reason: nextReason, qNum: turn, error: err.message });
            console.error(`  ❌ ${err.message}`);
            if (topicPool.length > 0) { nextQuestion = topicPool.shift(); nextReason = 'NEW_TOPIC'; }
        }

        // 턴 간 충분한 대기
        await new Promise(r => setTimeout(r, 2000));
    }

    // ── 요약 ──
    output += '\n' + '='.repeat(100) + '\n';
    output += '  📊 5턴 검증 결과 요약\n';
    output += '='.repeat(100) + '\n\n';

    results.forEach(r => {
        const answerSnippet = (r.answer || r.error || '').substring(0, 80);
        const status = r.error ? '❌ ERROR' : r.isNoData ? '🚨 NO_DATA' : r.skipped ? '⏭️ SKIP' : '✅ OK';
        output += `  Q${r.qNum} [${r.reason}] ${status}\n`;
        output += `    질문: ${r.question}\n`;
        output += `    답변: ${answerSnippet}...\n`;
        if (r.talkingPoint) output += `    TP: ${r.talkingPoint.substring(0, 60)}...\n`;
        output += '\n';
    });

    fs.writeFileSync('_tp_test_v4_5q.txt', output, 'utf-8');
    console.log(`\n📄 결과 저장: _tp_test_v4_5q.txt (${output.length}자)`);
}

main().catch(err => { console.error('테스트 에러:', err); process.exit(1); });
