const CONFIG = {
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

// ==========================
// 0. ChatMemory (클라이언트 메모리 관리자)
// ==========================
class ChatMemory {
    constructor() {
        this.recentBuffer = []; // {user:..., assistant:...}
        this.contextSummary = "";
        this.isSummarizing = false;
    }

    // 하위 호환성 (기존 conversationHistory 대체)
    get history() {
        return this.recentBuffer;
    }

    reset() {
        this.recentBuffer = [];
        this.contextSummary = "";
    }

    // Context for AI Input (Summary + Recent)
    getContextPrompt() {
        let prompt = "";
        if (this.contextSummary) {
            prompt += `[이전 대화 요약]:\n${this.contextSummary}\n\n`;
        }
        // 최근 메시지는 최신순이 아니라 시간순(과거->최신)으로 출력
        if (this.recentBuffer.length > 0) {
            prompt += `[최근 대화]:\n${this.recentBuffer.map(h => `Q: ${h.user}\nA: ${h.assistant}`).join('\n')}\n`;
        }
        return prompt || '(첫 대화)';
    }

    async addTurn(userMsg, botMsg) {
        this.recentBuffer.push({ user: userMsg, assistant: botMsg });

        console.log(`🧠 [ChatMemory] 대화 저장 완료 (${this.recentBuffer.length}/3 턴 쌓임)`);

        // 3턴을 초과하면 가장 오래된 턴을 요약본으로 압축 (백그라운드)
        if (this.recentBuffer.length > 3 && !this.isSummarizing) {
            console.log('🚨 [맥락봇] 대화가 3턴을 초과하여 요약을 시작합니다.');
            this.triggerSummaryLoop();
        } else if (this.recentBuffer.length <= 3) {
            console.log(`💡 [맥락봇] 요약까지 ${3 - this.recentBuffer.length + 1}턴 더 필요합니다.`);
        }
    }

    async triggerSummaryLoop() {
        this.isSummarizing = true;
        try {
            while (this.recentBuffer.length > 3) {
                const oldest = this.recentBuffer[0];

                // 요약 대상: 기존 요약 + 가장 오래된 대화
                const contextToSummarize = [];
                if (this.contextSummary) {
                    contextToSummarize.push({ question: "이전 요약", answer: this.contextSummary });
                }
                contextToSummarize.push({ question: oldest.user, answer: oldest.assistant });

                console.log('🧹 [맥락봇] 백그라운드 요약 요청 전송 중...');
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        mode: 'summary',
                        userQuery: "대화 요약 요청", // API 핸들러의 userQuery 필수 체크 통과용
                        contextHistory: contextToSummarize
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.summary) {
                        this.contextSummary = data.summary;
                        this.recentBuffer.shift(); // 성공 시 버퍼에서 제거
                        console.log('✅ [ChatMemory] 요약 완료:', this.contextSummary.substring(0, 30) + '...');
                    } else {
                        break;
                    }
                } else {
                    console.error('Summary API failed');
                    break;
                }
            }
        } catch (e) {
            console.error('Summary Error:', e);
        } finally {
            this.isSummarizing = false;
        }
    }
}

let chatMemory = new ChatMemory(); // 인스턴스 생성
const MAX_HISTORY = 10; // (더 이상 사용되지 않지만 호환성 위해 남김)

// ★ 지능형 중복 배제: 이전 답변에서 언급된 주요 키워드(업체명, 장비명) 추출 ★
function extractMentionedKeywords() {
    const mentioned = new Set();
    const sources = [...chatMemory.recentBuffer];

    // 요약본도 소스에 추가
    if (chatMemory.contextSummary) {
        sources.push({ assistant: chatMemory.contextSummary });
    }

    if (sources.length === 0) return [];

    sources.forEach(h => {
        if (!h.assistant) return;
        const text = h.assistant;

        // 1. 번호/불렛 항목 추출 (예: "1. 삼성의료기", "* 루비레이저", "3. 씨투와이")
        // 숫자로 시작하는 리스트 항목에서 굵은 글씨나 일반 텍스트 추출
        const listItems = text.match(/(?:\d+\.|\*|-)\s+(\*\*|)([가-힣A-Z][가-힣A-Za-z0-9\s\-\/\(\)]{2,35})(?:\*\*|)/g) || [];
        listItems.forEach(item => {
            // 숫자/기호 및 볼드마크 제거
            const cleaned = item.replace(/^(?:\d+\.|\*|-)\s*/g, '').replace(/\*\*/g, '').trim();
            if (cleaned.length >= 2) mentioned.add(cleaned);
        });

        // 2. 괄호 안의 영문 약자 (예: "(ESWT)", "(RF)")
        const acronyms = text.match(/\(([A-Z][A-Za-z0-9\-\/]{1,15})\)/g) || [];
        acronyms.forEach(item => {
            const cleaned = item.replace(/[()]/g, '').trim();
            if (cleaned.length >= 2) mentioned.add(cleaned);
        });

        // 3. 굵은 글씨로 강조된 핵심 단어 (예: "**전자기펄스기**", "**JWC 그룹**")
        const boldItems = text.match(/\*\*([가-힣A-Za-z0-9\s\-\/]{2,30})\*\*/g) || [];
        boldItems.forEach(item => {
            const cleaned = item.replace(/\*\*/g, '').trim();
            // 특정 불용어 포함된 경우 제외
            if (cleaned.length >= 2 && !/규칙|중요|주의|참고|특징|강점/.test(cleaned)) {
                mentioned.add(cleaned);
            }
        });

        // 4. 콜론 앞의 핵심 단어 (예: "체외충격파(ESWT):")
        const colonItems = text.match(/([가-힣A-Za-z][가-힣A-Za-z0-9\s\-\/\(\)]{2,25}):/g) || [];
        colonItems.forEach(item => {
            const cleaned = item.replace(/:/g, '').trim();
            if (cleaned.length >= 2) mentioned.add(cleaned);
        });
    });

    // 일반적인 단어 제외 (노이즈 필터)
    const noiseWords = ['예시', '참고', '안내', '설명', '정보', '내용', '경우', '관련', '추천', '소개', '질문', '답변'];
    const result = Array.from(mentioned).filter(word => !noiseWords.some(noise => word.includes(noise)));

    console.log('🔍 추출된 키워드 (강화된 맥락):', result);
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

    sheetsLoader = new GoogleSheetsLoader();
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
        updateTypingStatus('질문의 의도와 맥락을 분석하고 있습니다...');
        console.log('🧠 Stage 1: Query Planning 시작...');
        let queryPlan = null;
        let relatedContexts = [];

        try {
            const userSpec = getUserSpecialty();
            // ★ 현재까지 언급된 항목들 추출 ★
            const alreadyMentioned = extractMentionedKeywords();

            const planResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: userMessage,
                    mode: 'plan',
                    userSpecialty: userSpec,
                    recentContext: chatMemory.getContextPrompt(),  // 요약 + 최근 대화 전달
                    alreadyMentioned: alreadyMentioned             // 중복 제거용 데이터 추가
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
        updateTypingStatus('데이터베이스에서 최적의 정보를 검색하고 있습니다...');
        console.log('🔍 Stage 2: Smart Search 시작...');

        // 성능 최적화: 검색 결과 한도 하향 조정 (사용자 요청 반영)
        const isPartnerListQuery = queryPlan?.intent === '파트너사목록' || queryPlan?.targetCategory === 'partners';
        const maxResults = isPartnerListQuery ? 10 : 30;

        if (queryPlan) {
            // Query Plan 기반 스마트 검색 (사용자 진료과 정보 전달)
            const userSpec = getUserSpecialty();
            relatedContexts = await sheetsLoader.smartSearch(queryPlan, maxResults, userSpec);
        } else {
            // Fallback: 기존 키워드 검색
            relatedContexts = await sheetsLoader.searchRelatedContext(userMessage, maxResults);
        }

        console.log(`📚 검색 결과: ${relatedContexts.length}개 문서`);

        // ========== Stage 3: Answer Generation ==========
        updateTypingStatus('찾은 정보를 바탕으로 답변을 작성하고 있습니다...');
        console.log('💬 Stage 3: 답변 생성 시작...');
        const result = await callOpenRouterAPI(userMessage, relatedContexts);

        hideTypingIndicator();

        // AI 응답 태그 감지
        let responseText = result.text;

        if (result.text.includes('[OFF_TOPIC]')) {
            let cleanText = result.text.replace('[OFF_TOPIC]', '').trim();
            // Rambling 방지: [번호] 인용이 포함되어 있다면 제거 (Off-topic엔 불필요)
            cleanText = cleanText.replace(/\[\d+\]/g, '').trim();
            addOffTopicMessage(cleanText);
            responseText = cleanText;
        } else if (result.text.includes('[NO_DATA]')) {
            let cleanText = result.text.replace('[NO_DATA]', '').trim();
            // 인용 번호 제거
            cleanText = cleanText.replace(/\[\d+\]/g, '').trim();

            console.log('[DEBUG] addNoDataMessage 호출 직전, 데이터 전달함');
            addNoDataMessage(cleanText);
            responseText = cleanText;
        } else {
            // 필터링된 컨텍스트를 사용하여 포매팅 (중요: 답변의 [번호]와 일치시키기 위함)
            addFormattedMessage(result.text, result.filteredContexts || relatedContexts, result.modelName);
        }

        // 대화 히스토리에 저장 (맥락 유지 + 요약 자동 트리거)
        // 대화 히스토리에 저장 (맥락 유지 + 요약 자동 트리거)
        // 텍스트를 자르지 않고 저장하여 나중에 키워드 추출 시 누락이 없도록 함
        chatMemory.addTurn(userMessage, responseText);

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

    let filteredContexts = []; // 선언 이동 및 스코프 확장
    if (contexts && contexts.length > 0) {
        // ★ 동적 임계값 적용: 1위 문서 대비 30% 미만 스코어는 제외 ★
        const topScore = contexts[0]?.score || 1;
        const threshold = topScore * 0.3;
        filteredContexts = contexts.filter(c => c.score >= threshold);

        console.log(`📊 스코어 필터링: ${contexts.length}개 → ${filteredContexts.length}개 (임계값: ${threshold.toFixed(2)})`);

        // ★ 스코어 기반 3단계 계층화 ★
        const highRelevance = filteredContexts.filter(c => c.score > 2.0);
        const mediumRelevance = filteredContexts.filter(c => c.score > 0.5 && c.score <= 2.0);
        const lowRelevance = filteredContexts.filter(c => c.score <= 0.5);

        console.log(`   🔥 핵심 문서: ${highRelevance.length}개`);
        console.log(`   📄 보조 문서: ${mediumRelevance.length}개`);
        console.log(`   📋 참고 문서: ${lowRelevance.length}개`);

        // 문서 포맷팅 함수
        const formatDoc = (item, idx, showScore = false) => {
            let prefix = `[${idx + 1}]`;

            // 스코어 표시 (디버깅용, 선택적)
            if (showScore && item.score) {
                prefix += ` (관련도: ${item.score.toFixed(2)})`;
            }

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
        };

        // 계층별로 문서 구성
        let docIndex = 0;
        const sections = [];

        if (highRelevance.length > 0) {
            sections.push('## 🔥 핵심 문서 (최우선 참조)');
            sections.push(highRelevance.map(item => formatDoc(item, docIndex++)).join('\n\n'));
        }

        if (mediumRelevance.length > 0) {
            sections.push('\n## 📄 보조 문서 (필요시 참조)');
            sections.push(mediumRelevance.map(item => formatDoc(item, docIndex++)).join('\n\n'));
        }

        if (lowRelevance.length > 0) {
            sections.push('\n## 📋 참고 문서 (관련성 낮음, 신중히 사용)');
            sections.push(lowRelevance.map(item => formatDoc(item, docIndex++)).join('\n\n'));
        }

        contextText = sections.join('\n');
    }

    // 대화 히스토리 구성 (ChatMemory 활용)
    let historyText = chatMemory.getContextPrompt();

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
1. **[중복 답변 금지]**: 이미 **# ⛔ 중복 금지** 섹션에 있는 업체나 정보가 **# 참고문서**에 또 나오더라도, 이를 제외하고 **새로운 데이터 위주로** 답변하세요.
2. **[주제 일관성 유지]**: 현재 대화의 주제(예: 인테리어)를 중심으로 답변하세요. 참고문서에 다른 주제가 섞여 있다면 사용자의 질문 의도에 부합하는 내용만 골라내어 자연스럽게 답변하세요. 만약 요청하신 주제에 대한 새로운 정보가 정말 없다면, 억지로 다른 주제를 꺼내기보다는 현재까지 안내해 드린 내용을 정리하거나 추가 확인이 필요함을 정직하게 전달하세요.
3. 참고문서 내용 기반으로만 답변 (할루시네이션 금지)
4. 병원 개원과 무관한 질문 → "[OFF_TOPIC]죄송합니다. 해당 질문에 대해서는 답변을 드리기 어렵습니다."
   - **중요**: [OFF_TOPIC] 사용 시 다른 긴 설명이나 인용을 절대 포함하지 마세요.
5. 사용자가 요청한 **구체적인 정보(예: 금액, 수치, 리스트 등)**가 참고문서에 없거나 부족한 경우 → '[NO_DATA]' 태그와 함께 **아래 형식을 정확히** 따르세요:
   - **형식**: (1) 감사/사과 문단 → (빈 줄) → (2) "원하시면, 아래 내용들을 더 자세히 알려드릴 수 있습니다" → (빈 줄) → (3) 불렛 리스트 → (빈 줄) → (4) 아래의 고정 안내 문구
   - **고정 안내 문구**: "질문하신 내용에 대해 문의 사항 있으시면 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다."
   - **규칙**:
     - 인용 번호([1], [2] 등) 및 상투적인 맺음말("성공적인 개원~")을 절대 사용하지 마세요.
     - 리스트 항목(* 키워드)과 고정 안내 문구 사이에는 반드시 빈 줄을 하나 넣으세요.
     - 불렛 기호(*) 뒤에는 반드시 공백 한 칸을 두세요. 
     - 답변 본문에 "플래너에게 직접 문의하세요" 같은 다른 변형 문구는 쓰지 말고 위의 고정 안내 문구만 쓰세요. 시스템이 버튼을 별도로 추가합니다.

# 출처 인용 규칙 (매우 중요!)
1. **🔥 핵심 문서를 최우선으로 사용**하세요.
2. **📄 보조 문서는 핵심 문서를 보완할 때만** 사용하세요.
3. **인용 최소화 (Clean UI)**: 동일한 출처에서 가져온 내용이 연속될 경우, 문장마다 '[번호]'를 붙이지 마세요. 대신 **해당 단락(Paragraph)이나 리스트 항목의 가장 끝에 한 번만** 표시하세요.
4. **번호 중복 금지**: 한 단락 내에서 같은 번호가 3회 이상 반복되어 가독성을 해치지 않도록 하세요. 
5. **하단 요약 금지 (CRITICAL)**: 답변 가장 아랫부분에 별도로 '참고문서' 리스트를 만들거나 인용 번호를 모아서 나열하지 마세요. 주석은 본문 안에만 존재해야 합니다.

# 답변 형식
- **가독성 최우선**: 각 리스트 항목(1. 2. 3...) 사이와 주요 섹션 사이에는 반드시 **빈 줄(Double Line Break)**을 추가하여 답변이 빽빽해 보이지 않게 하세요.
- **볼드체 활용**: 업체명, 평당가, 주요 특징 등 핵심 정보는 **볼드체**를 사용하여 시인성을 높이세요.
- 줄바꿈을 적절히 사용하여 하나의 텍스트 덩어리가 너무 크지 않게 조절하세요.
- 정중하고 전문적인 말투 (~요, ~습니다)
- 자연스러운 맺음말로 답변을 마무리하고, 그 뒤에 어떠한 참고문서 목록도 덧붙이지 마세요.`;


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

        return {
            text: data.text,
            modelName: data.modelName,
            filteredContexts: filteredContexts
        };

    } catch (error) {
        console.error('AI 호출 에러:', error);
        return { text: '서버 연결에 실패했습니다.', modelName: null };
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

    // 1. 주석 파싱 및 재정렬 (복수 인용 [1, 2, 3] 및 오름차순 지원)
    let processedText = text;
    const complexCitationRegex = /\[([\d,\s]+)\]/g;
    const foundCitations = []; // 원본 번호 리스트 (등장 순서대로)
    let match;

    // 텍스트 전체를 스캔하여 언급된 모든 원본 번호를 등장 순서대로 수집
    while ((match = complexCitationRegex.exec(text)) !== null) {
        const nums = match[1].split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n));

        nums.forEach(num => {
            if (!foundCitations.includes(num)) {
                foundCitations.push(num);
            }
        });
    }

    // 원본 번호 -> 새 번호 매핑 (1, 2, 3...)
    const citationMap = {};
    foundCitations.forEach((origNum, idx) => {
        citationMap[origNum] = idx + 1;
    });

    // 텍스트 본문의 [1, 2] -> [1][2] 형태로 변환하며 번호 재할당 및 오름차순 정렬
    processedText = text.replace(complexCitationRegex, (match, content) => {
        const nums = content.split(',')
            .map(n => parseInt(n.trim()))
            .filter(n => !isNaN(n))
            .map(n => ({ original: n, new: citationMap[n] }))
            .filter(n => n.new); // 매핑된 것만 유지

        if (nums.length === 0) return match;

        // 새 번호 기준으로 오름차순 정렬 (사용자 요청 반영)
        nums.sort((a, b) => a.new - b.new);

        // [1][2][3] 형식으로 변환
        return nums.map(n => `[${n.new}]`).join('');
    });

    // 컨텍스트 배열을 등장 순서대로 재배치
    const reorderedContexts = foundCitations.map(origNum => {
        return contexts[origNum - 1]; // 0-indexed
    }).filter(ctx => ctx);

    // 2. 마크다운 → HTML 변환 (processedText 기반)
    let html = processedText
        .replace(/```[\s\S]*?```/g, '')
        .replace(/^### (.+)$/gm, '<h4 class="response-heading">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="response-heading">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^---[\s\S]*$/gm, '')
        .replace(/\n/g, '<br>');

    html = html.replace(/(<li>.*?<\/li>)(<br>)?/g, '$1');
    html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="response-list">$1</ul>');
    html = html.replace(/<\/ul><br>?<ul class="response-list">/g, '');

    // 3. [1], [2] 주석을 툴팁 HTML로 최종 변환
    // 번호가 큰 것부터 치환하여 중복 매칭 방지 (예: [10]과 [1])
    const sortedNewNums = Object.values(citationMap).sort((a, b) => b - a);

    sortedNewNums.forEach(num => {
        const ctx = reorderedContexts[num - 1];
        if (!ctx) return;

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
        <span id="typingStatus" style="color:#64748b; font-size:13px; margin-left:8px;">준비 중...</span>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
}

function updateTypingStatus(message) {
    const statusEl = document.getElementById('typingStatus');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

function hideTypingIndicator() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// OFF_TOPIC 응답 렌더링
function addOffTopicMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <p style="color: #64748b;">${text}</p>
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
}

// NO_DATA 응답 렌더링 (볼드체, 불렛 포인트 지원 + 플래너 연락 버튼)
function addNoDataMessage(text) {
    console.log('[DEBUG] addNoDataMessage 호출됨, 원본 텍스트:', text);

    const div = document.createElement('div');
    div.className = 'message bot';

    // 1. 인용 번호 제거
    let cleanedText = text.replace(/\[\d+\]/g, '').trim();
    console.log('[DEBUG] 인용 번호 제거 후:', cleanedText);

    // 2. 줄 단위로 분리 (다양한 줄바꿈 형식 지원)
    const lines = cleanedText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    console.log('[DEBUG] 줄 분리 결과:', lines);

    // 3. 맺음말 제거 로직
    const filteredLines = [];
    let listStarted = false;

    for (const line of lines) {
        // 불렛 포인트 감지: * 또는 - 또는 ● 로 시작 (공백 유무 무관)
        const isBullet = /^[\*\-●]\s*.+/.test(line);

        if (isBullet) {
            listStarted = true;
            filteredLines.push(line);
        } else if (listStarted && !isBullet) {
            // 리스트가 시작된 후 일반 텍스트가 나오면 맺음말로 간주하고 중단
            if (line.includes('성공') || line.includes('언제든') || line.includes('도움')) {
                break; // 맺음말 이후 무시
            }
            filteredLines.push(line);
        } else {
            filteredLines.push(line);
        }
    }

    console.log('[DEBUG] 필터링 후:', filteredLines);

    // 4. 마크다운 → HTML 변환
    let htmlParts = [];
    let inList = false;
    let listItems = [];

    for (const line of filteredLines) {
        // 불렛 포인트 체크 (앞뒤 공백 무시하고 *, -, ● 로 시작하는 행)
        const bulletMatch = line.trim().match(/^[\*\-●]\s*(.+)$/);

        if (bulletMatch) {
            if (!inList) {
                inList = true;
                listItems = [];
            }
            // 불렛 내용에서 볼드체 변환
            let content = bulletMatch[1].replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            listItems.push(`<li style="margin-bottom: 8px; line-height: 1.6;">${content}</li>`);
        } else {
            // 불렛이 아닌 경우
            if (inList && listItems.length > 0) {
                // 이전 리스트 마감
                htmlParts.push(`<ul style="margin: 16px 0; padding-left: 48px; list-style-type: disc;">${listItems.join('')}</ul>`);
                listItems = [];
                inList = false;
            }
            // 일반 텍스트도 볼드체 변환
            let content = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
            htmlParts.push(`<p style="margin-bottom: 12px;">${content}</p>`);
        }
    }

    // 마지막 리스트 마감
    if (inList && listItems.length > 0) {
        htmlParts.push(`<ul style="margin: 16px 0; padding-left: 48px; list-style-type: disc;">${listItems.join('')}</ul>`);
    }

    const html = htmlParts.join('');
    console.log('[DEBUG] 최종 HTML:', html);

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <div class="no-data-text" style="line-height: 1.7;">${html}</div>
            <p style="margin: 20px 0 16px 0; color: #64748b; font-size: 14px;">
                질문하신 내용에 대해 문의 사항 있으시면 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다.
            </p>
            <button class="contact-planner-btn" onclick="openContactModal()" style="
                background-color: #536db1;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                transition: background 0.2s;
            ">
                <span style="font-size: 16px;">☎️</span> 플래너에게 연락하기
            </button>
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToBottom();
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

    // AI가 보내온 텍스트에서 줄바꿈 처리
    const formattedText = text.replace(/\n/g, '<br>');

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <div class="no-data-body">
                ${formattedText}
            </div>
            <div style="margin-top: 20px; padding-top: 16px; border-top: 1px dashed #e2e8f0;">
                <button onclick="openContactModal()" 
                    style="padding: 12px 24px; background: #536db1; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s; display: inline-flex; align-items: center; gap: 8px;">
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
        chatMemory.reset();
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
