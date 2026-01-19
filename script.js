const CONFIG = {
    GOOGLE_API_KEY: 'AIzaSyACzOZzF6Wb2ZUYGEf_7GDa96dJKJSZdP4',
    SPREADSHEET_ID: '1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4',
    USE_MOCK_DATA: false,

    // API 엔드포인트 (Vercel Serverless Function)
    CHAT_ENDPOINT: '/api/chat'
};

let sheetsLoader = null;
let faqNavigationStack = [];

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
    try {
        // RAG 전수조사
        const relatedContexts = await sheetsLoader.searchRelatedContext(userMessage, 10);

        // OpenRouter API 호출 (무료 모델 순차 시도)
        const result = await callOpenRouterAPI(userMessage, relatedContexts);

        hideTypingIndicator();

        // 마크다운 형식의 답변을 HTML로 변환하여 렌더링 (모델명 포함)
        addFormattedMessage(result.text, relatedContexts, result.modelName);

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

    const systemPrompt = `당신은 병원 개원 전문 AI 컨설턴트입니다.

# 참고문서
${contextText ? contextText : '(관련 데이터 없음)'}

# 반드시 지켜야 할 규칙

## 1. 출처 번호는 무조건 [1]부터 시작
- 참고문서에 [1], [2], [3]... 번호가 있음
- 답변에서 출처를 표시할 때 그 번호를 그대로 사용
- 예: "마감재 선택 시 내구성이 중요합니다.[1]"

## 2. 답변 형식
[질문 주제]에 대한 핵심 요약입니다.

### 1. 첫 번째 주제
* **소주제1**: 설명...[1]
* **소주제2**: 설명...[2]

### 2. 두 번째 주제
* **소주제1**: 설명...[3]

## 3. 금지 사항
- [4], [5]부터 시작 금지 → 무조건 [1]부터!
- 참고문서에 없는 내용 금지
- 답변 끝에 참고자료 목록 금지
- **절대로 질문 형태로 답변 금지** (예: "~인가요?", "~입니까?", "~무엇인가요?" 등 질문 형태 사용 금지)
- 모든 내용은 정보 전달 형태로 작성 (예: "~입니다.", "~합니다.", "~해야 합니다.")
- 참고문서의 Q(질문)는 무시하고, A(답변) 내용만 활용하여 정보 형태로 재구성`;


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

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">${html}${modelInfo}</div>
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
