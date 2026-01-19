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
    // 피드백용으로 현재 질문 저장
    window.currentQuestion = userMessage;

    try {
        // RAG 전수조사
        const relatedContexts = await sheetsLoader.searchRelatedContext(userMessage, 10);

        // 관련 데이터가 없으면 플래너 연락 안내
        if (!relatedContexts || relatedContexts.length === 0) {
            hideTypingIndicator();
            addNoDataMessage();
            return;
        }

        // OpenRouter API 호출 (유료 모델 순차 시도)
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

# 가장 중요한 규칙 ⚠️
**참고문서에 "${userQuery}"와 직접적으로 관련된 내용이 없으면, 반드시 다음과 같이만 답변하세요:**
"죄송합니다. 현재 해당 질문에 대한 정보가 준비되어 있지 않습니다."

**절대로 참고문서에 없는 내용을 지어내지 마세요. 할루시네이션은 금지입니다.**

# 답변 규칙 (참고문서에 관련 내용이 있을 때만)

## 1. 출처 번호
- 참고문서의 [1], [2], [3] 번호를 그대로 사용
- 반드시 참고문서에 있는 내용만 인용

## 2. 답변 형식
[질문 주제]에 대한 핵심 요약입니다.

### 1. 첫 번째 주제
* **소주제1**: 설명...[1]

## 3. 절대 금지 사항
- 참고문서에 없는 내용 창작 금지 (할루시네이션 금지!)
- 일반적인 상식이나 외부 지식 사용 금지
- 모르면 "정보가 없습니다"라고 솔직히 답변`;

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
function addNoDataMessage() {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <p>죄송합니다. 현재 해당 질문에 대한 답변을 드리기 어렵습니다.</p>
            <p style="margin-top: 12px;">더 자세한 상담이 필요하시면 <strong>전문 플래너</strong>에게 문의해 주세요.</p>
            <div style="margin-top: 16px;">
                <button onclick="openContactModal()" 
                    style="padding: 12px 24px; background: #536db1; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500;">
                    📞 플래너에게 연락하기
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
