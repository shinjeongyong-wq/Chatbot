const CONFIG = {
    GOOGLE_API_KEY: 'AIzaSyACzOZzF6Wb2ZUYGEf_7GDa96dJKJSZdP4',
    SPREADSHEET_ID: '1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4',
    USE_MOCK_DATA: false,

    // API 엔드포인트 (Vercel Serverless Function)
    CHAT_ENDPOINT: '/api/chat'
};

let sheetsLoader = null;
let faqNavigationStack = [];

// 대화 맥락 유지를 위한 히스토리 (최근 10개 메시지)
let conversationHistory = [];
const MAX_HISTORY = 10;

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

    try {
        // ========== Stage 1: Query Planning ==========
        console.log('🧠 Stage 1: Query Planning 시작...');
        let queryPlan = null;
        let relatedContexts = [];

        try {
            const planResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: userMessage,
                    mode: 'plan'
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

        // 파트너사 목록 질문이면 더 많은 결과 검색
        const isPartnerListQuery = queryPlan?.intent === '파트너사목록' || queryPlan?.targetCategory === 'partners';
        const maxResults = isPartnerListQuery ? 20 : 10;

        if (queryPlan) {
            // Query Plan 기반 스마트 검색
            relatedContexts = await sheetsLoader.smartSearch(queryPlan, maxResults);
        } else {
            // Fallback: 기존 키워드 검색
            relatedContexts = await sheetsLoader.searchRelatedContext(userMessage, 10);
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
    // 참고문서 구성
    let contextText = '';
    if (contexts && contexts.length > 0) {
        contextText = contexts.map((item, idx) => {
            return `[${idx + 1}] Q: ${item.question}\nA: ${item.answer}`;
        }).join('\n\n');
    }

    // 대화 히스토리 구성 (최근 대화 맥락)
    let historyText = '';
    if (conversationHistory.length > 0) {
        historyText = conversationHistory.map(h =>
            `사용자: ${h.user}\n어시스턴트: ${h.assistant}`
        ).join('\n\n');
    }

    const systemPrompt = `당신은 병원 개원 전문 AI 컨설턴트입니다. 친절하고 전문적인 어조로 답변해주세요.

# 이전 대화 내역 (맥락 참고용)
${historyText ? historyText : '(첫 대화입니다)'}

# 참고문서
${contextText ? contextText : '(관련 데이터 없음)'}

# 가장 중요한 규칙 ⚠️

## 1. 참고문서에 관련 정보가 조금이라도 있으면
→ 해당 내용을 기반으로 **최대한 도움이 되는 답변**을 작성하세요.
→ 부분적인 정보만 있어도 그걸 활용해서 답변하세요.
→ **플래너 언급 금지**: "플래너에게 문의", "플래너와 상담" 같은 문구는 절대 넣지 마세요!

## 2. 질문이 병원 개원과 **전혀 무관**한 경우만
예: "오늘 날씨 어때?", "파이썬 코딩 방법", "맛집 추천해줘"
→ "[OFF_TOPIC]죄송합니다. 해당 질문에 대해서는 답변을 드리기 어렵습니다."

## 3. 병원 개원 관련인데 참고문서에 **전혀** 관련 내용이 없는 경우만
→ "[NO_DATA]죄송합니다. 현재 해당 질문에 대한 답변을 드리기 어렵습니다. 빠른 시일 내에 답변할 수 있도록 업데이트하겠습니다."

**핵심: 참고문서에 조금이라도 관련 내용이 있으면 [OFF_TOPIC]이나 [NO_DATA] 없이 바로 답변하세요!**
**절대로 참고문서에 없는 내용을 지어내지 마세요. 할루시네이션은 금지입니다.**

# ⭐ 파트너사/업체 목록 질문에 대한 응답 규칙
"파트너사 알려줘", "업체 추천", "명단", "리스트" 같은 질문이면:

→ 참고문서에 있는 **모든 업체**를 **아래 형식으로 나열**하세요:

**1. [업체명] [1]**
- 업력: (설립연도, 몇년차)
- 주요 특징: (간략 설명)
- 가격대: (있으면)

**2. [업체명] [2]**
- 업력: (설립연도, 몇년차)
- 주요 특징: (간략 설명)
- 가격대: (있으면)

... (참고문서에 있는 모든 업체 나열)

→ 업체 정보가 있으면 **가능한 많이** 나열 (3개 이상 권장)
→ 업체명만 언급하고 설명 없이 끝내지 말 것

# 답변 스타일 규칙 (참고문서에 관련 내용이 있을 때만)

## 1. 말투
- 모든 문장은 정중한 "~요", "~습니다", "~해요" 체로 작성
- 딱딱한 명사형 종결("관리, 시공") 금지 → "관리해요", "시공해요"로 변환
- 친근하면서도 전문적인 컨설턴트 느낌

## 2. 첫 문장 (도입부)
- 질문 주제를 자연스럽게 요약하며 시작
- 예시: "[주제]에 대해 여러 요소를 종합적으로 고려해야 해요. 주요 내용을 안내해 드릴게요."
- "참고문서에서 찾아보면:" 같은 어색한 표현 금지

## 3. 본문 구조 (반드시 번호 라벨링!)
**1. 첫 번째 주제**
- **세부항목**: 상세 설명이에요.[1]

**2. 두 번째 주제**
- **세부항목**: 상세 설명이에요.[2]

**3. 세 번째 주제**
- **세부항목**: 상세 설명이에요.[3]

## 4. 출처 표기
- 참고문서 번호 [1], [2], [3] 그대로 사용
- 문장 끝에 붙여서 표기

## 5. 금지 사항
- 참고문서에 없는 내용 창작 금지
- 딱딱한 명사형 종결 금지
- 어색한 도입부 금지
- 주제 번호 라벨링 누락 금지`;


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
            console.error(`API 에러: ${response.status}`);
            return { text: '죄송합니다. AI 서버 연결에 문제가 발생했습니다.', modelName: null };
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

    // Google Sheets에 저장
    try {
        await fetch('https://script.google.com/macros/s/AKfycbzCPbV3COpzi0_8Ss2aqeAmx-KvkZHhaPjssLQ37I8ygpT-wiELLlfsTx5JRrPVvWt3/exec', {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(feedback)
        });
        alert('피드백이 제출되었습니다. 감사합니다!');
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
            <a href="https://docs.google.com/spreadsheets/d/1Ai-3VqDn98aN0XG-FhRHBIFQ-LqqEHbcqUdvF1nWDVs/edit#gid=0" 
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
        document.getElementById('contactName').value = '';
        document.getElementById('contactPhone').value = '';
    }
}

async function submitContact() {
    const name = document.getElementById('contactName').value.trim();
    const phone = document.getElementById('contactPhone').value.trim();

    if (!name || !phone) {
        alert('이름과 전화번호를 모두 입력해주세요.');
        return;
    }

    const contactData = {
        name: name,
        phone: phone,
        question: window.currentQuestion || '',
        timestamp: new Date().toLocaleString('ko-KR'),
        sheetName: 'ContactRequests'
    };

    closeContactModal();

    try {
        await fetch('https://script.google.com/macros/s/AKfycbzCPbV3COpzi0_8Ss2aqeAmx-KvkZHhaPjssLQ37I8ygpT-wiELLlfsTx5JRrPVvWt3/exec', {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(contactData)
        });

        // 채팅창에 확인 메시지 표시
        const confirmDiv = document.createElement('div');
        confirmDiv.className = 'message bot';
        confirmDiv.innerHTML = `
            <div class="message-avatar">✅</div>
            <div class="message-content" style="background: #dcfce7; border: 1px solid #22c55e;">
                <p style="font-weight: 600; color: #166534;">📞 플래너에게 전달되었습니다!</p>
                <p style="margin-top: 8px; color: #166534;">입력하신 연락처(${phone})로 곧 연락드리겠습니다.</p>
            </div>
        `;
        chatContainer.appendChild(confirmDiv);
        scrollToBottom();

    } catch (error) {
        console.error('연락 요청 저장 오류:', error);
        alert('요청 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    }
}

// 엔터 키로 연락 요청 제출
document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && document.getElementById('contactModal')?.classList.contains('active')) {
        if (e.target.id === 'contactName' || e.target.id === 'contactPhone') {
            e.preventDefault();
            submitContact();
        }
    }
});
