const CONFIG = {
    GOOGLE_API_KEY: 'AIzaSyDT9DR8jDxOICDbWl3_YhC56d8h_5A-IuU',
    SPREADSHEET_ID: '1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4',
    USE_MOCK_DATA: false,

    // API 엔드포인트 (Vercel Serverless Function)
    CHAT_ENDPOINT: '/api/chat'
};

// ★ Phase 4: 진료과별 키워드 확장 ★
const SPECIALTIES = {
    '통증': {
        label: '통증',
        emoji: '💪',
        keywords: [
            // 기본
            '통증', '정형외과', '재활', '물리치료', '도수치료', 'X-ray', '척추', '관절',
            // 시술
            '신경차단', '주사', '프롤로', '증식치료', '초음파', 'C-arm', '씨암',
            // 장비
            '충격파', 'ESWT', '고주파', '레이저치료', 'HILT', '적외선',
            // 부위
            '허리', '목', '어깨', '무릎', '발목', '손목', '디스크', '협착증',
            // 기타
            '근골격', 'MSK', '스포츠손상'
        ]
    },
    '내과': {
        label: '내과',
        emoji: '🩺',
        keywords: [
            // 기본
            '내과', '검진', '내시경', '초음파', '만성질환', '건강검진', '소화기',
            // 검사
            '위내시경', '대장내시경', '복부초음파', '간초음파', '혈액검사',
            // 질환
            '고혈압', '당뇨', '고지혈증', '간질환', '위염', '당뇨병', '신부전',
            // 장비
            '투석', '투석기', '심전도', 'EKG', 'X-ray', 'CT', 'MRI',
            // 검진
            '암검진', '5대암', '국가검진', '종합검진', '건강검진센터'
        ]
    },
    '미용': {
        label: '미용',
        emoji: '✨',
        keywords: [
            // 기본
            '피부', '미용', '성형', '레이저', '보톡스', '필러', '리프팅', '피부과', '성형외과',
            // 시술명
            '주름', '탄력', '모공', '여드름', '색소', '미백', '홍조',
            '슈링크', '울쎄라', '써마지', '인모드', '튠페이스',
            // 의료기기
            'IPL', 'M22', '피코레이저', '피코', '프락셔널', 'CO2', 'CO2레이저',
            '고주파', 'RF', 'HIFU', '초음파리프팅',
            // 부위
            '얼굴', '눈가', '이마', '팔자', '턱선', '목주름',
            // 기타
            '안티에이징', '쁘띠', '비침습', '동안'
        ]
    },
    '치과': {
        label: '치과',
        emoji: '🦷',
        keywords: [
            // 기본
            '치과', '임플란트', '교정', '보철', '스케일링', '덴탈',
            // 시술
            '발치', '신경치료', '근관치료', '잇몸치료', '치주',
            '라미네이트', '베니어', '크라운', '브릿지',
            // 교정
            '투명교정', '인비절라인', '설측교정', '부분교정',
            // 장비
            'X-ray', '파노라마', 'CT', 'CAD/CAM', '구강스캐너',
            // 기타
            '충치', '사랑니', '치아미백', '치석제거'
        ]
    }
};

let currentUserSpecialty = null; // 사용자가 선택한 진료과

let sheetsLoader = null;
let faqNavigationStack = [];

// 대화 맥락 유지를 위한 히스토리 (최근 10개 메시지)
let conversationHistory = [];
const MAX_HISTORY = 10;

// ★ 지능형 중복 배제: 이전 답변에서 언급된 주요 키워드(업체명, 장비명) 추출 ★
function extractMentionedKeywords() {
    if (conversationHistory.length === 0) return [];

    const mentioned = new Set();

    // 최근 답변들에서 키워드 추출
    conversationHistory.forEach(h => {
        if (!h.assistant) return;
        const text = h.assistant;

        // 패턴 1: 번호로 시작하는 항목 (예: "1. 무이디자인", "**2. 체외충격파**")
        const numberedItems = text.match(/\d+\.\s*\*{0,2}([가-힣A-Za-z0-9\-\/]+)/g) || [];
        numberedItems.forEach(item => {
            const cleaned = item.replace(/^\d+\.\s*\**/g, '').trim();
            if (cleaned.length >= 2 && cleaned.length <= 25) mentioned.add(cleaned);
        });

        // 패턴 2: 불렛 포인트 뒤의 첫 단어 (예: "* C-Arm", "- 체외충격파")
        const bulletItems = text.match(/[*\-]\s+\*{0,2}([가-힣A-Za-z][가-힣A-Za-z0-9\-\/]*)/g) || [];
        bulletItems.forEach(item => {
            const cleaned = item.replace(/^[*\-]\s*\**/g, '').trim();
            if (cleaned.length >= 2 && cleaned.length <= 25) mentioned.add(cleaned);
        });

        // 패턴 3: 괄호 안의 영문 약자 (예: "(ESWT)", "(RF)", "(HILT)")
        const acronyms = text.match(/\(([A-Z][A-Za-z0-9\-\/]{1,15})\)/g) || [];
        acronyms.forEach(item => {
            const cleaned = item.replace(/[()]/g, '').trim();
            if (cleaned.length >= 2 && cleaned.length <= 15) mentioned.add(cleaned);
        });

        // 패턴 4: 굵은 글씨로 강조된 단어 (예: "**전자기펄스기**", "**C-Arm**")
        const boldItems = text.match(/\*\*([가-힣A-Za-z][^*]{1,25})\*\*/g) || [];
        boldItems.forEach(item => {
            const cleaned = item.replace(/\*\*/g, '').trim();
            // 너무 긴 문장은 제외, 짧은 핵심 단어만
            if (cleaned.length >= 2 && cleaned.length <= 25 && !cleaned.includes('규칙') && !cleaned.includes('중요')) {
                mentioned.add(cleaned);
            }
        });

        // 패턴 5: 콜론 앞의 핵심 단어 (예: "체외충격파(ESWT):", "MRI 및 CT:")
        const colonItems = text.match(/([가-힣A-Za-z][가-힣A-Za-z0-9\-\/\(\)]{2,20}):/g) || [];
        colonItems.forEach(item => {
            const cleaned = item.replace(/:/g, '').trim();
            if (cleaned.length >= 2 && cleaned.length <= 25) mentioned.add(cleaned);
        });
    });

    // 일반적인 단어 제외 (노이즈 필터)
    const noiseWords = ['예시', '참고', '안내', '설명', '정보', '내용', '경우', '관련', '추천', '소개'];
    const result = [...mentioned].filter(word => !noiseWords.some(noise => word.includes(noise)));

    console.log('🔍 추출된 키워드:', result);
    return result;
}

const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const faqContent = document.getElementById('faqContent');
const faqNav = document.getElementById('faqNav');
const faqBackBtn = document.getElementById('faqBackBtn');

// ==========================
// 1. 초기화 및 이벤트
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // 진료과 확인 - 저장된 진료과가 없으면 모달 표시
    const savedSpecialty = localStorage.getItem('userSpecialty');
    if (savedSpecialty && SPECIALTIES[savedSpecialty]) {
        currentUserSpecialty = savedSpecialty;
        updateSpecialtyBadge();
    } else {
        openSpecialtyModal();
    }

    sheetsLoader = new GoogleSheetsLoader(CONFIG.GOOGLE_API_KEY);
    try {
        await sheetsLoader.loadData();
        renderFAQFields();
    } catch (error) {
        console.error('Initial Load Error:', error);
    }
    setupEventListeners();
});

function setupEventListeners() {
    sendButton.addEventListener('click', handleSendMessage);
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    userInput.addEventListener('input', () => {
        userInput.style.height = 'auto';
        userInput.style.height = userInput.scrollHeight + 'px';
    });
    faqBackBtn.addEventListener('click', navigateBack);
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('suggestion-chip')) {
            const question = e.target.getAttribute('data-question');
            if (question) sendUserMessage(question);
        }
    });
}

// ==========================
// 2. FAQ 네비게이션
// ==========================
function renderFAQFields() {
    faqNavigationStack = [];
    updateFAQView('fields');
    const fields = sheetsLoader.getFields().filter(f => !f.includes('주제')).sort((a, b) => a.localeCompare(b, 'ko'));
    if (fields.length === 0) {
        faqContent.innerHTML = '<div style="padding:20px;">표시할 내용이 없습니다.</div>';
        return;
    }
    faqContent.innerHTML = fields.map(field => `
        <button class="faq-item-btn" onclick="renderFAQTopics('${field}')">
            <span>💡 ${field}</span><span class="faq-arrow">›</span>
        </button>`).join('');
}

function renderFAQTopics(field) {
    faqNavigationStack.push({ view: 'fields', data: null });
    updateFAQView('topics');
    const topics = sheetsLoader.getTopics(field);
    faqContent.innerHTML = `<div style="margin-bottom:12px; font-size:13px; color:#64748b;">${field} > 주제 선택</div>` +
        topics.map(topic => `<button class="faq-item-btn" onclick="renderFAQList('${field}', '${topic}')">
            <span>📑 ${topic}</span><span class="faq-arrow">›</span>
        </button>`).join('');
}

function renderFAQList(field, topic) {
    faqNavigationStack.push({ view: 'topics', data: field });
    updateFAQView('list');
    const list = sheetsLoader.getFAQList(field, topic);
    faqContent.innerHTML = `<div style="margin-bottom:12px; font-size:13px; color:#64748b;">${field} > ${topic}</div>` +
        list.map(item => `<div class="faq-question-item" onclick="toggleFAQAnswer(this)">
            <div class="faq-q">Q. ${item.question}</div>
            <div class="faq-a">${item.answer.replace(/\n/g, '<br>')}</div>
        </div>`).join('');
}

function navigateBack() {
    if (faqNavigationStack.length === 0) return;
    const prevState = faqNavigationStack.pop();
    if (prevState.view === 'fields') renderFAQFields();
    else if (prevState.view === 'topics') renderFAQTopics(prevState.data);
}

function updateFAQView(view) {
    faqNav.classList.toggle('active', view !== 'fields');
    faqContent.scrollTop = 0;
}

function toggleFAQAnswer(el) {
    const wasActive = el.classList.contains('active');
    document.querySelectorAll('.faq-question-item').forEach(e => e.classList.remove('active'));
    if (!wasActive) el.classList.add('active');
}

// ==========================
// 3. 채팅 및 RAG 로직
// ==========================
async function handleSendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    sendUserMessage(message);
}

function sendUserMessage(message) {
    userInput.value = '';
    userInput.style.height = 'auto';
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.style.display = 'none';

    addMessage(message, 'user');
    showTypingIndicator();
    getBotResponse(message);
}

async function getBotResponse(userMessage) {
    // 피드백용으로 현재 질문 저장
    window.currentQuestion = userMessage;

    // 사용자 질문을 Google Sheets에 수집 (비동기, 에러 무시)
    try {
        await fetch('/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sheetName: 'UserQuestions',
                question: userMessage,
                timestamp: new Date().toLocaleString('ko-KR')
            })
        }).catch(() => { }); // 에러 무시
    } catch (e) {
        console.log('질문 수집 오류 (무시됨):', e);
    }

    try {
        // ========== Stage 1: Query Planning ==========
        console.log('🧠 Stage 1: Query Planning 시작...');
        let queryPlan = null;
        let relatedContexts = [];

        try {
            // ★ Phase 5: Query Planner에 사용자 진료과 정보 + 최근 대화 맥락 전달 ★
            const userSpec = getUserSpecialty();

            // 최근 3턴의 대화 맥락 생성 (플래너용 경량 버전)
            const recentContext = conversationHistory.slice(-3).map(h =>
                `사용자: ${h.user}\nAI: ${(h.assistant || '').substring(0, 150)}...`
            ).join('\n');

            console.log('📝 플래너에게 전달할 맥락:', recentContext ? recentContext.substring(0, 200) + '...' : '(첫 대화)');

            const planResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: userMessage,
                    mode: 'plan',
                    userSpecialty: userSpec,
                    recentContext: recentContext  // 최근 대화 맥락 추가
                })
            });

            if (planResponse.ok) {
                const planResult = await planResponse.json();
                if (planResult.success && planResult.plan) {
                    queryPlan = planResult.plan;
                    console.log('✅ Query Plan 수신:', queryPlan);
                    console.log('   Intent:', queryPlan.intent);
                    console.log('   Planner:', planResult.modelName);

                    // Off-topic 체크
                    if (queryPlan.intent === 'off_topic') {
                        hideTypingIndicator();
                        addOffTopicMessage('죄송합니다. 해당 질문에 대해서는 답변을 드리기 어렵습니다.');
                        return;
                    }
                }
            }
        } catch (planError) {
            console.warn('Query Planning 실패, 기본 검색으로 fallback:', planError);
        }

        // ========== Stage 2: Smart Search ==========
        console.log('🔍 Stage 2: Smart Search 시작...');

        // 성능 최적화: 검색 결과 한도 하향 조정 (서버 부하 감소)
        const isPartnerListQuery = queryPlan?.intent === '파트너사목록' || queryPlan?.targetCategory === 'partners';
        const maxResults = isPartnerListQuery ? 15 : 8;

        if (queryPlan) {
            // Query Plan 기반 스마트 검색 (사용자 진료과 정보 전달)
            const userSpec = getUserSpecialty();
            relatedContexts = await sheetsLoader.smartSearch(queryPlan, maxResults, userSpec);
        } else {
            // Fallback: 기존 키워드 검색
            relatedContexts = await sheetsLoader.searchRelatedContext(userMessage, 8);
        }

        console.log(`📚 검색 결과: ${relatedContexts.length}개 문서`);

        // ========== Stage 3: Answer Generation ==========
        console.log('💬 Stage 3: 답변 생성 시작...');
        const result = await callOpenRouterAPI(userMessage, relatedContexts);

        hideTypingIndicator();

        // AI 응답 태그 감지
        let responseText = result.text;

        if (result.text.includes('[OFF_TOPIC]')) {
            const cleanText = result.text.replace('[OFF_TOPIC]', '');
            addOffTopicMessage(cleanText);
            responseText = cleanText;
        } else if (result.text.includes('[NO_DATA]')) {
            const cleanText = result.text.replace('[NO_DATA]', '');
            addNoDataMessage(cleanText);
            responseText = cleanText;
        } else {
            addFormattedMessage(result.text, relatedContexts, result.modelName);
        }

        // 대화 히스토리에 저장 (맥락 유지)
        conversationHistory.push({
            user: userMessage,
            assistant: responseText.substring(0, 500)
        });
        if (conversationHistory.length > MAX_HISTORY) {
            conversationHistory.shift();
        }

    } catch (error) {
        console.error('Bot Response Error:', error);
        hideTypingIndicator();
        addMessage('죄송합니다. 오류가 발생했습니다.', 'bot');
    }
}

async function callOpenRouterAPI(userQuery, contexts) {
    // ★ Phase 3-2: 참고문서에 진료과 메타데이터 시각화 ★
    const userSpec = getUserSpecialty();
    let contextText = '';
    if (contexts && contexts.length > 0) {
        contextText = contexts.map((item, idx) => {
            let prefix = `[${idx + 1}]`;

            // 진료과 태그 시각화
            if (item.metadata?.specialties && item.metadata.specialties.length > 0) {
                const tags = item.metadata.specialties.map(s => {
                    const emoji = SPECIALTIES[s]?.emoji || '';
                    const match = userSpec && s === userSpec.code ? '✓' : '';
                    return `${emoji}${s}${match}`;
                }).join(' ');
                prefix += ` ${tags} |`;
            } else {
                prefix += ` (태그없음) |`;
            }

            // 토큰 최적화: answer를 400자로 제한
            const truncatedAnswer = item.answer.length > 400
                ? item.answer.substring(0, 400) + '...(이하 생략)'
                : item.answer;
            return `${prefix} Q: ${item.question}\nA: ${truncatedAnswer}`;
        }).join('\n\n');
    }

    // 대화 히스토리 구성 (토큰 최적화: 압축된 형태로 전달)
    let historyText = '';
    if (conversationHistory.length > 0) {
        historyText = conversationHistory.map(h =>
            `Q: ${h.user.substring(0, 50)}${h.user.length > 50 ? '...' : ''}\nA: ${(h.assistant || '').substring(0, 100)}...`
        ).join('\n');
    }

    // ★ Phase 3-1: 시스템 프롬프트에 진료과 우선순위 강화 ★
    let specialtyInfo = '';
    if (userSpec && userSpec.label) {
        specialtyInfo = `사용자는 **${userSpec.label}** 개원을 준비 중입니다.

**[중요] 답변 생성 규칙:**
1. 검색 결과 중 **[${userSpec.label}✓]** 태그가 있는 문서를 **최우선**으로 참고하세요.
2. 태그가 없어도 본문에 ${userSpec.keywords.slice(0, 5).join(', ')} 등 ${userSpec.label} 관련 내용이 있으면 우선 포함하세요.
3. 다른 진료과 내용보다 **${userSpec.label} 관련 정보를 먼저** 설명하세요.
4. 파트너사/의료기기/비용 등의 질문에서도 **${userSpec.label}에 적합한 항목을 우선 추천**하세요.`;
    }

    // ★ 지능형 중복 배제: 이미 언급된 항목 목록 생성 ★
    const alreadyMentioned = extractMentionedKeywords();
    let deduplicationRule = '';
    if (alreadyMentioned.length > 0) {
        deduplicationRule = `
# ⛔ 중복 금지 (이미 설명한 항목)
${alreadyMentioned.slice(0, 15).join(', ')}

→ 위 항목은 다시 설명하지 마세요. 새로운 정보만 답변하거나, 없으면 "추가 정보가 없습니다"라고 하세요.
`;
    }

    const systemPrompt = `당신은 병원 개원 전문 AI 컨설턴트입니다. 친절하고 전문적인 어조로 답변해주세요.

${specialtyInfo ? '# 사용자 진료과\n' + specialtyInfo + '\n' : ''}
${deduplicationRule}
# 이전 대화
${historyText ? historyText : '(첫 대화)'}

# 참고문서
${contextText ? contextText : '(관련 데이터 없음)'}

# 핵심 규칙
1. 참고문서 내용 기반으로만 답변 (할루시네이션 금지)
2. 병원 개원과 무관한 질문 → "[OFF_TOPIC]죄송합니다. 해당 질문에 대해서는 답변을 드리기 어렵습니다."
3. 관련 데이터 없음 → "[NO_DATA]죄송합니다. 현재 해당 질문에 대한 답변을 드리기 어렵습니다."
4. "플래너에게 문의" 같은 표현 금지

# 답변 형식
- 번호 라벨링 사용 (1. 2. 3...)
- 출처 표기: 참고문서 [번호]와 정확히 매칭
- 정중한 말투 (~요, ~습니다)`;


    try {
        console.log('🤖 AI 서버 호출 중...');

        const response = await fetch(CONFIG.CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userQuery: `질문: ${userQuery}`,
                systemPrompt: systemPrompt
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error(`API 에러: ${response.status}`, errorData);

            let errorMsg = '죄송합니다. AI 서버 연결에 문제가 발생했습니다.';

            // API Key 미설정 시 사용자에게 힌트 제공 (디버깅용)
            if (errorData.debug && !errorData.debug.apiKeyExists) {
                errorMsg += '\n(원인: Vercel 환경변수 GEMINI_API_KEY가 설정되지 않았습니다)';
            } else if (errorData.error) {
                errorMsg += `\n(원인: ${errorData.error})`;
            }

            return { text: errorMsg, modelName: null };
        }

        const data = await response.json();

        if (data.success && data.text) {
            return { text: data.text, modelName: data.modelName };
        } else {
            return { text: data.error || '응답을 받지 못했습니다.', modelName: null };
        }
    } catch (e) {
        console.error('API 호출 에러:', e.message);
        return { text: '죄송합니다. 현재 AI 서비스를 이용할 수 없습니다. 잠시 후 다시 시도해주세요.', modelName: null };
    }
}

// ==========================
// 4. UI 렌더링
// ==========================
function addMessage(text, sender) {
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerHTML = `<div class="message-avatar">${sender === 'user' ? '나' : 'AI'}</div><div class="message-content">${text.replace(/\n/g, '<br>')}</div>`;
    chatContainer.appendChild(div);
    scrollToBottom();
}

// 마크다운을 HTML로 변환하여 렌더링
function addFormattedMessage(text, contexts, modelName = null) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // 1. 주석 번호 재정렬: [10], [2], [6] → [1], [2], [3] 순서로 변환
    let processedText = text;
    const citationRegex = /\[(\d+)\]/g;
    const foundCitations = [];
    let match;

    // 텍스트에서 등장하는 순서대로 원래 번호 수집
    while ((match = citationRegex.exec(text)) !== null) {
        const origNum = parseInt(match[1]);
        if (!foundCitations.includes(origNum)) {
            foundCitations.push(origNum);
        }
    }

    // 원래 번호 → 새 번호 매핑 생성 (등장 순서대로 1, 2, 3...)
    const citationMap = {};
    foundCitations.forEach((origNum, idx) => {
        citationMap[origNum] = idx + 1;
    });

    // 텍스트의 모든 [숫자]를 새 번호로 교체
    processedText = text.replace(/\[(\d+)\]/g, (match, num) => {
        const newNum = citationMap[parseInt(num)];
        return newNum ? `[${newNum}]` : match;
    });

    // 컨텍스트도 등장 순서대로 재정렬
    const reorderedContexts = foundCitations.map(origNum => {
        return contexts[origNum - 1]; // 0-indexed
    }).filter(ctx => ctx); // undefined 제거

    // 2. 마크다운 → HTML 변환
    let html = processedText
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^### (.+)$/gm, '<h4 class="response-heading">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="response-heading">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^---[\s\S]*$/gm, '')
        .replace(/\n/g, '<br>');

    // <li> 태그들을 <ul>로 감싸기
    html = html.replace(/(<li>.*?<\/li>)(<br>)?/g, '$1');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="response-list">$1</ul>');
    html = html.replace(/<\/ul><br>?<ul class="response-list">/g, '');

    // 3. [1], [2] 등을 툴팁으로 변환 (재정렬된 컨텍스트 사용)
    reorderedContexts.forEach((ctx, idx) => {
        if (!ctx) return;
        const num = idx + 1;
        const answerPreview = ctx.answer.length > 200 ? ctx.answer.substring(0, 200) + '...' : ctx.answer;
        const tooltip = `<strong>Q:</strong> ${escapeHtml(ctx.question)}<br><br><strong>A:</strong> ${escapeHtml(answerPreview)}`;
        const citationHtml = `<span class="cite-ref">[${num}]<span class="cite-tooltip">${tooltip}</span></span>`;
        const regex = new RegExp(`\\[${num}\\]`, 'g');
        html = html.replace(regex, citationHtml);
    });

    // 4. 사용한 모델명 표시
    const modelInfo = modelName ? `<div class="model-info">🤖 ${modelName}</div>` : '';

    // 5. 피드백 버튼 추가
    const messageId = Date.now();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
        </div>
    `;

    // 질문/답변 저장 (피드백용)
    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: text.substring(0, 500)
    };

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">${html}${modelInfo}${feedbackButtons}</div>
    `;

    chatContainer.appendChild(div);
    scrollToBottom();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.id = 'typingIndicator';
    div.className = 'typing-indicator';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="typing-dots">
            <span></span><span></span><span></span>
        </div>
        <span style="color:#64748b; font-size:13px;">답변 생성 중...</span>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
}

function hideTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// ========== 피드백 시스템 ==========
let currentFeedbackType = null;
let currentFeedbackMessageId = null;

function openFeedbackModal(type, messageId) {
    currentFeedbackType = type;
    currentFeedbackMessageId = messageId;

    const modal = document.getElementById('feedbackModal');
    const title = document.getElementById('feedbackModalTitle');
    const textarea = document.getElementById('feedbackTextarea');

    title.textContent = type === 'good' ? '👍 긍정적 피드백' : '👎 부정적 피드백';
    textarea.value = '';
    modal.classList.add('active');

    // 버튼 선택 표시
    const buttons = document.querySelector(`[data-message-id="${messageId}"]`);
    if (buttons) {
        buttons.querySelectorAll('.feedback-btn').forEach(btn => btn.classList.remove('selected'));
        buttons.querySelector(`.feedback-btn.${type}`).classList.add('selected');
    }
}

function closeFeedbackModal() {
    document.getElementById('feedbackModal').classList.remove('active');
    currentFeedbackType = null;
    currentFeedbackMessageId = null;
}

async function submitFeedback() {
    const content = document.getElementById('feedbackTextarea').value.trim();
    const messageData = window.lastMessages?.[currentFeedbackMessageId] || {};

    const feedback = {
        type: currentFeedbackType === 'good' ? 'Good' : 'Bad',
        question: messageData.question || '',
        answer: messageData.answer || '',
        content: content || '(내용 없음)',
        timestamp: new Date().toLocaleString('ko-KR')
    };

    closeFeedbackModal();

    // Google Sheets에 저장 (Vercel API 경유)
    try {
        const response = await fetch('/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sheetName: 'Feedback',
                ...feedback
            })
        });

        if (response.ok) {
            showSuccessModal('피드백 전달이 완료되었습니다. 빠른 시일 내에 수정해서 이용하시는데에 불편함 없도록 하겠습니다.');
        } else {
            throw new Error('Feedback save failed');
        }
    } catch (error) {
        console.error('피드백 저장 오류:', error);
        alert('피드백 제출 중 오류가 발생했습니다.');
    }
}

function showFeedbackListModal() {
    const modal = document.getElementById('feedbackListModal');
    modal.classList.add('active');
    renderFeedbackList();
}

function closeFeedbackListModal() {
    document.getElementById('feedbackListModal').classList.remove('active');
}

function renderFeedbackList() {
    const container = document.getElementById('feedbackListContent');
    container.innerHTML = `
        <div style="text-align:center; padding:40px;">
            <div style="font-size: 48px; margin-bottom: 16px;">📊</div>
            <h4 style="margin-bottom: 12px; color: #334155;">피드백은 Google Sheets에서 확인하세요</h4>
            <p style="color: #64748b; margin-bottom: 20px; font-size: 14px;">
                모든 사용자의 피드백은 Google Sheets "Feedback" 시트에 저장됩니다.
            </p>
            <a href="https://docs.google.com/spreadsheets/d/1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4/edit#gid=1727721047" 
               target="_blank"
               style="display: inline-block; padding: 12px 24px; background: #536db1; color: white; text-decoration: none; border-radius: 8px; font-weight: 500;">
                Google Sheets 열기 →
            </a>
        </div>
    `;
}

// ========== 데이터 없음 + 플래너 연락 ==========
// 병원 개원 무관 질문 - 플래너 버튼 없음
function addOffTopicMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <p>${text || '죄송합니다. 해당 질문에 대해서는 답변을 드리기 어렵습니다.'}</p>
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
}

// 병원 개원 관련이지만 데이터 없음 - 플래너 버튼 있음
function addNoDataMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <p>${text || '죄송합니다. 현재 해당 질문에 대한 답변을 드리기 어렵습니다. 빠른 시일 내에 답변할 수 있도록 업데이트하겠습니다.'}</p>
            <p style="margin-top: 12px;">더 자세한 상담이 필요하시면 <strong>전문 플래너</strong>에게 문의해 주세요.</p>
            <div style="margin-top: 16px;">
                <button onclick="openContactModal()" 
                    style="padding: 12px 24px; background: #22c55e; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">
                    ☎️ 플래너에게 연락하기
                </button>
            </div>
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
}

function openContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeContactModal() {
    const modal = document.getElementById('contactModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function selectPlanner(plannerName) {
    closeContactModal();

    try {
        // Vercel API를 통해 Slack으로 전송 (Webhook URL은 환경변수에 저장)
        const response = await fetch('/api/slack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                question: window.currentQuestion || '',
                plannerName: plannerName
            })
        });

        if (response.ok) {
            showSuccessModal('플래너에게 전달되었습니다. 빠른 시일 내에 연락 드리겠습니다.');
        } else {
            throw new Error('Slack send failed');
        }

    } catch (error) {
        console.error('Slack 전송 오류:', error);
        alert('전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
}

// 성공 메시지 모달
function showSuccessModal(message) {
    const modal = document.getElementById('successModal');
    const messageEl = document.getElementById('successModalMessage');
    if (modal && messageEl) {
        messageEl.textContent = message;
        modal.classList.add('active');
    }
}

function closeSuccessModal() {
    const modal = document.getElementById('successModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// ==========================
// 진료과 선택 관련 함수
// ==========================
function openSpecialtyModal() {
    const modal = document.getElementById('specialtyModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeSpecialtyModal() {
    const modal = document.getElementById('specialtyModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function selectSpecialty(specialty) {
    if (!SPECIALTIES[specialty]) {
        console.error('Invalid specialty:', specialty);
        return;
    }

    // 기존 진료과와 다른 경우에만 초기화 (첫 선택이 아닌 경우)
    const isChanging = currentUserSpecialty && currentUserSpecialty !== specialty;

    currentUserSpecialty = specialty;
    localStorage.setItem('userSpecialty', specialty);

    updateSpecialtyBadge();
    closeSpecialtyModal();

    console.log(`✅ 진료과 선택됨: ${SPECIALTIES[specialty].label}`);

    // 진료과 변경 시 대화 히스토리 초기화 및 채팅창 리셋
    if (isChanging) {
        // 대화 히스토리 초기화
        conversationHistory = [];
        console.log('🔄 진료과 변경으로 대화 히스토리 초기화됨');

        // 채팅창 초기화 (환영 메시지만 유지)
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }

        // 환영 메시지 표시
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'block';
        }

        // 알림 팝업 표시
        showSuccessModal('진료과가 변경되어 새로운 대화가 시작됩니다.');
    }

    // 환영 메시지 텍스트 업데이트
    const welcomeMsg = document.querySelector('.welcome-message h2');
    if (welcomeMsg) {
        welcomeMsg.textContent = `${SPECIALTIES[specialty].emoji} ${SPECIALTIES[specialty].label} 개원을 도와드릴게요!`;
    }
}

function updateSpecialtyBadge() {
    const badge = document.getElementById('specialtyBadge');
    const badgeText = document.getElementById('specialtyBadgeText');

    if (badge && badgeText && currentUserSpecialty && SPECIALTIES[currentUserSpecialty]) {
        const spec = SPECIALTIES[currentUserSpecialty];
        badgeText.textContent = `${spec.emoji} ${spec.label}`;
        badge.style.display = 'inline-flex';
    }
}

// 현재 사용자의 진료과와 관련 키워드 반환
function getUserSpecialty() {
    if (!currentUserSpecialty || !SPECIALTIES[currentUserSpecialty]) {
        return null;
    }
    return {
        code: currentUserSpecialty,
        ...SPECIALTIES[currentUserSpecialty]
    };
}
