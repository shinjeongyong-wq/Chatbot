/**
 * Chat History Management (Frontend)
 * Supabase 연동으로 사용자 인증 및 채팅 세션 관리
 */

// ============ Supabase Configuration ============
const SUPABASE_URL = 'https://ebigoqusvopbmmutypgd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViaWdvcXVzdm9wYm1tdXR5cGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODA5OTcsImV4cCI6MjA4NTE1Njk5N30.DHXJ3Fgdok01PKkmuhz2IB3ego03M3YWiYtfNObLtKM';

// Supabase 클라이언트 초기화
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ Global State ============
let currentUser = null;         // { id, name, specialty }
let currentSessionId = null;    // 현재 활성 세션 ID
let chatSessions = [];          // 사용자의 모든 채팅 세션 목록

// ============ DOM Elements ============
const loginModal = document.getElementById('loginModal');
const historySidebar = document.getElementById('historySidebar');
const historyList = document.getElementById('historyList');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userSpecialty = document.getElementById('userSpecialty');

// ============ Confirm Modal Helper ============

/**
 * 커스텀 확인 모달 표시
 * @param {Object} options - { icon, title, message, confirmText, cancelText, isDanger }
 * @returns {Promise<boolean>} - 사용자가 확인하면 true, 취소하면 false
 */
function showConfirmModal(options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirmModal');
        const iconEl = document.getElementById('confirmModalIcon');
        const titleEl = document.getElementById('confirmModalTitle');
        const messageEl = document.getElementById('confirmModalMessage');
        const confirmBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        // 옵션 적용
        iconEl.textContent = options.icon || '⚠️';
        titleEl.textContent = options.title || '확인';
        messageEl.textContent = options.message || '정말 진행하시겠습니까?';
        confirmBtn.textContent = options.confirmText || '확인';
        cancelBtn.textContent = options.cancelText || '취소';

        // 위험 스타일 적용
        if (options.isDanger) {
            confirmBtn.classList.add('danger');
        } else {
            confirmBtn.classList.remove('danger');
        }

        // 모달 표시
        modal.classList.add('active');

        // 이벤트 핸들러 (한 번만 실행되도록)
        const handleConfirm = () => {
            modal.classList.remove('active');
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            modal.classList.remove('active');
            cleanup();
            resolve(false);
        };

        const handleBackdrop = (e) => {
            if (e.target === modal) {
                handleCancel();
            }
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            modal.removeEventListener('click', handleBackdrop);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        modal.addEventListener('click', handleBackdrop);
    });
}

// ============ Login Functions ============

/**
 * 로그인 폼에서 진료과 선택
 */
function selectLoginSpecialty(btn) {
    // 기존 선택 해제
    document.querySelectorAll('.specialty-select-btn').forEach(b => b.classList.remove('selected'));
    // 새 선택 적용
    btn.classList.add('selected');
    document.getElementById('loginSpecialty').value = btn.dataset.specialty;

    // 제출 버튼 활성화 확인
    updateLoginButton();
}

/**
 * 로그인 버튼 활성화 상태 업데이트
 */
function updateLoginButton() {
    const name = document.getElementById('loginName').value.trim();
    const specialty = document.getElementById('loginSpecialty').value;
    const submitBtn = document.getElementById('loginSubmitBtn');

    submitBtn.disabled = !(name && specialty);
}

/**
 * 로그인 처리
 */
async function handleLogin(event) {
    event.preventDefault();

    const name = document.getElementById('loginName').value.trim();
    const specialty = document.getElementById('loginSpecialty').value;

    if (!name || !specialty) {
        alert('이름과 진료과를 모두 입력해주세요.');
        return;
    }

    const submitBtn = document.getElementById('loginSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '로그인 중...';

    try {
        // 1. 사용자 조회 또는 생성
        let { data: existingUser, error: selectError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('name', name)
            .eq('specialty', specialty)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            throw selectError;
        }

        if (existingUser) {
            currentUser = existingUser;
            console.log('✅ 기존 사용자 로그인:', currentUser.name);
        } else {
            // 신규 사용자 생성
            const { data: newUser, error: insertError } = await supabaseClient
                .from('users')
                .insert([{ name, specialty }])
                .select()
                .single();

            if (insertError) throw insertError;
            currentUser = newUser;
            console.log('🆕 신규 사용자 등록:', currentUser.name);
        }

        // 2. 로컬 스토리지에 저장
        localStorage.setItem('chatUser', JSON.stringify(currentUser));

        // 3. UI 업데이트
        onLoginSuccess();

    } catch (error) {
        console.error('로그인 에러:', error);
        alert('로그인 중 오류가 발생했습니다. 다시 시도해주세요.');
        submitBtn.disabled = false;
        submitBtn.textContent = '시작하기';
    }
}

/**
 * 로그인 성공 후 UI 업데이트
 */
async function onLoginSuccess() {
    // 로그인 모달 닫기
    loginModal.classList.remove('active');

    // 히스토리 사이드바 표시
    historySidebar.classList.remove('hidden');

    // ★ 모바일이면 사이드바를 body로 이동 + 강제 숨김
    if (window.innerWidth <= 900) {
        // app-container 안에 있으면 body로 이동 (flex layout 참여 방지)
        if (historySidebar.parentElement && historySidebar.parentElement.classList.contains('app-container')) {
            document.body.appendChild(historySidebar);
        }
        historySidebar.style.cssText = 'display:none !important;';
    }

    // 사용자 정보 표시
    userAvatar.textContent = currentUser.name.charAt(0);
    userName.textContent = currentUser.name;
    userSpecialty.textContent = currentUser.specialty;

    // 기존 진료과 선택 기능과 연동 (script.js의 함수)
    if (typeof setUserSpecialty === 'function') {
        setUserSpecialty(currentUser.specialty);
    }

    // 채팅 세션 목록 로드
    await loadChatSessions();
}

/**
 * 로그아웃 처리
 */
async function handleLogout() {
    const confirmed = await showConfirmModal({
        icon: '👋',
        title: '로그아웃',
        message: '정말 로그아웃 하시겠습니까?',
        confirmText: '로그아웃',
        cancelText: '취소',
        isDanger: false
    });

    if (!confirmed) return;

    // 상태 초기화
    currentUser = null;
    currentSessionId = null;
    chatSessions = [];

    // 로컬 스토리지 클리어
    localStorage.removeItem('chatUser');
    localStorage.removeItem('currentSessionId');

    // UI 초기화
    historySidebar.classList.add('hidden');
    loginModal.classList.add('active');

    // 채팅 화면 초기화
    clearChatContainer();

    // 폼 리셋
    document.getElementById('loginForm').reset();
    document.querySelectorAll('.specialty-select-btn').forEach(b => b.classList.remove('selected'));
    document.getElementById('loginSubmitBtn').disabled = true;
    document.getElementById('loginSubmitBtn').textContent = '시작하기';
}

// ============ Chat Session Functions ============

/**
 * 채팅 세션 목록 로드
 */
async function loadChatSessions() {
    if (!currentUser) return;

    try {
        const { data: sessions, error } = await supabaseClient
            .from('chat_sessions')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        chatSessions = sessions || [];
        renderChatSessions();

        // 가장 최근 세션 자동 선택 (있으면)
        if (chatSessions.length > 0) {
            const savedSessionId = localStorage.getItem('currentSessionId');
            const sessionToLoad = savedSessionId
                ? chatSessions.find(s => s.id === savedSessionId) || chatSessions[0]
                : chatSessions[0];
            await selectChatSession(sessionToLoad.id);
        }

    } catch (error) {
        console.error('세션 로드 에러:', error);
    }
}

/**
 * 채팅 세션 목록 렌더링
 */
function renderChatSessions() {
    if (chatSessions.length === 0) {
        historyList.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #0369a1;">
                <p style="font-size: 14px;">대화 기록이 없습니다</p>
                <p style="font-size: 12px; margin-top: 8px;">새 채팅을 시작해보세요!</p>
            </div>
        `;
        return;
    }

    historyList.innerHTML = chatSessions.map(session => {
        // 날짜 포맷팅 (YYYY/MM/DD)
        const date = new Date(session.created_at);
        const formattedDate = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

        return `
        <div class="history-item ${session.id === currentSessionId ? 'active' : ''}" 
             onclick="selectChatSession('${session.id}')"
             data-session-id="${session.id}">
            <svg class="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <div class="history-item-content">
                <span class="history-item-text">${escapeHtml(session.title)}</span>
                <span class="history-item-date">${formattedDate}</span>
            </div>
            <div class="history-item-delete" onclick="event.stopPropagation(); deleteSession('${session.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </div>
        </div>
    `;
    }).join('');
}

/**
 * 채팅 세션 선택
 */
async function selectChatSession(sessionId) {
    currentSessionId = sessionId;
    localStorage.setItem('currentSessionId', sessionId);

    // ★ ChatMemory에 세션 설정 (맥락 분리) ★
    if (window.chatMemory) {
        window.chatMemory.setSession(sessionId);
    }

    // UI 업데이트
    document.querySelectorAll('.history-item').forEach(item => {
        item.classList.toggle('active', item.dataset.sessionId === sessionId);
    });

    // 메시지 로드
    await loadSessionMessages(sessionId);
}

/**
 * 새 채팅 생성
 */
async function createNewChat() {
    if (!currentUser) return;

    try {
        const { data: newSession, error } = await supabaseClient
            .from('chat_sessions')
            .insert([{
                user_id: currentUser.id,
                title: '새로운 채팅'
            }])
            .select()
            .single();

        if (error) throw error;

        // 목록 맨 앞에 추가
        chatSessions.unshift(newSession);

        // 새 세션 선택 (렌더링 전에 먼저 설정해야 active 상태가 적용됨)
        currentSessionId = newSession.id;
        localStorage.setItem('currentSessionId', newSession.id);

        // 사이드바 렌더링 (currentSessionId가 이미 설정된 상태)
        renderChatSessions();

        // 채팅 화면 초기화 및 웰컴 메시지 표시
        clearChatContainer();
        showWelcomeMessage();
        if (typeof showSuggestedQuestions === 'function') showSuggestedQuestions();

        // ★ ChatMemory에 새 세션 설정 (맥락 분리) ★
        if (window.chatMemory) {
            window.chatMemory.setSession(newSession.id);
        }

        console.log('📝 새 채팅 생성:', newSession.id);

    } catch (error) {
        console.error('새 채팅 생성 에러:', error);
        alert('새 채팅을 생성하지 못했습니다.');
    }
}

/**
 * 세션 삭제
 */
async function deleteSession(sessionId) {
    const confirmed = await showConfirmModal({
        icon: '🗑️',
        title: '대화 삭제',
        message: '이 대화를 삭제하시겠습니까?\n삭제된 대화는 복구할 수 없습니다.',
        confirmText: '삭제',
        cancelText: '취소',
        isDanger: true
    });

    if (!confirmed) return;

    try {
        const { error } = await supabaseClient
            .from('chat_sessions')
            .delete()
            .eq('id', sessionId);

        if (error) throw error;

        // 목록에서 제거
        chatSessions = chatSessions.filter(s => s.id !== sessionId);
        renderChatSessions();

        // 현재 세션이 삭제된 경우
        if (currentSessionId === sessionId) {
            currentSessionId = null;
            localStorage.removeItem('currentSessionId');
            clearChatContainer();

            // 다른 세션 선택
            if (chatSessions.length > 0) {
                await selectChatSession(chatSessions[0].id);
            }
        }

        // ★ ChatMemory에서도 해당 세션 삭제 (맥락 정리) ★
        if (window.chatMemory) {
            window.chatMemory.deleteSession(sessionId);
        }

        console.log('🗑️ 세션 삭제:', sessionId);

    } catch (error) {
        console.error('세션 삭제 에러:', error);
        alert('대화를 삭제하지 못했습니다.');
    }
}

/**
 * 세션 제목 업데이트 (첫 질문 기반)
 */
async function updateSessionTitle(sessionId, firstMessage) {
    if (!sessionId || !firstMessage) return;

    // 첫 30자로 제목 생성
    const title = firstMessage.length > 30
        ? firstMessage.substring(0, 30) + '...'
        : firstMessage;

    try {
        const { error } = await supabaseClient
            .from('chat_sessions')
            .update({ title })
            .eq('id', sessionId);

        if (error) throw error;

        // 로컬 목록 업데이트
        const session = chatSessions.find(s => s.id === sessionId);
        if (session) {
            session.title = title;
            renderChatSessions();
        }

    } catch (error) {
        console.error('세션 제목 업데이트 에러:', error);
    }
}

// ============ Message Functions ============

/**
 * 세션의 메시지 로드
 */
async function loadSessionMessages(sessionId) {
    clearChatContainer();

    try {
        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        if (!messages || messages.length === 0) {
            // 메시지가 없으면 웰컴 메시지 표시
            showWelcomeMessage();
            if (typeof showSuggestedQuestions === 'function') showSuggestedQuestions();
            return;
        }

        // ★ chatMemory에 로드된 대화 채우기 (맥락 유지 핵심!) ★
        if (window.chatMemory) {
            // 질문-답변 쌍 추출
            const qaPairs = [];
            let currentQuestion = '';

            messages.forEach(msg => {
                if (msg.role === 'user') {
                    currentQuestion = msg.content;
                } else if (msg.role === 'assistant' && currentQuestion) {
                    qaPairs.push({
                        user: currentQuestion,
                        assistant: msg.content
                    });
                    currentQuestion = '';
                }
            });

            // 최근 3턴만 recentBuffer에, 나머지는 요약으로 처리
            if (qaPairs.length > 0) {
                const recentTurns = qaPairs.slice(-3);  // 최근 3턴
                const olderTurns = qaPairs.slice(0, -3); // 그 이전 턴들

                // recentBuffer 직접 설정
                window.chatMemory.recentBuffer = recentTurns;

                // 이전 대화가 많으면 간단한 요약 생성
                if (olderTurns.length > 0) {
                    const summaryText = olderTurns.map(qa =>
                        `Q: ${qa.user.substring(0, 50)}... → A: ${qa.assistant.substring(0, 100)}...`
                    ).join('\n');
                    window.chatMemory.contextSummary = `[이전 ${olderTurns.length}턴 대화]\n${summaryText}`;
                }

                console.log(`🧠 [ChatMemory] 히스토리에서 ${recentTurns.length}턴 로드됨 (이전 ${olderTurns.length}턴 요약)`);
            }
        }

        // 메시지 렌더링 (질문-답변 쌍으로 맥락 전달)
        let lastUserQuestion = '';
        messages.forEach(msg => {
            if (msg.role === 'user') {
                lastUserQuestion = msg.content;
                addUserMessageToUI(msg.content);
            } else {
                // assistant 메시지는 직전 질문, 맥락 정보, 메시지 타입 함께 전달
                addBotMessageToUI(msg.content, lastUserQuestion, msg.context_prompt || '', msg.message_type || 'normal');
            }
        });

        // 메시지가 있으면 추천 질문 버블 숨기기
        if (typeof hideSuggestedQuestions === 'function') hideSuggestedQuestions();

        scrollToBottom();

    } catch (error) {
        console.error('메시지 로드 에러:', error);
    }
}

/**
 * 메시지 저장
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - 메시지 내용
 * @param {string} contextPrompt - 맥락 정보 (assistant only)
 * @param {string} messageType - 메시지 타입: 'normal', 'no_data', 'out_of_scope', 'off_topic'
 */
async function saveMessage(role, content, contextPrompt = null, messageType = 'normal') {
    if (!currentSessionId) {
        // 세션이 없으면 새로 생성
        await createNewChat();
    }

    try {
        const messageData = {
            session_id: currentSessionId,
            role,
            content
        };

        // assistant 메시지인 경우 맥락 정보와 메시지 타입도 저장
        if (role === 'assistant') {
            if (contextPrompt) {
                messageData.context_prompt = contextPrompt;
            }
            if (messageType && messageType !== 'normal') {
                messageData.message_type = messageType;
            }
        }

        const { data: newMessage, error } = await supabaseClient
            .from('messages')
            .insert([messageData])
            .select()
            .single();

        if (error) throw error;

        // 첫 사용자 메시지면 세션 제목 업데이트
        if (role === 'user') {
            const session = chatSessions.find(s => s.id === currentSessionId);
            if (session && session.title === '새로운 채팅') {
                await updateSessionTitle(currentSessionId, content);
            }
        }

        return newMessage;

    } catch (error) {
        console.error('메시지 저장 에러:', error);
        return null;
    }
}

// ============ UI Helper Functions ============

/**
 * 채팅 컨테이너 초기화
 */
function clearChatContainer() {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.innerHTML = '';
    }
}

/**
 * 웰컴 메시지 표시
 */
function showWelcomeMessage() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    chatContainer.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <svg viewBox="0 0 48 48" fill="none">
                    <circle cx="24" cy="24" r="24" fill="#f0f4ff"/>
                    <path d="M24 14C18.48 14 14 18.48 14 24C14 29.52 18.48 34 24 34C29.52 34 34 29.52 34 24C34 18.48 29.52 14 24 14ZM24 20C25.66 20 27 21.34 27 23C27 24.66 25.66 26 24 26C22.34 26 21 24.66 21 23C21 21.34 22.34 20 24 20ZM24 31.2C21.5 31.2 19.29 29.92 18 28C18.03 26 22 24.9 24 24.9C25.99 24.9 29.97 26 30 28C28.71 29.92 26.5 31.2 24 31.2Z" fill="#536db1"/>
                </svg>
            </div>
            <h2>무엇을 도와드릴까요?</h2>
            <p>AI 컨설턴트가 병원 개원의 모든 것을 답변해 드립니다.<br>우측 상단에서 자주 묻는 질문을 확인하거나, 직접 물어보세요.</p>
        </div>
    `;
}

/**
 * 사용자 메시지 UI에 추가 (저장 없이)
 */
function addUserMessageToUI(content) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;

    // 웰컴 메시지 제거
    const welcomeMsg = chatContainer.querySelector('.welcome-message');
    if (welcomeMsg) welcomeMsg.remove();

    // 추천 질문 숨김
    if (typeof hideSuggestedQuestions === 'function') hideSuggestedQuestions();

    const div = document.createElement('div');
    div.className = 'message user';
    div.innerHTML = `
        <div class="message-avatar">나</div>
        <div class="message-content">${escapeHtml(content)}</div>
    `;
    chatContainer.appendChild(div);
}

/**
 * 봇 메시지 UI에 추가 (저장 없이)
 * 마크다운 → HTML 변환 적용
 * @param {string} content - 메시지 내용
 * @param {string} question - 직전 사용자 질문
 * @param {string} contextPrompt - 맥락 정보
 * @param {string} messageType - 메시지 타입: 'normal', 'no_data', 'out_of_scope', 'off_topic'
 */
function addBotMessageToUI(content, question = '', contextPrompt = '', messageType = 'normal') {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;


    // 0. [RELATED_TOPICS] 블록 추출 및 제거 (파이프 + 불렛 둘 다 지원)
    let relatedTopics = [];
    const topicsMatch = content.match(/\[RELATED_TOPICS\]([\s\S]*?)\[\/RELATED_TOPICS\]/);
    if (topicsMatch) {
        const topicsBlock = topicsMatch[1].trim();
        // 파이프(|)가 있으면 파이프로 분리, 없으면 줄바꿈+불렛으로 분리
        if (topicsBlock.includes('|')) {
            relatedTopics = topicsBlock
                .split('|')
                .map(topic => topic.trim())
                .filter(topic => topic.length > 0);
        } else {
            // 기존 형식: 줄바꿈 + 불렛(-, •, *)
            relatedTopics = topicsBlock
                .split('\n')
                .map(line => line.replace(/^[-•*]\s*/, '').trim())
                .filter(line => line.length > 0);
        }
        // 본문에서 [RELATED_TOPICS] 블록 제거
        content = content.replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/, '').trim();
    }

    // 마크다운 → HTML 변환 (renderMarkdownSafe로 통일)
    let html = renderMarkdownSafe(content);

    // 관련 주제를 클릭 가능한 링크로 변환
    let rtMatchedCount = 0;
    if (relatedTopics.length > 0) {
        relatedTopics.forEach(topic => {
            // **주제** 형태의 굵은 글씨를 클릭 가능한 링크로 변환
            const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`<strong>${escapedTopic}</strong>`, 'gi');
            const clickableLink = `<strong class="clickable-topic" onclick="sendRelatedTopic('${escapeHtml(topic.replace(/'/g, "\\'"))}')">${escapeHtml(topic)}</strong>`;
            const before = html;
            html = html.replace(regex, clickableLink);
            if (html !== before) rtMatchedCount++;
        });

        // ★ 본문에 주제가 없으면 추천 문장 자동 생성 ★
        if (rtMatchedCount === 0 && typeof generateRTFallbackHTML === 'function') {
            html += generateRTFallbackHTML(relatedTopics);
        }
    }

    // ★ 플래너 버튼 추가 (no_data, out_of_scope, planner_connect 타입인 경우) ★
    let plannerButton = '';
    if (messageType === 'no_data' || messageType === 'out_of_scope' || messageType === 'planner_connect') {
        plannerButton = `
            <p style="margin-top: 20px; margin-bottom: 12px; color: #64748b; font-size: 14px;">
                질문하신 내용에 대해 문의 사항이 있으시면 담당 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다.
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
                margin-bottom: 16px;
            ">
                <span style="font-size: 16px;">📞</span> 플래너에게 연결하기
            </button>
        `;
    }


    // 피드백 버튼 + 복사 버튼 추가
    const messageId = Date.now() + Math.random();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
            <button class="feedback-btn copy" onclick="copyMessageToClipboard(${messageId}, this)" title="복사하기"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
        </div>
    `;

    // 메시지 데이터 저장 (복사/피드백용) - ★ 질문 + 답변 + 맥락 모두 저장 ★
    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: question,           // 직전 사용자 질문
        answer: content,              // 전체 답변 (제한 없음)
        contextPrompt: contextPrompt  // 맥락 정보 (요약 + 최근 대화)
    };

    const div = document.createElement('div');
    div.className = 'message bot';
    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">${html}${plannerButton}${feedbackButtons}</div>
    `;
    chatContainer.appendChild(div);
}

/**
 * 스크롤 맨 아래로
 */
function scrollToBottom() {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ Initialization ============

/**
 * 페이지 로드 시 초기화
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Chat History 초기화 시작...');

    // 이름 입력 필드에 이벤트 리스너 추가
    const loginNameInput = document.getElementById('loginName');
    if (loginNameInput) {
        loginNameInput.addEventListener('input', updateLoginButton);
    }

    // 저장된 사용자 정보 확인
    const savedUser = localStorage.getItem('chatUser');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            console.log('✅ 저장된 사용자 복원:', currentUser.name);

            // 로그인 모달 숨기고 바로 진입
            loginModal.classList.remove('active');
            await onLoginSuccess();
        } catch (e) {
            console.error('저장된 사용자 파싱 에러:', e);
            localStorage.removeItem('chatUser');
        }
    }

    console.log('✅ Chat History 초기화 완료');
});

// ============ Export for script.js ============

/**
 * 현재 세션 제목 업데이트 (AI 토픽 기반)
 */
async function updateCurrentSessionTitle(newTitle) {
    if (!currentSessionId || !newTitle) {
        console.warn('⚠️ 세션 ID 또는 새 제목이 없습니다');
        return;
    }

    // 현재 세션의 제목이 이미 변경되었는지 확인 (중복 업데이트 방지)
    const currentSession = chatSessions.find(s => s.id === currentSessionId);
    if (currentSession && currentSession.title !== '새로운 채팅') {
        console.log('ℹ️ 세션 제목이 이미 설정되어 있음:', currentSession.title);
        return;
    }

    try {
        // Supabase 업데이트
        const { error } = await supabaseClient
            .from('chat_sessions')
            .update({ title: newTitle })
            .eq('id', currentSessionId);

        if (error) throw error;

        // 로컬 세션 목록 업데이트
        if (currentSession) {
            currentSession.title = newTitle;
        }

        // UI 업데이트
        renderChatSessions();
        console.log(`✅ 세션 제목 업데이트: ${newTitle}`);
    } catch (error) {
        console.error('세션 제목 업데이트 에러:', error);
    }
}

/**
 * 메시지 내용 검색 (Supabase)
 * @param {string} query - 검색어
 * @returns {Promise<Array>} - 검색 결과 (세션 + 매칭된 메시지)
 */
async function searchMessages(query) {
    if (!currentUser || !query.trim()) return [];

    try {
        // 1. 세션 제목에서 검색
        const titleMatches = chatSessions.filter(session =>
            session.title?.toLowerCase().includes(query.toLowerCase())
        );

        // 현재 사용자의 세션 ID 목록
        const sessionIds = chatSessions.map(s => s.id);
        if (sessionIds.length === 0) {
            return titleMatches.map(s => ({ session: s, matchedMessage: null }));
        }

        // 2. 메시지 내용에서 검색 (Supabase ilike 사용)
        const { data: messageMatches, error } = await supabaseClient
            .from('messages')
            .select('session_id, content, role, created_at')
            .in('session_id', sessionIds)
            .ilike('content', `%${query}%`)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('메시지 검색 에러:', error);
            return titleMatches.map(s => ({ session: s, matchedMessage: null }));
        }

        // 3. 세션별로 그룹화하여 결과 생성
        const resultMap = new Map();

        // 제목 매칭 세션 추가
        titleMatches.forEach(session => {
            resultMap.set(session.id, {
                session,
                matchedMessage: null,
                matchType: 'title'
            });
        });

        // 메시지 매칭 세션 추가 (첫 번째 매칭 메시지만 미리보기로)
        messageMatches.forEach(msg => {
            const session = chatSessions.find(s => s.id === msg.session_id);
            if (session && !resultMap.has(session.id)) {
                resultMap.set(session.id, {
                    session,
                    matchedMessage: msg.content,
                    matchType: 'message'
                });
            } else if (session && resultMap.get(session.id)?.matchType === 'title') {
                // 제목 매칭이었는데 메시지도 있으면 메시지 미리보기 추가
                resultMap.get(session.id).matchedMessage = msg.content;
            }
        });

        // 결과를 배열로 변환하고 최신순 정렬
        const results = Array.from(resultMap.values());
        results.sort((a, b) => new Date(b.session.updated_at || b.session.created_at) - new Date(a.session.updated_at || a.session.created_at));

        console.log(`🔍 검색 결과: ${results.length}개 세션 발견`);
        return results;

    } catch (error) {
        console.error('검색 에러:', error);
        return [];
    }
}

// script.js에서 사용할 함수들을 전역으로 노출
window.chatHistory = {
    saveMessage,
    getCurrentSessionId: () => currentSessionId,
    getCurrentUser: () => currentUser,
    createNewChat,
    updateCurrentSessionTitle,
    getAllSessions: () => chatSessions,
    loadSession: selectChatSession,
    searchMessages
};
