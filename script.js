// ============================================================
// ★ 비밀 피드백 대시보드 (로고 5회 클릭 이스터에그)
// ============================================================
(function () {
    let _fbClickCount = 0;
    let _fbClickTimer = null;
    let _fbAllData = [];

    // 페이지 로드 후 로고에 이벤트 연결
    document.addEventListener('DOMContentLoaded', function () {
        const logoText = document.querySelector('.logo-text');
        if (!logoText) return;

        logoText.style.cursor = 'default'; // 클릭 커서 안 보이게
        logoText.addEventListener('click', function () {
            _fbClickCount++;
            clearTimeout(_fbClickTimer);
            _fbClickTimer = setTimeout(function () { _fbClickCount = 0; }, 2000);

            if (_fbClickCount >= 5) {
                _fbClickCount = 0;
                openFeedbackDashboard();
            }
        });
    });

    // 대시보드 열기
    window.openFeedbackDashboard = function () {
        var dash = document.getElementById('feedbackDashboard');
        var appContainer = document.querySelector('.app-container');
        if (!dash) return;

        dash.style.display = 'block';
        if (appContainer) appContainer.style.display = 'none';
        document.body.style.overflow = 'hidden';
        loadFeedbackData();
    };

    // 대시보드 닫기
    window.closeFeedbackDashboard = function () {
        var dash = document.getElementById('feedbackDashboard');
        var appContainer = document.querySelector('.app-container');
        if (!dash) return;

        dash.style.display = 'none';
        if (appContainer) appContainer.style.display = '';
        document.body.style.overflow = '';
    };

    // Supabase에서 피드백 조회
    window.loadFeedbackData = async function () {
        var tbody = document.getElementById('fbTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">⏳ 불러오는 중...</td></tr>';

        try {
            // chat-history.js의 supabaseClient 재사용
            if (typeof supabaseClient === 'undefined') {
                throw new Error('Supabase 클라이언트 없음');
            }

            var result = await supabaseClient
                .from('feedback')
                .select('*')
                .order('created_at', { ascending: false });

            if (result.error) throw result.error;

            _fbAllData = result.data || [];
            renderFeedbackSummary(_fbAllData);
            renderFeedbackTable(_fbAllData);

        } catch (err) {
            console.error('피드백 로드 오류:', err);
            if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#f87171;">❌ 데이터 로드 실패: ' + err.message + '</td></tr>';
        }
    };

    // 요약 카드 렌더링
    function renderFeedbackSummary(data) {
        var total = data.length;
        var good = data.filter(function (d) { return d.type === 'Good'; }).length;
        var bad = data.filter(function (d) { return d.type === 'Bad'; }).length;
        var rate = total > 0 ? Math.round((good / total) * 100) : 0;

        var el = document.getElementById('fbTotalCount');
        if (el) el.textContent = total;
        el = document.getElementById('fbGoodCount');
        if (el) el.textContent = good;
        el = document.getElementById('fbBadCount');
        if (el) el.textContent = bad;
        el = document.getElementById('fbGoodRate');
        if (el) el.textContent = rate + '%';
    }

    // 테이블 렌더링
    function renderFeedbackTable(data) {
        var tbody = document.getElementById('fbTableBody');
        if (!tbody) return;

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#94a3b8;">피드백이 없습니다</td></tr>';
            return;
        }

        var html = '';
        data.forEach(function (item) {
            var date = item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';
            var typeClass = item.type === 'Good' ? 'fb-type-good' : 'fb-type-bad';
            var typeIcon = item.type === 'Good' ? '👍' : '👎';
            var question = escFb(item.question || '-');
            var answer = escFb(item.answer || '-');
            var content = escFb(item.content || '-');
            var userName = escFb(item.user_name || '-');
            var specialty = escFb(item.specialty || '-');

            html += '<tr>';
            html += '<td style="white-space:nowrap;">' + date + '</td>';
            html += '<td>' + userName + '</td>';
            html += '<td>' + specialty + '</td>';
            html += '<td><span class="' + typeClass + '">' + typeIcon + ' ' + item.type + '</span></td>';
            html += '<td class="fb-cell-expandable" onclick="this.classList.toggle(\'expanded\')"><div class="fb-cell-short">' + question + '</div>' + (question.length > 50 ? '<div class="fb-expand-hint">클릭하여 더보기</div>' : '') + '</td>';
            html += '<td class="fb-cell-expandable" onclick="this.classList.toggle(\'expanded\')"><div class="fb-cell-short">' + answer + '</div>' + (answer.length > 50 ? '<div class="fb-expand-hint">클릭하여 더보기</div>' : '') + '</td>';
            html += '<td class="fb-cell-expandable" onclick="this.classList.toggle(\'expanded\')"><div class="fb-cell-short">' + content + '</div>' + (content.length > 30 ? '<div class="fb-expand-hint">클릭하여 더보기</div>' : '') + '</td>';
            html += '</tr>';
        });

        tbody.innerHTML = html;
    }

    // HTML 이스케이프
    function escFb(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }

    // 필터
    window.filterFeedback = function (type) {
        // 버튼 활성화 토글
        document.querySelectorAll('.fb-filter-btn').forEach(function (btn) {
            btn.classList.remove('active');
            if (btn.getAttribute('data-filter') === type) btn.classList.add('active');
        });

        if (type === 'all') {
            renderFeedbackTable(_fbAllData);
        } else {
            var filtered = _fbAllData.filter(function (d) { return d.type === type; });
            renderFeedbackTable(filtered);
        }
    };

    // ============================================================
    // ★ 탭 전환
    // ============================================================
    var _currentDashTab = 'feedback';

    window.switchDashTab = function (tabName) {
        _currentDashTab = tabName;

        // 탭 버튼 활성화
        document.querySelectorAll('.fb-tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
        });

        // 탭 콘텐츠 전환
        document.getElementById('tabFeedback').style.display = tabName === 'feedback' ? 'block' : 'none';
        document.getElementById('tabAnalytics').style.display = tabName === 'analytics' ? 'block' : 'none';

        // 사용 통계 탭 최초 진입 시 데이터 로드
        if (tabName === 'analytics') {
            loadAnalyticsData();
        }
    };

    // 새로고침 버튼
    window.refreshCurrentTab = function () {
        if (_currentDashTab === 'feedback') {
            window.loadFeedbackData();
        } else {
            loadAnalyticsData();
        }
    };

    // ============================================================
    // ★ 사용 통계 로드
    // ============================================================
    async function loadAnalyticsData() {
        try {
            if (typeof supabaseClient === 'undefined') {
                throw new Error('Supabase 클라이언트 없음');
            }

            // 1. 기본 통계 (유저, 세션, 메시지)
            var usersResult = await supabaseClient.from('users').select('id', { count: 'exact', head: true });
            var sessionsResult = await supabaseClient.from('chat_sessions').select('id', { count: 'exact', head: true });
            var messagesResult = await supabaseClient.from('messages').select('id', { count: 'exact', head: true });

            var totalUsers = usersResult.count || 0;
            var totalSessions = sessionsResult.count || 0;
            var totalMessages = messagesResult.count || 0;
            var avgPerSession = totalSessions > 0 ? (totalMessages / totalSessions).toFixed(1) : '0';

            var el;
            el = document.getElementById('statUsers'); if (el) el.textContent = totalUsers;
            el = document.getElementById('statSessions'); if (el) el.textContent = totalSessions;
            el = document.getElementById('statMessages'); if (el) el.textContent = totalMessages;
            el = document.getElementById('statAvgPerSession'); if (el) el.textContent = avgPerSession;

            // 2. daily_analytics에서 최신 분석 결과 가져오기
            var analyticsResult = await supabaseClient
                .from('daily_analytics')
                .select('*')
                .order('date', { ascending: false })
                .limit(1);

            if (analyticsResult.data && analyticsResult.data.length > 0) {
                var latest = analyticsResult.data[0];
                renderKeywordsChart(latest.popular_keywords || []);
                renderFaqList(latest.frequent_questions || []);

                var dateEl = document.getElementById('analyticsDate');
                if (dateEl) dateEl.textContent = '마지막 분석: ' + latest.date;
            } else {
                document.getElementById('keywordsChart').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">아직 분석 데이터가 없습니다.<br>첫 분석을 실행해주세요.</div>';
                document.getElementById('faqList').innerHTML = '<div style="text-align:center;padding:40px;color:#94a3b8;">아직 분석 데이터가 없습니다.</div>';
            }

            // 3. 최근 유저 질문 (최신 30개)
            var recentResult = await supabaseClient
                .from('messages')
                .select('content, created_at')
                .eq('role', 'user')
                .order('created_at', { ascending: false })
                .limit(30);

            renderRecentQuestions(recentResult.data || []);

        } catch (err) {
            console.error('사용 통계 로드 오류:', err);
        }
    }
    // ============================================================
    // ★ 수동 분석 실행 (Vercel Hobby에서 Cron 대체)
    // ============================================================
    window.runManualAnalysis = async function () {
        var btn = document.getElementById('btnRunAnalysis');
        var status = document.getElementById('analysisStatus');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ 분석 중...'; }
        if (status) status.textContent = 'Gemini로 질문 분석 중... (30초~1분 소요)';

        try {
            var response = await fetch('/api/analyze-questions', { method: 'GET' });
            var result = await response.json();

            if (result.success) {
                if (status) status.textContent = '✅ 분석 완료! (' + result.total_questions + '개 질문, ' + result.popular_keywords_count + '개 키워드)';
                // 분석 완료 후 대시보드 데이터 새로고침
                await loadAnalyticsData();
            } else {
                if (status) status.textContent = '❌ 분석 실패: ' + (result.error || '알 수 없는 오류');
            }
        } catch (err) {
            console.error('수동 분석 오류:', err);
            if (status) status.textContent = '❌ 오류: ' + err.message;
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 분석 실행'; }
        }
    };

    // ============================================================
    // ★ 인기 키워드 바 차트 렌더링
    // ============================================================
    function renderKeywordsChart(keywords) {
        var container = document.getElementById('keywordsChart');
        if (!container || !keywords.length) return;

        var maxCount = keywords[0].count || 1;
        var html = '';

        keywords.forEach(function (item, i) {
            var pct = Math.round((item.count / maxCount) * 100);
            var hue = 210 + (i * 12); // 파란 계열 그라데이션
            html += '<div class="kw-bar-row">';
            html += '<span class="kw-bar-label">' + escFb(item.keyword) + '</span>';
            html += '<div class="kw-bar-track">';
            html += '<div class="kw-bar-fill" style="width:' + pct + '%;background:hsl(' + hue + ',70%,55%);"></div>';
            html += '</div>';
            html += '<span class="kw-bar-count">' + item.count + '건</span>';
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ============================================================
    // ★ 자주 묻는 질문 리스트 렌더링
    // ============================================================
    function renderFaqList(questions) {
        var container = document.getElementById('faqList');
        if (!container || !questions.length) return;

        var html = '';
        questions.forEach(function (item, i) {
            html += '<div class="faq-item">';
            html += '<div class="faq-item-header">';
            html += '<span class="faq-rank">' + (i + 1) + '</span>';
            html += '<span class="faq-topic">' + escFb(item.topic || item.representative || '') + '</span>';
            html += '<span class="faq-count">' + (item.count || 0) + '건</span>';
            html += '</div>';
            if (item.examples && item.examples.length > 0) {
                html += '<div class="faq-examples">';
                item.examples.forEach(function (ex) {
                    html += '<div class="faq-example">"' + escFb(ex) + '"</div>';
                });
                html += '</div>';
            }
            html += '</div>';
        });

        container.innerHTML = html;
    }

    // ============================================================
    // ★ 최근 유저 질문 렌더링
    // ============================================================
    function renderRecentQuestions(messages) {
        var tbody = document.getElementById('recentQuestionsBody');
        if (!tbody) return;

        if (!messages.length) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center;padding:40px;color:#94a3b8;">질문이 없습니다</td></tr>';
            return;
        }

        var html = '';
        messages.forEach(function (msg) {
            var date = msg.created_at ? new Date(msg.created_at).toLocaleString('ko-KR', {
                month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            }) : '-';
            html += '<tr>';
            html += '<td style="white-space:nowrap;width:120px;">' + date + '</td>';
            html += '<td>' + escFb(msg.content || '-') + '</td>';
            html += '</tr>';
        });

        tbody.innerHTML = html;
    }
})();

const CONFIG = {
    USE_MOCK_DATA: false,

    // API 엔드포인트 (Vercel Serverless Function)
    CHAT_ENDPOINT: '/api/chat'
};

// ★ [v6.5.2] 기존 anchorTopics 로직 주석 처리 — 신규 RT 시스템으로 대체 ★
// let anchorTopics = [];
//
// async function loadAnchorTopics() {
//     try {
//         const response = await fetch('/data/topics_shortened.json');
//         if (response.ok) {
//             const data = await response.json();
//             anchorTopics = data.map(item => ({
//                 id: item.id,
//                 question: item.shortened || '',
//                 category: '',
//                 subCategory: ''
//             }));
//             console.log(`✅ 앵커 주제 ${anchorTopics.length}개 로드 완료 (축약됨)`);
//         }
//     } catch (error) {
//         console.error('앵커 주제 로드 실패:', error);
//     }
// }
//
// loadAnchorTopics();


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
let currentAbortController = null; // AI 답변 중단 제어용

// ==========================
// 0. ChatMemory (클라이언트 메모리 관리자) - 세션별 분리
// ==========================
class ChatMemory {
    constructor() {
        this.sessionMemories = {};  // { sessionId: { recentBuffer, contextSummary, isSummarizing } }
        this.currentSessionId = null;
    }

    // 세션 설정 (전환 시 호출)
    setSession(sessionId) {
        this.currentSessionId = sessionId;

        // 해당 세션의 메모리가 없으면 새로 생성
        if (!this.sessionMemories[sessionId]) {
            this.sessionMemories[sessionId] = {
                recentBuffer: [],
                contextSummary: '',
                isSummarizing: false,
                usedTopics: []  // ★ 사용자가 질문한 RT 기록 ★
            };
            console.log(`🧠 [ChatMemory] 새 세션 메모리 생성: ${sessionId.substring(0, 8)}...`);
        } else {
            console.log(`🧠 [ChatMemory] 세션 전환: ${sessionId.substring(0, 8)}... (기존 대화 ${this.sessionMemories[sessionId].recentBuffer.length}턴 복원)`);
        }
    }

    // 현재 세션의 메모리 getter
    get currentMemory() {
        if (!this.currentSessionId || !this.sessionMemories[this.currentSessionId]) {
            return { recentBuffer: [], contextSummary: '', isSummarizing: false, usedTopics: [] };
        }
        return this.sessionMemories[this.currentSessionId];
    }

    // ★ 사용자가 질문한 RT 추적 ★
    get usedTopics() { return this.currentMemory.usedTopics || []; }

    addUsedTopic(topicQuestion) {
        if (this.currentSessionId && this.sessionMemories[this.currentSessionId]) {
            if (!this.sessionMemories[this.currentSessionId].usedTopics) {
                this.sessionMemories[this.currentSessionId].usedTopics = [];
            }
            // 중복 방지
            if (!this.sessionMemories[this.currentSessionId].usedTopics.includes(topicQuestion)) {
                this.sessionMemories[this.currentSessionId].usedTopics.push(topicQuestion);
                console.log(`🧠 [ChatMemory] RT 사용 기록: "${topicQuestion.substring(0, 30)}..."`);
            }
        }
    }

    // 기존 API 호환 (recentBuffer, contextSummary, isSummarizing)
    get recentBuffer() { return this.currentMemory.recentBuffer; }
    set recentBuffer(val) {
        if (this.currentSessionId && this.sessionMemories[this.currentSessionId]) {
            this.sessionMemories[this.currentSessionId].recentBuffer = val;
        }
    }

    get contextSummary() { return this.currentMemory.contextSummary; }
    set contextSummary(val) {
        if (this.currentSessionId && this.sessionMemories[this.currentSessionId]) {
            this.sessionMemories[this.currentSessionId].contextSummary = val;
        }
    }

    get isSummarizing() { return this.currentMemory.isSummarizing; }
    set isSummarizing(val) {
        if (this.currentSessionId && this.sessionMemories[this.currentSessionId]) {
            this.sessionMemories[this.currentSessionId].isSummarizing = val;
        }
    }

    // 하위 호환성 (기존 conversationHistory 대체)
    get history() {
        return this.recentBuffer;
    }

    // 현재 세션만 초기화
    reset() {
        if (this.currentSessionId && this.sessionMemories[this.currentSessionId]) {
            this.sessionMemories[this.currentSessionId] = {
                recentBuffer: [],
                contextSummary: '',
                isSummarizing: false,
                usedTopics: []  // ★ RT 추적도 초기화 ★
            };
            console.log(`🧠 [ChatMemory] 세션 초기화: ${this.currentSessionId.substring(0, 8)}...`);
        }
    }

    // 특정 세션 삭제 (채팅 삭제 시)
    deleteSession(sessionId) {
        if (this.sessionMemories[sessionId]) {
            delete this.sessionMemories[sessionId];
            console.log(`🧠 [ChatMemory] 세션 삭제: ${sessionId.substring(0, 8)}...`);
        }
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
        if (!this.currentSessionId) {
            console.warn('⚠️ [ChatMemory] 세션이 설정되지 않음. 대화 저장 스킵.');
            return;
        }

        this.recentBuffer.push({ user: userMsg, assistant: botMsg });

        console.log(`🧠 [ChatMemory] 대화 저장 완료 (${this.recentBuffer.length}/3 턴 쌓임, 세션: ${this.currentSessionId.substring(0, 8)}...)`);

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
        const sessionId = this.currentSessionId; // 루프 중 세션 변경 방지

        try {
            while (this.sessionMemories[sessionId]?.recentBuffer.length > 3) {
                const oldest = this.sessionMemories[sessionId].recentBuffer[0];

                // 요약 대상: 기존 요약 + 가장 오래된 대화
                const contextToSummarize = [];
                if (this.sessionMemories[sessionId].contextSummary) {
                    contextToSummarize.push({ question: "이전 요약", answer: this.sessionMemories[sessionId].contextSummary });
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
                        this.sessionMemories[sessionId].contextSummary = data.summary;
                        this.sessionMemories[sessionId].recentBuffer.shift(); // 성공 시 버퍼에서 제거
                        console.log('✅ [ChatMemory] 요약 완료:', data.summary.substring(0, 30) + '...');
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
            if (this.sessionMemories[sessionId]) {
                this.sessionMemories[sessionId].isSummarizing = false;
            }
        }
    }
}

let chatMemory = new ChatMemory(); // 인스턴스 생성
window.chatMemory = chatMemory; // 전역 접근 가능하도록 export
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

// ★ [v6.5.2] findRelatedAnchorTopics 주석 처리 — 신규 RT 시스템으로 대체 ★
// function findRelatedAnchorTopics(userMessage, count = 3, includeUsed = false) {
//     if (!anchorTopics || anchorTopics.length === 0) return [];
//     const message = userMessage.toLowerCase();
//     const usedTopics = chatMemory.usedTopics || [];
//     const scored = anchorTopics
//         .filter(topic => includeUsed || !usedTopics.includes(topic.question))
//         .map(topic => {
//             let score = 0;
//             const question = topic.question.toLowerCase();
//             const category = topic.category.toLowerCase();
//             const subCategory = (topic.subCategory || '').toLowerCase();
//             if (message.includes(category)) score += 3;
//             if (message.includes(subCategory)) score += 2;
//             const questionWords = question.split(/[\s/]+/).filter(w => w.length > 1);
//             questionWords.forEach(word => { if (message.includes(word)) score += 1; });
//             const messageWords = message.split(/[\s/]+/).filter(w => w.length > 1);
//             messageWords.forEach(word => { if (question.includes(word)) score += 1; });
//             return { question: topic.question, score };
//         });
//     const result = scored.filter(t => t.score > 0).sort((a, b) => b.score - a.score).slice(0, count).map(t => t.question);
//     if (!includeUsed) console.log(`🎯 [RT] 추천 후보: ${result.length}개 (제외된 주제: ${usedTopics.length}개)`);
//     return result;
// }

// ★★★ 고유명사(업체명/엔티티) 강제 포함 함수 ★★★
// 질문에 특정 고유명사가 언급되면 해당 문서를 강제로 포함시킴
function findForcedDocsByCompanyName(userMessage, allDocs) {
    if (!allDocs || allDocs.length === 0) {
        return { forcedDocs: [], matchedCompanies: [] };
    }

    // 1. 데이터베이스에서 고유명사(엔티티) 목록 추출
    // - DB 레코드: question 필드가 엔티티명 (예: "무아디자인", "JWC그룹")
    // - 일반 문서: metadata.topic 필드 활용
    const entityNames = new Set();

    allDocs.forEach(doc => {
        // DB 레코드인 경우 question이 엔티티명
        if (doc.metadata?.category === 'DB 레코드' && doc.question) {
            const name = doc.question.trim();
            // 2글자 이상, 50글자 이하의 이름만 수집 (너무 긴 건 문장임)
            if (name.length >= 2 && name.length <= 50) {
                entityNames.add(name);
            }
        }
        // metadata.topic도 엔티티명일 수 있음
        if (doc.metadata?.topic) {
            const topic = doc.metadata.topic.trim();
            if (topic.length >= 2 && topic.length <= 50) {
                entityNames.add(topic);
            }
        }
    });

    // 2. 질문에서 엔티티명 매칭
    const matchedEntities = [];
    const userMsgLower = userMessage.toLowerCase().replace(/\s/g, ''); // 띄어쓰기 무시

    for (const entity of entityNames) {
        const entityLower = entity.toLowerCase().replace(/\s/g, '');
        // 엔티티명이 질문에 포함되어 있는지 확인
        if (userMsgLower.includes(entityLower)) {
            matchedEntities.push(entity);
        }
    }

    // 3. 매칭된 엔티티의 문서 검색
    const forcedDocs = [];
    if (matchedEntities.length > 0) {
        allDocs.forEach(doc => {
            const docQuestion = doc.question?.trim();
            const docTopic = doc.metadata?.topic?.trim();

            // question 또는 topic이 매칭된 엔티티와 일치하면 포함
            if ((docQuestion && matchedEntities.includes(docQuestion)) ||
                (docTopic && matchedEntities.includes(docTopic))) {
                forcedDocs.push({ ...doc }); // 복사본 추가
            }
        });
    }

    return { forcedDocs, matchedCompanies: matchedEntities };
}

const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const faqContent = document.getElementById('faqContent');
const faqNav = document.getElementById('faqNav');
const faqBackBtn = document.getElementById('faqBackBtn');

// ★ 데이터 로딩 상태 플래그 ★
let isDataLoaded = false;

// ==========================
// 1. 초기화 및 이벤트
// ==========================
document.addEventListener('DOMContentLoaded', async () => {
    // ★ 이벤트 리스너를 먼저 등록 (로딩 중에도 Enter 키 동작하도록) ★
    setupEventListeners();

    // 진료과 확인 - 새 로그인 시스템(chat-history.js)이 없을 경우에만 기존 모달 표시
    const loginModal = document.getElementById('loginModal');
    const savedSpecialty = localStorage.getItem('userSpecialty');

    if (savedSpecialty && SPECIALTIES[savedSpecialty]) {
        currentUserSpecialty = savedSpecialty;
        updateSpecialtyBadge();
    } else if (!loginModal) {
        // loginModal이 없을 때만 기존 진료과 모달 사용
        openSpecialtyModal();
    }

    // ★ 로딩 중 UI 표시 ★
    userInput.placeholder = '데이터를 불러오는 중입니다...';
    sendButton.disabled = true;
    sendButton.style.opacity = '0.5';

    sheetsLoader = new GoogleSheetsLoader();
    try {
        await sheetsLoader.loadData();
        renderFAQFields();
    } catch (error) {
        console.error('Initial Load Error:', error);
    }

    // ★ 로딩 완료 → UI 복구 ★
    isDataLoaded = true;
    userInput.placeholder = '궁금하신 내용을 입력해주세요...';
    sendButton.disabled = false;
    sendButton.style.opacity = '1';
    console.log('✅ 데이터 로딩 완료, 입력 활성화');
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

    // 모바일 UI 초기화
    initMobileUI();
}

/**
 * 모바일 UI 초기화 (최종 안정화 버전)
 */
function initMobileUI() {
    // 모바일인지 확인 (768px 이하)
    if (window.innerWidth > 768) return;

    console.log('📱 모바일 UI 초기화 시작...');

    // ★★★ 핵심: 사이드바를 app-container에서 body로 이동 (flex layout에서 완전 제거) ★★★
    const sidebar = document.getElementById('historySidebar');
    if (sidebar && sidebar.parentElement && sidebar.parentElement.classList.contains('app-container')) {
        document.body.appendChild(sidebar);
        console.log('📱 사이드바를 app-container 밖으로 이동 완료');
    }

    // 사이드바 숨김 처리
    if (sidebar) {
        sidebar.style.cssText = 'display:none !important; position:fixed; left:0; top:0; bottom:0; width:280px; z-index:1001; transform:translateX(-100%);';
    }

    // 1. 모바일 전용 버튼들 노출
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const headerPlannerBtn = document.getElementById('headerPlannerBtn');

    if (mobileMenuBtn) {
        mobileMenuBtn.style.display = 'flex';
        // HTML의 onclick을 지우고 addEventListener로 확실하게 연결
        mobileMenuBtn.onclick = null;
        mobileMenuBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            toggleMobileSidebar();
        });
    }

    if (headerPlannerBtn) {
        headerPlannerBtn.style.display = 'flex';
        headerPlannerBtn.onclick = null;
        headerPlannerBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof openContactModal === 'function') openContactModal();
        });
    }

    // 2. 오버레이 생성 및 이벤트 연결
    let overlay = document.getElementById('sidebarOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }
    overlay.onclick = null;
    overlay.addEventListener('click', function (e) {
        closeMobileSidebar();
    });

    // 3. 하단 중복 버튼 숨김
    const bottomPlannerBtn = document.querySelector('.input-container .planner-btn, .input-container [onclick*="openContactModal"]:not(.header-planner-btn)');
    if (bottomPlannerBtn) {
        bottomPlannerBtn.style.display = 'none';
    }

    // 4. 모바일 아바타 DOM 제거 (CSS 이중 안전장치)
    document.querySelectorAll('.message-avatar').forEach(avatar => avatar.remove());

    // 5. 새 메시지가 추가될 때도 아바타 자동 제거
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer && !chatContainer._avatarObserver) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        const avatars = node.querySelectorAll ? node.querySelectorAll('.message-avatar') : [];
                        avatars.forEach(a => a.remove());
                        if (node.classList && node.classList.contains('message-avatar')) {
                            node.remove();
                        }
                    }
                });
            });
        });
        observer.observe(chatContainer, { childList: true, subtree: true });
        chatContainer._avatarObserver = true;
    }

    console.log('✅ 모바일 UI 초기화 완료 (Event Listeners + Avatar Removal)');
}

/**
 * 모바일 사이드바 토글
 */
function toggleMobileSidebar() {
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar && overlay) {
        const isOpen = sidebar.classList.contains('mobile-open');
        if (isOpen) {
            // 닫기
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
            sidebar.style.cssText = 'display:none !important;';
        } else {
            // 열기: 오버레이로 표시
            sidebar.style.cssText = 'display:flex !important; position:fixed !important; left:0 !important; top:0 !important; bottom:0 !important; width:280px !important; z-index:1001 !important; background:var(--history-bg); border-right:1px solid var(--history-border); flex-direction:column; overflow:hidden;';
            sidebar.classList.add('mobile-open');
            overlay.classList.add('active');
        }
        console.log('🎯 사이드바 상태:', !isOpen ? '열림' : '닫힘');
    }
}

/**
 * 모바일 사이드바 닫기
 */
function closeMobileSidebar() {
    const sidebar = document.getElementById('historySidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebar) {
        sidebar.classList.remove('mobile-open');
        sidebar.style.cssText = 'display:none !important;';
    }
    if (overlay) overlay.classList.remove('active');
}

// 전역 노출 (최후의 보루)
window.toggleMobileSidebar = toggleMobileSidebar;
window.closeMobileSidebar = closeMobileSidebar;

// 안전장치: 페이지 완전 로드 후 한 번 더 initMobileUI 호출
window.addEventListener('load', function () {
    if (window.innerWidth <= 768) {
        console.log('🔄 window.load에서 initMobileUI 재호출');
        initMobileUI();
    }
});


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
    // ★ 데이터 로딩 중이면 안내 메시지 표시 ★
    if (!isDataLoaded) {
        const message = userInput.value.trim();
        if (message) {
            addMessage('데이터를 불러오는 중입니다. 잠시만 기다려주세요! 😊', 'bot');
        }
        return;
    }

    // 생성 중일 때 버튼 누르면 중단
    if (sendButton.classList.contains('stop-mode')) {
        if (currentAbortController) {
            console.log('🛑 AI 답변 생성 중단 요청...');
            currentAbortController.abort();
            hideTypingIndicator(); // UI 즉시 복구
        }
        return;
    }

    const message = userInput.value.trim();
    if (!message) return;
    sendUserMessage(message);
}

async function sendUserMessage(message) {
    userInput.value = '';
    userInput.style.height = 'auto';
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.style.display = 'none';
    hideSuggestedQuestions();

    // ★ 세션이 없으면 먼저 생성 후 대기 ★
    if (window.chatHistory) {
        const sessionId = window.chatHistory.getCurrentSessionId();
        if (!sessionId) {
            console.log('📝 세션 없음 - 새 세션 생성 중...');
            await window.chatHistory.createNewChat();
            console.log('✅ 새 세션 생성 완료:', window.chatHistory.getCurrentSessionId());
        }
    }

    addMessage(message, 'user');
    showTypingIndicator();

    // Supabase에 사용자 메시지 저장 (chat-history.js)
    if (window.chatHistory && typeof window.chatHistory.saveMessage === 'function') {
        window.chatHistory.saveMessage('user', message).catch(err => {
            console.warn('사용자 메시지 DB 저장 실패:', err);
        });
    }

    getBotResponse(message);
}

// ========== 추천 질문 (말풍선) 관련 함수 ==========

/**
 * 추천 질문 클릭 시 해당 질문을 전송
 */
function sendSuggestedQuestion(btn) {
    const text = btn.textContent.trim();
    if (!text) return;
    const userInput = document.getElementById('userInput');
    if (userInput) userInput.value = text;
    sendUserMessage(text);
}

/**
 * 추천 질문 버블 숨기기
 */
function hideSuggestedQuestions() {
    const sq = document.getElementById('suggestedQuestions');
    if (sq) sq.style.display = 'none';
}

/**
 * 추천 질문 버블 표시하기
 */
function showSuggestedQuestions() {
    const sq = document.getElementById('suggestedQuestions');
    if (sq) sq.style.display = 'flex';
}

async function getBotResponse(userMessage) {
    // 0. AbortController 초기화 (이전 작업이 있으면 중단시키지는 않고 새로 생성)
    currentAbortController = new AbortController();

    // 피드백용으로 현재 질문 저장
    window.currentQuestion = userMessage;

    // ★ [v6.5.2] 기존 matchedTopics 기록 주석 처리 — 신규 RT 시스템으로 대체 ★
    // const matchedTopics = findRelatedAnchorTopics(userMessage, 1, true);
    // if (matchedTopics.length > 0) {
    //     chatMemory.addUsedTopic(matchedTopics[0]);
    // }

    // 사용자 질문을 Google Sheets에 수집 (비동기, 에러 무시)
    try {
        const response = await fetch('/api/collect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sheetName: 'UserQuestions',
                question: userMessage,
                timestamp: new Date().toLocaleString('ko-KR')
            }),
            signal: currentAbortController.signal
        });
        const result = await response.json();
        if (!result.success) {
            console.warn('⚠️ 질문 수집 실패:', result.error);
        }
    } catch (e) {
        console.warn('질문 수집 중 시스템 오류:', e);
    }

    try {
        // ========== Stage 1: Query Planning ==========
        startTypingMessageRolling('stage1');
        console.log('🧠 Stage 1: Query Planning 시작...');
        let queryPlan = null;
        let relatedContexts = [];

        try {
            const userSpec = getUserSpecialty();
            // ★ 현재까지 언급된 항목들 추출 ★
            const alreadyMentioned = extractMentionedKeywords();

            // ★ 디버그: 현재 세션과 맥락 확인 ★
            console.log('🔍 [DEBUG] 현재 세션:', chatMemory.currentSessionId?.substring(0, 8));
            console.log('🔍 [DEBUG] recentBuffer 길이:', chatMemory.recentBuffer.length);
            console.log('🔍 [DEBUG] 맥락 내용 (앞 200자):', chatMemory.getContextPrompt().substring(0, 200));

            const planResponse = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: userMessage,
                    mode: 'plan',
                    userSpecialty: userSpec,
                    recentContext: chatMemory.getContextPrompt(),  // 요약 + 최근 대화 전달
                    alreadyMentioned: alreadyMentioned             // 중복 제거용 데이터 추가
                }),
                signal: currentAbortController.signal
            });

            if (planResponse.ok) {
                const planResult = await planResponse.json();
                if (planResult.success && planResult.plan) {
                    queryPlan = planResult.plan;
                    window._lastQueryPlan = queryPlan;  // 피드백용 저장
                    console.log('✅ Query Plan 수신:', queryPlan);
                    console.log('   Intent:', queryPlan.intent);
                    console.log('   RequiresSearch:', queryPlan.requiresSearch);
                    console.log('   Planner:', planResult.modelName);

                    // ★ MECE 6분류 기반 분기 처리 ★
                    if (queryPlan.requiresSearch === false && queryPlan.directAnswer) {
                        // 검색 불필요: 타이핑 효과로 답변 출력
                        hideTypingIndicator();
                        console.log(`🎯 [${queryPlan.intent}] 검색 스킵, 타이핑 효과로 답변 출력`);

                        // 스트리밍 메시지 컨테이너 생성
                        const { container: streamingContainer, contentDiv: streamingContent } = createStreamingMessageContainer();

                        // PLANNER_CONNECT, OUT_OF_SCOPE, AMBIGUOUS 처리
                        let finalAnswer = queryPlan.directAnswer;
                        let messageType = 'normal';

                        if (queryPlan.intent === 'PLANNER_CONNECT') {
                            // ★ 플래너 연결 — 버튼 없이 답변만 스트리밍 ★
                            messageType = 'planner_connect';
                        } else if (queryPlan.intent === 'OUT_OF_SCOPE') {
                            messageType = 'out_of_scope';
                            // [NO_DATA] 태그 추가 (플래너 버튼 표시용)
                            if (!finalAnswer.includes('[NO_DATA]')) {
                                finalAnswer = '[NO_DATA]' + finalAnswer;
                            }
                            // ★ [v6.5.2] OUT_OF_SCOPE/AMBIGUOUS RT 주석 처리 — 신규 RT 시스템으로 대체 ★
                            // const rtTopics = findRelatedAnchorTopics(userMessage, 3);
                            // if (rtTopics.length > 0) {
                            //     finalAnswer += '\n\n[RELATED_TOPICS]' + rtTopics.join('|') + '[/RELATED_TOPICS]';
                            // }
                        } else if (queryPlan.intent === 'AMBIGUOUS') {
                            // ★ [v6.5.2] AMBIGUOUS RT 주석 처리 ★
                            // const relatedTopics = findRelatedAnchorTopics(userMessage, 5);
                            // if (relatedTopics.length > 0) {
                            //     finalAnswer += '\n\n[RELATED_TOPICS]' + relatedTopics.join('|') + '[/RELATED_TOPICS]';
                            // }
                        }

                        // ★ 타이핑 효과 적용 ★
                        await displayWithTypingEffect(streamingContent, finalAnswer);

                        // 스트리밍 완료 후 최종 포맷팅 적용 (GREETING이면 RT 스킵)
                        const isGreeting = queryPlan.intent === 'GREETING';
                        finalizeStreamingMessage(streamingContainer, finalAnswer, [], null, { skipRT: isGreeting });



                        // ChatMemory에 저장 (맥락 유지용) - finalAnswer로 저장 (RT 블록 포함)
                        await chatMemory.addTurn(userMessage, finalAnswer);

                        // Supabase 저장 - finalAnswer로 저장 (RT 블록 포함하여 리로드 시 복원)
                        if (window.chatHistory && typeof window.chatHistory.saveMessage === 'function') {
                            window.chatHistory.saveMessage('assistant', finalAnswer, chatMemory.getContextPrompt(), messageType).catch(() => { });
                        }

                        return; // ★ 검색 로직 완전 스킵 ★
                    }


                    // 기존 off_topic 호환성 유지 (혹시 모를 레거시 응답 대응)
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
        // (SPECIFIC intent만 여기까지 도달)
        startTypingMessageRolling('stage2');
        console.log('🔍 Stage 2: Smart Search 시작...');

        // 성능 최적화: 검색 결과 한도 조정 (파트너사 15개로 확대)
        const isPartnerListQuery = queryPlan?.subIntent === '파트너사목록' || queryPlan?.targetCategory === 'partners';
        const maxResults = isPartnerListQuery ? 15 : 30;

        if (queryPlan) {
            // Query Plan 기반 스마트 검색 (사용자 진료과 정보 전달)
            const userSpec = getUserSpecialty();
            relatedContexts = await sheetsLoader.smartSearch(queryPlan, maxResults, userSpec, currentAbortController.signal);
        } else {
            // Fallback: 기존 키워드 검색
            relatedContexts = await sheetsLoader.searchRelatedContext(userMessage, maxResults);
        }


        // (고유명사 강제 포함 로직 제거됨 — 검색 스코어링의 고유명사 부스트로 대체)

        // ★ 출처 분석 (Log용) ★
        const sourceCounts = relatedContexts.reduce((acc, doc) => {
            const src = doc.source || 'etc';
            acc[src] = (acc[src] || 0) + 1;
            return acc;
        }, {});

        console.log(`📚 최종 문서: ${relatedContexts.length}개 (Notion: ${sourceCounts.notion || 0}, Q&A: ${sourceCounts.qa || 0}, FAQ: ${sourceCounts.faq || 0})`);

        // ★ [v6.5.2] RT 문서 추출 ★
        const rtDocuments = relatedContexts._rtResults || [];
        if (rtDocuments.length > 0) {
            console.log(`🔗 RT 문서: ${rtDocuments.length}개`);
            rtDocuments.forEach((doc, i) => {
                console.log(`   [RT${i + 1}] ${doc.score?.toFixed(4)} | ${(doc.question || '').substring(0, 60)}`);
            });
        } else {
            console.log('🔗 RT 문서: 0개 (추천 생략)');
        }

        // ========== Stage 3: Answer Generation (Streaming) ==========
        startTypingMessageRolling('stage3');
        console.log('💬 Stage 3: 스트리밍 답변 생성 시작...');

        // 스트리밍 메시지 컨테이너 생성 (아직 보이지 않음 - 첫 텍스트 도착 시 표시)
        const { container: streamingContainer, contentDiv: streamingContent } = createStreamingMessageContainer();
        streamingContainer.style.display = 'none'; // 첫 텍스트 도착 전까지 숨김

        try {
            // 스트리밍 + 타이핑 효과
            const result = await callOpenRouterAPIWithStreaming(
                userMessage,
                relatedContexts,
                streamingContent,
                currentAbortController.signal,
                rtDocuments  // ★ [v6.5.2] RT 문서 전달 ★
            );

            // 스트리밍 완료 후 최종 포맷팅 적용
            finalizeStreamingMessage(
                streamingContainer,
                result.text,
                result.filteredContexts || relatedContexts,
                result.modelName
            );




            // 최종 응답 텍스트 결정
            let responseText = result.text;


            // ★ 토픽 태그 파싱 및 세션 제목 업데이트 ★
            const topicMatch = responseText.match(/\[TOPIC:\s*([^\]]+)\]/);
            if (topicMatch && topicMatch[1]) {
                const topic = topicMatch[1].trim();
                console.log(`📌 토픽 감지: ${topic}`);
                if (typeof updateCurrentSessionTitle === 'function') {
                    updateCurrentSessionTitle(topic);
                }
                responseText = responseText.replace(/\[TOPIC:\s*[^\]]+\]\n?/, '').trim();
            }

            // ★ 메시지 타입 추적 (플래너 버튼 복원용) ★
            let messageType = 'normal';

            if (responseText.includes('[OFF_TOPIC]')) {
                messageType = 'off_topic';
                responseText = responseText.replace('[OFF_TOPIC]', '').trim();
            } else if (responseText.includes('[NO_DATA]')) {
                messageType = 'no_data';
                responseText = responseText.replace('[NO_DATA]', '').trim();
            }

            // 모든 인용/참고문서 주석 완전 제거
            responseText = responseText
                .replace(/\[(?:ID:\s*)?\d+(?:,\s*\d+)*\]/gi, '')
                .replace(/참고\s*문서\s*\d+\s*번?/gi, '')
                .replace(/문서\s*\d+\s*번?/gi, '')
                .replace(/출처[:\s]*\[?\d+\]?/gi, '')
                .replace(/근거[:\s]*\[?\d+\]?/gi, '')
                .replace(/참조[:\s]*\[?\d+\]?/gi, '')
                .replace(/\[참고\s*\d*\]/gi, '')
                .replace(/\(참고[:\s]*문서?\s*\d+\)/gi, '')
                .replace(/`\[\d+\]`/g, '')
                .trim();

            // 대화 히스토리에 저장
            chatMemory.addTurn(userMessage, responseText);

            // Supabase에 AI 응답 저장
            if (window.chatHistory && typeof window.chatHistory.saveMessage === 'function') {
                window.chatHistory.saveMessage('assistant', responseText, chatMemory.getContextPrompt(), messageType).catch(err => {
                    console.warn('AI 응답 DB 저장 실패:', err);
                });
            }

        } catch (streamError) {
            if (streamError.name === 'AbortError') {
                // 사용자가 중단한 경우 스트리밍 컨테이너 제거
                streamingContainer.remove();
                throw streamError;
            }

            // 스트리밍 실패 시 기존 방식으로 fallback
            console.warn('⚠️ 스트리밍 실패, 기존 방식으로 fallback:', streamError.message);
            streamingContainer.remove();

            // 기존 방식으로 재시도
            startTypingMessageRolling('stage3');
            const result = await callOpenRouterAPI(userMessage, relatedContexts);
            hideTypingIndicator();

            let responseText = result.text;

            const topicMatch = responseText.match(/\[TOPIC:\s*([^\]]+)\]/);
            if (topicMatch && topicMatch[1]) {
                const topic = topicMatch[1].trim();
                if (typeof updateCurrentSessionTitle === 'function') {
                    updateCurrentSessionTitle(topic);
                }
                responseText = responseText.replace(/\[TOPIC:\s*[^\]]+\]\n?/, '').trim();
            }

            let messageType = 'normal';

            if (responseText.includes('[OFF_TOPIC]')) {
                let cleanText = responseText.replace('[OFF_TOPIC]', '').trim();
                cleanText = cleanText.replace(/\[(?:ID:\s*)?\d+(?:,\s*\d+)*\]/gi, '').replace(/참고\s*문서\s*\d+\s*번?/gi, '').replace(/출처[:\s]*\[?\d+\]?/gi, '').trim();
                addOffTopicMessage(cleanText);
                responseText = cleanText;
                messageType = 'off_topic';
            } else if (responseText.includes('[NO_DATA]')) {
                let cleanText = responseText.replace('[NO_DATA]', '').trim();
                cleanText = cleanText.replace(/\[(?:ID:\s*)?\d+(?:,\s*\d+)*\]/gi, '').replace(/참고\s*문서\s*\d+\s*번?/gi, '').replace(/출처[:\s]*\[?\d+\]?/gi, '').trim();
                addNoDataMessage(cleanText);
                responseText = cleanText;
                messageType = 'no_data';
            } else {
                responseText = responseText.replace(/\[(?:ID:\s*)?\d+(?:,\s*\d+)*\]/gi, '').replace(/참고\s*문서\s*\d+\s*번?/gi, '').replace(/출처[:\s]*\[?\d+\]?/gi, '').trim();
                addFormattedMessage(responseText, result.filteredContexts || relatedContexts, result.modelName);
            }

            chatMemory.addTurn(userMessage, responseText);

            if (window.chatHistory && typeof window.chatHistory.saveMessage === 'function') {
                window.chatHistory.saveMessage('assistant', responseText, chatMemory.getContextPrompt(), messageType).catch(err => {
                    console.warn('AI 응답 DB 저장 실패:', err);
                });
            }
        }


    } catch (error) {
        hideTypingIndicator(); // 어떤 경우든 인디케이터는 제거

        if (error.name === 'AbortError') {
            console.log('✨ [System] 사용자에 의해 답변 생성이 중단되었습니다.');
            addMessage('답변 생성이 중지되었습니다. 다른 궁금하신 점이 있다면 언제든 문의주세요 :)', 'bot');
            return;
        }
        console.error('Bot Response Error:', error);
        addMessage('죄송합니다. 오류가 발생했습니다.', 'bot');
    } finally {
        restoreSendButton();
    }
}

async function callOpenRouterAPI(userQuery, contexts) {
    // ★ Phase 3-2: 참고문서에 진료과 메타데이터 시각화 ★
    const userSpec = getUserSpecialty();
    let contextText = '';

    let filteredContexts = []; // 선언 이동 및 스코프 확장
    if (contexts && contexts.length > 0) {
        // ★ Step 6: Top N 선택 (10~30개) - sheets-loader.js에서 이미 동적 컷오프 수행됨 ★
        const maxDocs = Math.min(contexts.length, 30);
        const minDocs = Math.min(contexts.length, 10);
        filteredContexts = contexts.slice(0, maxDocs);

        console.log(`   📚 최종 문서: ${filteredContexts.length}개 (범위: ${minDocs}~${maxDocs})`);

        // ★ 최종 문서 30개 상세 로그 ★
        console.log('   📋 문서 목록 (점수 내림차순):');
        filteredContexts.forEach((doc, idx) => {
            const src = doc.source || 'etc';
            const q = (doc.question || '').substring(0, 50);
            const score = doc.score ? doc.score.toFixed(4) : 'N/A';
            const tier = doc.metadata?.tier ? `T${doc.metadata.tier}` : '';
            console.log(`      [${idx + 1}] score=${score} ${tier} (${src}) ${q}${doc.question.length > 50 ? '...' : ''}`);
        });
        // 점수 분포 통계
        const scores = filteredContexts.map(d => d.score || 0);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        console.log(`   📊 점수 분포: 평균=${mean.toFixed(4)}, 표준편차=${stdDev.toFixed(4)}, 최고=${scores[0]?.toFixed(4)}, 최저=${scores[scores.length - 1]?.toFixed(4)}`);

        // 문서 포맷팅 함수
        const formatDoc = (item, idx) => {
            let prefix = `[${idx + 1}]`;

            // tier 태그
            if (item.metadata?.tier) {
                prefix += ` [tier:${item.metadata.tier}]`;
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
                prefix += ` (공통) |`;
            }

            // 토큰 최적화: answer를 15000자로 제한 (v2.3.1)
            const truncatedAnswer = item.answer.length > 15000
                ? item.answer.substring(0, 15000) + '...(이하 생략)'
                : item.answer;
            return `${prefix} Q: ${item.question}\nA: ${truncatedAnswer}`;
        };

        // 단순 문서 목록 구성 (계층화 없음)
        contextText = filteredContexts.map((item, idx) => formatDoc(item, idx)).join('\n\n');
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

    // 첫 대화인지 확인 (토픽 생성용)
    const isFirstMessage = !historyText || historyText === '(첫 대화)' || chatMemory.recentBuffer.length === 0;
    const topicGenerationRule = isFirstMessage ? `
# ⭐ 토픽 생성 (첫 대화일 때만)
- 이 대화의 주제를 한글 10자 이내로 요약하여 답변의 **맨 첫 줄**에 다음 형식으로 작성하세요: \`[TOPIC: 주제]\`
- 예시: \`[TOPIC: 임플란트 장비]\`, \`[TOPIC: 인테리어 비용]\`, \`[TOPIC: 세무 상담]\`
- 토픽 태그 다음 줄부터 실제 답변을 시작하세요.
` : '';

    const systemPrompt = buildSystemPrompt({ historyText, contextText, specialtyInfo, deduplicationRule, topicGenerationRule });

    try {
        console.log('🤖 AI 서버 호출 중...');

        const response = await fetch(CONFIG.CHAT_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userQuery: `질문: ${userQuery}`,
                systemPrompt: systemPrompt
            }),
            signal: currentAbortController.signal
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
        // AbortError 체크: 사용자가 중단한 경우 친화적 메시지 반환
        if (error.name === 'AbortError') {
            console.log('✨ [callOpenRouterAPI] 사용자에 의해 요청이 중단되었습니다.');
            throw error; // 상위에서 처리하도록 AbortError 그대로 throw
        }
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

    if (sender === 'user') {
        // ★ Gemini/ChatGPT 스타일: 사용자 메시지가 화면 상단으로 즉시 이동 ★
        // 하단에 viewport 높이만큼 패딩을 추가하여 스크롤 공간 확보
        const viewportHeight = chatContainer.clientHeight;
        chatContainer.style.paddingBottom = viewportHeight + 'px';
        requestAnimationFrame(() => {
            // getBoundingClientRect로 정확한 상대 위치 계산 (offsetParent 문제 회피)
            const msgRect = div.getBoundingClientRect();
            const containerRect = chatContainer.getBoundingClientRect();
            const currentOffset = msgRect.top - containerRect.top;
            const desiredOffset = 24; // 상단에서 24px 여유공간
            const newScrollTop = chatContainer.scrollTop + currentOffset - desiredOffset;
            chatContainer.scrollTo({ top: Math.max(0, newScrollTop), behavior: 'smooth' });
        });
    } else {
        scrollToBottom();
    }
}

// 마크다운을 HTML로 변환하여 렌더링
function addFormattedMessage(text, contexts, modelName = null) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // ★ 방어적 조치: 일반 답변에서 플래너 멘트가 포함되면 제거 ★
    // (이 멘트는 NO_DATA 전용이므로, 일반 답변에서 AI가 실수로 넣었다면 제거)
    text = text.replace(/질문하신 내용에 대해 문의 사항 있으시면 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다\.?/g, '').trim();

    // 0. [RELATED_TOPICS] 블록 추출 및 제거 (파이프 + 불렛 둘 다 지원)
    let relatedTopics = [];
    const topicsMatch = text.match(/\[RELATED_TOPICS\]([\s\S]*?)\[\/RELATED_TOPICS\]/);
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
        text = text.replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/, '').trim();
    }

    // 1~2. 인용 제거 + 마크다운 → HTML 변환 (renderMarkdownSafe로 통일)
    let html = renderMarkdownSafe(text);

    // 3. 관련 주제를 클릭 가능한 링크로 변환
    // 3. 관련 주제를 클릭 가능한 링크로 변환
    if (relatedTopics.length > 0) {
        relatedTopics.forEach(topic => {
            // 본문에 **주제** 형태로 있는 것을 찾아 클릭 가능한 링크로 만듭니다.
            const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`<strong>${escapedTopic}</strong>`, 'gi');
            const clickableLink = `<strong class="clickable-topic" onclick="sendRelatedTopic('${escapeHtml(topic.replace(/'/g, "\\'"))}')">${escapeHtml(topic)}</strong>`;
            html = html.replace(regex, clickableLink);

            if (typeof chatMemory !== 'undefined' && chatMemory.addUsedTopic) {
                chatMemory.addUsedTopic(topic);
            }
        });
    }

    // 5. 사용한 모델명 표시
    const modelInfo = modelName ? `<div class="model-info">🤖 ${modelName}</div>` : '';

    // 6. 피드백 버튼 + 복사 버튼 추가
    const messageId = Date.now();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
            <button class="feedback-btn copy" onclick="copyMessageToClipboard(${messageId}, this)" title="복사하기"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
        </div>
    `;

    // 질문/답변 + 맥락 저장 (피드백용)
    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: text,  // 전체 답변 저장 (제한 없음)
        contextPrompt: chatMemory.getContextPrompt()  // 맥락 정보 저장
    };

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">${html}${modelInfo}${feedbackButtons}</div>
    `;

    chatContainer.appendChild(div);
    scrollToMessageTop(div);

    // Note: Supabase 저장은 호출측(getBotResponse 등)에서 처리
}

// ★ [v6.5.2] 관련 주제 클릭 시 질문 전송 (간소화 — anchorTopics 검증 제거) ★
function sendRelatedTopic(topic) {
    userInput.value = topic;
    sendUserMessage(topic);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ★ [v6.5.2] generateRTFallbackHTML 주석 처리 — 신규 RT 시스템으로 대체 ★
// function generateRTFallbackHTML(topics) {
//     if (!topics || topics.length === 0) return '';
//     const top3 = topics.slice(0, 3);
//     const links = top3.map(topic => {
//         return `<strong class="clickable-topic" onclick="sendRelatedTopic('${escapeHtml(topic.replace(/'/g, "\\\\'"))}')">${escapeHtml(topic)}</strong>`;
//     });
//     const templates1 = [(l) => `혹시 ${l[0]}에 대해서도 궁금하시면 물어보세요 😊`];
//     const templates2 = [(l) => `혹시 ${l[0]}이나 ${l[1]}에 대해서도 궁금하시면 물어보세요 😊`];
//     const templates3 = [(l) => `혹시 ${l[0]}, ${l[1]}, ${l[2]} 등에 대해서도 궁금하시면 물어보세요 😊`];
//     const pool = links.length === 1 ? templates1 : links.length === 2 ? templates2 : templates3;
//     const sentence = pool[Math.floor(Math.random() * pool.length)](links);
//     return `<br><br><p>${sentence}</p>`;
// }

// ★★★ 통합 시스템 프롬프트 빌더 (v2.0) ★★★
// 일반 답변(getBotResponse)과 스트리밍(callOpenRouterAPIWithStreaming) 모두 이 함수를 호출합니다.
// 수정은 이 함수 한 곳에서만 하면 됩니다.
function buildSystemPrompt({ historyText, contextText, specialtyInfo, deduplicationRule, topicGenerationRule, rtTopicText }) {
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
   - **형식**: [NO_DATA] → 감사/사과 → 관련 내용 → 고정 안내 문구 → 플래너 연락 버튼 → [RELATED_TOPICS]
   - **고정 안내 문구**: "질문하신 내용에 대해 문의 사항 있으시면 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다."


# 관련 주제 추천
${rtTopicText ? `아래는 현재 질문과 관련도가 높은 추가 참고문서입니다.
이 문서들의 내용을 바탕으로 사용자에게 관련 주제를 자연스럽게 추천하세요.

${rtTopicText}

**규칙:**
1. 위 문서에서 현재 답변과 관련 깊은 주제를 **최대 3개** 선택.
2. "혹시 **[주제]**에 대해서도 궁금하신가요?" 형태로 자연스럽게 추천.
3. 핵심 키워드는 **굵게(bold)** 표시.
4. 방금 답변한 내용과 동일한 주제는 제외.
5. 답변 맨 마지막에 \`[RELATED_TOPICS]질문1|질문2|질문3[/RELATED_TOPICS]\` 포함.
   ⚠️ RT 문서의 Q를 그대로 쓰지 말고, 사용자에게 자연스러운 질문 형태로 다듬어서 작성.

**형식 예시 (3가지 중 하나처럼, 매번 다른 표현으로):**

예시A)
... 답변 본문 마침표로 끝.
혹시 **인공신장실 시설 기준**이나 **의료기기 리스 조건**도 궁금하시면 편하게 물어봐 주세요! 😊

예시B)
... 답변 본문 마침표로 끝.
참고로 **간판 디자인 가이드**나 **마케팅 초기 전략**에 대해서도 안내해 드릴 수 있어요.

예시C)
... 답변 본문 마침표로 끝.
이 외에도 **의료폐기물 처리 절차**가 궁금하시다면 말씀해 주세요!

⚠️ 매번 같은 도입 표현을 반복하지 마세요. 다양한 표현을 사용하세요.

[RELATED_TOPICS]인공신장실 시설 기준이 궁금해요|의료기기 리스 조건 알려주세요[/RELATED_TOPICS]` : `관련 추가 주제가 없습니다. [RELATED_TOPICS] 태그를 포함하지 마세요.`}
`;
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
    // ★ scrollToBottom() 제거 - 사용자 메시지가 상단에 유지되도록 ★

    // 전송 버튼 -> 중지 버튼으로 변경
    sendButton.classList.add('stop-mode');
    sendButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect>
        </svg>
    `;
    sendButton.title = '답변 생성 중단';
}

function updateTypingStatus(message) {
    const statusEl = document.getElementById('typingStatus');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// ============ Stage별 롤링 문구 시스템 ============
const STAGE_MESSAGES = {
    stage1: [
        '질문의 의도와 맥락을 분석하고 있습니다...',
        '어떤 정보가 필요한지 파악하고 있어요...',
        '질문을 이해하고 검색 전략을 세우는 중입니다...',
        '개원 관련 키워드를 추출하고 있어요...'
    ],
    stage2: [
        '데이터베이스에서 최적의 정보를 검색하고 있습니다...',
        '900개 이상의 문서에서 관련 정보를 찾고 있어요...',
        '진료과에 맞는 맞춤 정보를 선별 중입니다...',
        '가장 정확한 답변을 위해 자료를 수집하고 있어요...'
    ],
    stage3: [
        '찾은 정보를 바탕으로 답변을 작성하고 있습니다...',
        '개원에 필요한 핵심 정보를 정리하고 있어요...',
        '최적의 답변을 구성하고 있습니다...',
        '거의 다 됐어요! 조금만 기다려주세요...',
        '꼼꼼하게 검토하며 답변을 완성하고 있어요...'
    ]
};

let typingMessageInterval = null;
let currentMessageIndex = 0;

/**
 * 롤링 문구 시작
 * @param {string} stage - 'stage1', 'stage2', 'stage3'
 */
function startTypingMessageRolling(stage) {
    stopTypingMessageRolling(); // 기존 타이머 정리

    const messages = STAGE_MESSAGES[stage];
    if (!messages || messages.length === 0) return;

    currentMessageIndex = 0;
    updateTypingStatus(messages[0]); // 첫 문구 즉시 표시

    // 2초마다 문구 변경
    typingMessageInterval = setInterval(() => {
        currentMessageIndex = (currentMessageIndex + 1) % messages.length;
        updateTypingStatus(messages[currentMessageIndex]);
    }, 2000);
}

/**
 * 롤링 문구 중지
 */
function stopTypingMessageRolling() {
    if (typingMessageInterval) {
        clearInterval(typingMessageInterval);
        typingMessageInterval = null;
    }
    currentMessageIndex = 0;
}

function hideTypingIndicator() {
    stopTypingMessageRolling(); // 롤링 문구 타이머 정리

    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
    // ★ 중지 버튼은 여기서 복원하지 않음 (스트리밍 중에도 중지 가능하도록) ★
}

// ★ 전송 버튼 복원 (답변 생성 완전 완료 후에만 호출) ★
function restoreSendButton() {
    sendButton.classList.remove('stop-mode');
    sendButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
        </svg>
    `;
    sendButton.title = '전송';
    // Gemini 스타일 패딩도 함께 복원
    chatContainer.style.paddingBottom = '24px';
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// AI 응답 완료 시 직전 사용자 질문부터 보이도록 스크롤
function scrollToMessageTop(messageElement) {
    // ★ Gemini 스타일 패딩 복원 ★
    chatContainer.style.paddingBottom = '24px';

    if (messageElement) {
        // AI 응답 바로 이전의 사용자 메시지 찾기
        const prevSibling = messageElement.previousElementSibling;
        if (prevSibling && prevSibling.classList.contains('user')) {
            // 사용자 질문부터 보이도록 스크롤
            prevSibling.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            // 이전 메시지가 없으면 현재 메시지로 스크롤
            messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
}

// OFF_TOPIC 응답 렌더링
function addOffTopicMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // 피드백 버튼용 ID 생성 및 데이터 저장
    const messageId = Date.now();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
        </div>
    `;

    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: text,  // 전체 답변 저장 (제한 없음)
        contextPrompt: chatMemory.getContextPrompt()  // 맥락 정보 저장
    };

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            <p style="color: #64748b;">${text}</p>
            ${feedbackButtons}
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToMessageTop(div);

    // Note: Supabase 저장은 호출측(getBotResponse 등)에서 처리
}

// PLANNER_CONNECT 응답 렌더링 (플래너 연결 요청 시 전용 안내)
function addPlannerConnectMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // 피드백 버튼용 ID 생성 및 데이터 저장
    const messageId = Date.now();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
        </div>
    `;

    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: text,
        contextPrompt: chatMemory.getContextPrompt()
    };

    // 고정 메시지 (플래너 연결 안내)
    const fixedMessage = `
        <p style="margin-bottom: 12px; line-height: 1.7;">
            플래너와 상담을 원하시는군요! 😊
        </p>
        <p style="margin-bottom: 16px; line-height: 1.7;">
            화면 하단의 <strong>플래너 상담</strong> 버튼을 클릭하시면 담당 플래너를 선택하여 빠르게 연결해 드리겠습니다.
        </p>
    `;

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            ${fixedMessage}
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
            ${feedbackButtons}
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToMessageTop(div);
}

// OUT_OF_SCOPE 응답 렌더링 (플래너 연결 버튼 포함)
function addOutOfScopeMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // 피드백 버튼용 ID 생성 및 데이터 저장
    const messageId = Date.now();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
        </div>
    `;

    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: text,  // 전체 답변 저장 (제한 없음)
        contextPrompt: chatMemory.getContextPrompt()  // 맥락 정보 저장
    };

    // 고정 메시지 (친절한 톤 + 답변 가능 영역 안내)
    const fixedMessage = `
        <p style="margin-bottom: 12px; line-height: 1.7;">
            해당 내용은 전문적인 지식이 필요한 영역이라, 저보다 담당 플래너에게 문의하시는 것이 가장 정확합니다. 😊
        </p>
        <p style="margin-bottom: 8px; line-height: 1.7;">
            대신 저는 아래 내용에 대해 답변드릴 수 있어요!
        </p>
        <ul style="margin: 0 0 16px 24px; padding: 0; color: #475569; line-height: 1.8;">
            <li>🎨 인테리어, 간판, 의료기기 파트너사 추천</li>
            <li>📋 개원 절차 및 체크리스트 안내</li>
            <li>💡 진료과별 개원 팁 및 가이드</li>
        </ul>
        <p style="margin-bottom: 16px; line-height: 1.7; color: #64748b;">
            플래너 연결을 원하시면 아래 버튼을 눌러주세요. 빠른 시일 내에 회신드리겠습니다.
        </p>
    `;

    div.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content formatted-response">
            ${fixedMessage}
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
            ${feedbackButtons}
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToMessageTop(div);

    // Note: Supabase 저장은 호출측(getBotResponse 등)에서 처리
}

// NO_DATA 응답 렌더링 (볼드체, 불렛 포인트 지원 + 플래너 연락 버튼)
function addNoDataMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot';

    // 0. [RELATED_TOPICS] 블록 추출 및 제거 (파이프 + 불렛 둘 다 지원)
    let relatedTopics = [];
    const topicsMatch = text.match(/\[RELATED_TOPICS\]([\s\S]*?)\[\/RELATED_TOPICS\]/);
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
        text = text.replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/, '').trim();
    }

    // 1. 인용 번호 제거 ([숫자], [ID: 숫자] 형식 모두)
    let cleanedText = text.replace(/\[\d+\]/g, '').replace(/\[ID:\s*\d+\]/gi, '').trim();

    // 2. 고정 안내 문구 제거 (UI에서 별도로 표시하므로 LLM 출력에서 제거)
    cleanedText = cleanedText.replace(/질문하신 내용에 대해 문의 사항 있으시면 플래너에게 연락 주시면 빠른 시일 내에 연락드리겠습니다\.?/g, '').trim();

    // 3. 줄 단위로 분리 (다양한 줄바꿈 형식 지원)
    const lines = cleanedText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);

    // 4. 맺음말 제거 로직
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

    // 5. 마크다운 → HTML 변환
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

    let html = htmlParts.join('');

    // 6. 관련 주제를 클릭 가능한 링크로 변환
    if (relatedTopics.length > 0) {
        relatedTopics.forEach(topic => {
            // **주제** 형태의 굵은 글씨를 클릭 가능한 링크로 변환
            const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`<strong>${escapedTopic}</strong>`, 'gi');
            const clickableLink = `<strong class="clickable-topic" onclick="sendRelatedTopic('${escapeHtml(topic.replace(/'/g, "\\'"))}')">${escapeHtml(topic)}</strong>`;
            html = html.replace(regex, clickableLink);
        });
    }

    // 7. 피드백 버튼용 ID 생성 및 데이터 저장
    const messageId = Date.now();
    const feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
        </div>
    `;

    window.lastMessages = window.lastMessages || {};
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: text,  // 전체 답변 저장 (제한 없음)
        contextPrompt: chatMemory.getContextPrompt()  // 맥락 정보 저장
    };

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
                margin-bottom: 16px;
            ">
                <span style="font-size: 16px;">☎️</span> 플래너에게 연락하기
            </button>
            ${feedbackButtons}
        </div>
    `;
    chatContainer.appendChild(div);
    scrollToMessageTop(div);

    // Note: Supabase 저장은 호출측(getBotResponse 등)에서 처리
}

// ========== 답변 복사 기능 ==========
async function copyMessageToClipboard(messageId, buttonElement) {
    const messageData = window.lastMessages?.[messageId];
    if (!messageData) {
        console.warn('복사할 메시지를 찾을 수 없습니다:', messageId);
        return;
    }

    try {
        await navigator.clipboard.writeText(messageData.answer);

        // 시각적 피드백: SVG 체크 아이콘으로 변경
        const originalHTML = buttonElement.innerHTML;
        buttonElement.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        buttonElement.classList.add('copied');

        // ★ 토스트 메시지 표시 ★
        showToast('클립보드에 복사되었습니다.');

        setTimeout(() => {
            buttonElement.innerHTML = originalHTML;
            buttonElement.classList.remove('copied');
        }, 2000);

    } catch (error) {
        console.error('클립보드 복사 실패:', error);
        showToast('복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
    }
}

// ★ 토스트 메시지 표시 함수 ★
function showToast(message) {
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
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
    const feedbackTextarea = document.getElementById('feedbackTextarea');
    const submitBtn = document.querySelector('#feedbackModal .feedback-submit-btn');

    const content = feedbackTextarea.value.trim();
    const messageId = currentFeedbackMessageId;
    const messageData = window.lastMessages?.[messageId] || {};

    const feedback = {
        type: currentFeedbackType === 'good' ? 'Good' : 'Bad',
        question: messageData.question || '',
        answer: messageData.answer || '',
        content: content || '(내용 없음)',
        context_prompt: messageData.contextPrompt || '',
        user_name: window.currentUserName || '',
        specialty: currentUserSpecialty || '',
        search_log: messageData.searchLog || null
    };

    console.log('📤 피드백 Supabase 저장 시도:', feedback);

    // 버튼 비활성화로 중복 방지
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '전송 중...';
    }

    try {
        // Supabase에 직접 저장
        const { data, error } = await supabaseClient
            .from('feedback')
            .insert([feedback])
            .select();

        if (error) {
            throw error;
        }

        console.log('✅ 피드백 저장 완료:', data);

        // ★ 피드백 10개 도달 체크 및 Slack 알림 ★
        checkFeedbackCountAndNotify();

        closeFeedbackModal();
        showSuccessModal('피드백 전달이 완료되었습니다. 감사합니다.');

    } catch (error) {
        console.error('❌ 피드백 저장 오류:', error);
        alert('피드백 제출 중 오류가 발생했습니다: ' + error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = '제출';
        }
    }
}

/**
 * 피드백 10개 도달 체크 및 Slack 알림
 */
async function checkFeedbackCountAndNotify() {
    try {
        // 처리되지 않은 피드백 개수 조회
        const { count, error } = await supabaseClient
            .from('feedback')
            .select('*', { count: 'exact', head: true })
            .is('processed', null);  // processed 컬럼이 null인 것만

        if (error) {
            console.warn('피드백 카운트 조회 실패:', error);
            return;
        }

        console.log(`📊 미처리 피드백: ${count}개`);

        // 10개 이상이면 Slack 알림
        if (count >= 10) {
            console.log('🔔 피드백 10개 도달! Slack 알림 전송...');

            const response = await fetch('/api/slack-notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    count: count,
                    message: `🔔 *피드백 자동화 알림*\n\n*${count}개*의 새로운 피드백이 쌓였습니다!\n\n👉 AI 채팅창에 \`/feedback-auto\` 를 입력하여 자동 개선을 시작하세요.`
                })
            });

            if (response.ok) {
                console.log('✅ Slack 알림 전송 완료');
            } else {
                console.warn('⚠️ Slack 알림 전송 실패');
            }
        }
    } catch (err) {
        console.warn('피드백 카운트 체크 오류:', err);
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

// (기존 중복 함수 삭제됨 - 상단 정의 사용)


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

        // 채팅창 초기화 및 환영 메시지 재생성
        if (chatContainer) {
            chatContainer.innerHTML = '';
        }

        // 환영 메시지 표시 (chat-history.js의 showWelcomeMessage 사용)
        if (typeof showWelcomeMessage === 'function') {
            showWelcomeMessage();
        }
        showSuggestedQuestions();

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

// chat-history.js에서 호출하기 위한 진료과 설정 함수
function setUserSpecialty(specialty) {
    if (!SPECIALTIES[specialty]) {
        console.error('Invalid specialty:', specialty);
        return;
    }
    currentUserSpecialty = specialty;
    localStorage.setItem('userSpecialty', specialty);
    updateSpecialtyBadge();
    console.log(`✅ 진료과 설정됨 (login 연동): ${SPECIALTIES[specialty].label}`);
}

// ==========================
// 다크/라이트 모드 토글
// ==========================
// 다크/라이트 모드 토글 (라이트 모드 고정을 위해 기능 비활성화 또는 라이트 고정)
function toggleTheme() {
    // 라이트 모드 고정 정책에 따라 기능을 실행하지 않거나 항상 light를 유지합니다.
    const html = document.documentElement;
    html.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');

    console.log(`🎨 테마 정책: 라이트 모드 고정`);
}

// 초기 테마 설정 (라이트 모드 고정)
function initTheme() {
    // 항상 라이트 모드로 설정
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
}

// 페이지 로드 전에 테마 적용 (깜빡임 방지)
initTheme();

// ============ 공유/내보내기 기능 ============

/**
 * 내보내기 드롭다운 메뉴 토글
 */
function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    if (menu) {
        menu.classList.toggle('active');
    }
}

// 드롭다운 외부 클릭 시 닫기
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('exportDropdown');
    const menu = document.getElementById('exportMenu');
    if (dropdown && menu && !dropdown.contains(e.target)) {
        menu.classList.remove('active');
    }
});

/**
 * 채팅 내용을 텍스트로 추출
 */
function extractChatText() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return '';

    const messages = chatContainer.querySelectorAll('.message');
    let text = '=== 개원 상담 챗봇 대화 내용 ===\n';
    text += `내보내기 시간: ${new Date().toLocaleString('ko-KR')}\n`;
    text += '━'.repeat(40) + '\n\n';

    messages.forEach((msg) => {
        const isUser = msg.classList.contains('user');
        const role = isUser ? '👤 사용자' : '🤖 AI 컨설턴트';
        const content = msg.querySelector('.message-content')?.textContent || msg.textContent || '';

        text += `${role}:\n${content.trim()}\n\n`;
    });

    text += '━'.repeat(40) + '\n';
    text += '© 오픈닥터 AI 컨설턴트';

    return text;
}

/**
 * 클립보드에 복사
 */
async function exportToClipboard() {
    const text = extractChatText();

    if (!text || text.includes('대화 내용이 없습니다')) {
        showSuccessModal('내보낼 대화가 없습니다.');
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        showSuccessModal('대화 내용이 클립보드에 복사되었습니다!');
    } catch (error) {
        console.error('클립보드 복사 실패:', error);
        showSuccessModal('클립보드 복사에 실패했습니다.');
    }

    // 메뉴 닫기
    document.getElementById('exportMenu')?.classList.remove('active');
}

/**
 * TXT 파일로 저장
 */
function exportToTxt() {
    const text = extractChatText();

    if (!text || text.includes('대화 내용이 없습니다')) {
        showSuccessModal('내보낼 대화가 없습니다.');
        return;
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `개원상담_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showSuccessModal('TXT 파일이 다운로드되었습니다!');

    // 메뉴 닫기
    document.getElementById('exportMenu')?.classList.remove('active');
}

/**
 * PDF 파일로 저장
 */
function exportToPdf() {
    const chatContainer = document.getElementById('chatContainer');

    if (!chatContainer || chatContainer.querySelectorAll('.message').length === 0) {
        showSuccessModal('내보낼 대화가 없습니다.');
        return;
    }

    // PDF 생성용 임시 컨테이너
    const pdfContent = document.createElement('div');
    pdfContent.style.cssText = 'padding: 20px; font-family: sans-serif; max-width: 800px;';

    // 헤더
    const header = document.createElement('div');
    header.innerHTML = `
        <h1 style="color: #536db1; margin-bottom: 10px;">📋 개원 상담 챗봇 대화록</h1>
        <p style="color: #666; font-size: 12px; margin-bottom: 20px;">내보내기 시간: ${new Date().toLocaleString('ko-KR')}</p>
        <hr style="border: 1px solid #e5e7eb; margin-bottom: 20px;">
    `;
    pdfContent.appendChild(header);

    // 메시지 복사
    const messages = chatContainer.querySelectorAll('.message');
    messages.forEach((msg) => {
        const isUser = msg.classList.contains('user');
        const content = msg.querySelector('.message-content')?.innerHTML || msg.innerHTML || '';

        const msgDiv = document.createElement('div');
        msgDiv.style.cssText = `
            margin-bottom: 15px;
            padding: 12px;
            border-radius: 12px;
            background: ${isUser ? '#f0f4ff' : '#f8f9fa'};
            border-left: 4px solid ${isUser ? '#536db1' : '#22c55e'};
        `;
        msgDiv.innerHTML = `
            <strong style="color: ${isUser ? '#536db1' : '#22c55e'};">${isUser ? '👤 사용자' : '🤖 AI 컨설턴트'}</strong>
            <div style="margin-top: 8px; color: #1e293b;">${content}</div>
        `;
        pdfContent.appendChild(msgDiv);
    });

    // 푸터
    const footer = document.createElement('div');
    footer.innerHTML = `
        <hr style="border: 1px solid #e5e7eb; margin-top: 20px;">
        <p style="color: #666; font-size: 11px; text-align: center; margin-top: 10px;">© 오픈닥터 AI 컨설턴트</p>
    `;
    pdfContent.appendChild(footer);

    // PDF 생성
    const opt = {
        margin: 10,
        filename: `개원상담_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(pdfContent).save().then(() => {
        showSuccessModal('PDF 파일이 다운로드되었습니다!');
    });

    // 메뉴 닫기
    document.getElementById('exportMenu')?.classList.remove('active');
}

// ============================================
// 사이드바 토글 (접기/펼치기)
// ============================================

/**
 * 사이드바 접기/펼치기 토글
 */
function toggleSidebar() {
    const sidebar = document.getElementById('historySidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');

        // 상태 저장
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem('sidebarCollapsed', isCollapsed);
    }
}

/**
 * 사이드바 초기 상태 설정
 */
function initSidebarState() {
    const sidebar = document.getElementById('historySidebar');
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

    if (sidebar && isCollapsed) {
        sidebar.classList.add('collapsed');
    }
}

// 페이지 로드 시 사이드바 상태 초기화
document.addEventListener('DOMContentLoaded', initSidebarState);

// ============================================
// 검색 패널
// ============================================

/**
 * 검색 패널 토글
 */
function toggleSearchPanel() {
    const searchPanel = document.getElementById('searchPanel');
    const searchOverlay = document.getElementById('searchOverlay');
    const searchInput = document.getElementById('chatSearchInput');

    if (searchPanel && searchOverlay) {
        const isActive = searchPanel.classList.contains('active');

        if (isActive) {
            searchPanel.classList.remove('active');
            searchOverlay.classList.remove('active');
        } else {
            searchPanel.classList.add('active');
            searchOverlay.classList.add('active');
            // 포커스 설정
            setTimeout(() => searchInput?.focus(), 100);
        }
    }
}

/**
 * 채팅 검색 기능 (세션 제목 + 메시지 내용 검색)
 */
async function searchChats(query) {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    // 검색어가 없으면 최근 대화 표시
    if (!query.trim()) {
        displayRecentChats();
        return;
    }

    // 로딩 표시
    resultsContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
            검색 중...
        </div>
    `;

    // Supabase에서 메시지 검색
    const searchResults = await window.chatHistory?.searchMessages?.(query) || [];

    // 결과 표시
    if (searchResults.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
                검색 결과가 없습니다.
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = searchResults.slice(0, 10).map(result => {
        const { session, matchedMessage } = result;
        const title = escapeHtml(session.title || '새 대화');
        const date = formatSearchDate(session.created_at);

        // 매칭된 메시지 미리보기 (최대 50자)
        let preview = '';
        if (matchedMessage) {
            const cleanMessage = matchedMessage.replace(/<[^>]*>/g, '').trim();
            const highlighted = highlightSearchTerm(cleanMessage.substring(0, 80), query);
            preview = `<div class="search-result-preview">"${highlighted}${cleanMessage.length > 80 ? '...' : ''}"</div>`;
        }

        return `
            <div class="search-result-item" onclick="loadSearchedChat('${session.id}')">
                <div class="search-result-header">
                    <span class="search-result-title">📁 ${title}</span>
                    <span class="search-result-date">${date}</span>
                </div>
                ${preview}
            </div>
        `;
    }).join('');
}

/**
 * 검색어 하이라이트
 */
function highlightSearchTerm(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
    return escaped.replace(regex, '<mark style="background: rgba(0, 112, 243, 0.2); padding: 0 2px; border-radius: 2px;">$1</mark>');
}

/**
 * 정규식 특수문자 이스케이프
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 최근 대화 목록 표시
 */
function displayRecentChats() {
    const resultsContainer = document.getElementById('searchResults');
    if (!resultsContainer) return;

    const sessions = window.chatHistory?.getAllSessions?.() || [];
    const recentSessions = sessions.slice(0, 5);

    if (recentSessions.length === 0) {
        resultsContainer.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 20px;">
                대화 기록이 없습니다.
            </div>
        `;
        return;
    }

    resultsContainer.innerHTML = recentSessions.map(session => `
        <div class="search-result-item" onclick="loadSearchedChat('${session.id}')">
            <span class="search-result-title">${escapeHtml(session.title || '새 대화')}</span>
            <span class="search-result-date">${formatSearchDate(session.created_at)}</span>
        </div>
    `).join('');
}

/**
 * 검색된 채팅 로드
 */
function loadSearchedChat(sessionId) {
    toggleSearchPanel(); // 패널 닫기

    // chat-history.js의 로드 함수 호출
    if (window.chatHistory?.loadSession) {
        window.chatHistory.loadSession(sessionId);
    }
}

/**
 * 검색 날짜 포맷
 */
function formatSearchDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '오늘';
    if (diffDays === 1) return '어제';
    if (diffDays < 7) return `${diffDays}일 전`;

    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

/**
 * HTML 이스케이프
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// FAQ 패널
// ============================================
/**
 * FAQ 패널 토글 (화면 오른쪽에서 슬라이드)
 */
function toggleFaqPanel() {
    const faqPanel = document.getElementById('faqPanel');
    if (faqPanel) {
        faqPanel.classList.toggle('active');
    }
}

// ============================================
// 스트리밍 답변 생성
// ============================================

/**
 * 스트리밍 API 호출 + 타이핑 효과
 * @param {string} userQuery - 사용자 질문
 * @param {Array} contexts - 참고 문서 배열
 * @param {HTMLElement} contentDiv - 렌더링할 div
 * @param {AbortSignal} signal - 취소 시그널
 * @returns {Promise<{text: string, modelName: string, filteredContexts: Array}>}
 */
async function callOpenRouterAPIWithStreaming(userQuery, contexts, contentDiv, signal, rtDocuments = []) {
    // ★ 기존 callOpenRouterAPI에서 systemPrompt 생성 로직 재사용 ★
    const userSpec = getUserSpecialty();
    let contextText = '';

    let filteredContexts = [];
    if (contexts && contexts.length > 0) {
        const maxDocs = Math.min(contexts.length, 30);
        filteredContexts = contexts.slice(0, maxDocs);

        // ★ 스트리밍 문서 목록 점수 로그 ★
        console.log(`   📚 [스트리밍] 최종 문서: ${filteredContexts.length}개`);
        console.log('   📋 문서 목록 (점수 내림차순):');
        filteredContexts.forEach((doc, idx) => {
            const src = doc.source || 'etc';
            const q = (doc.question || '').substring(0, 50);
            const score = doc.score ? doc.score.toFixed(4) : 'N/A';
            const tier = doc.metadata?.tier ? `T${doc.metadata.tier}` : '';
            console.log(`      [${idx + 1}] score=${score} ${tier} (${src}) ${q}${doc.question.length > 50 ? '...' : ''}`);
        });
        const scores = filteredContexts.map(d => d.score || 0);
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
        const stdDev = Math.sqrt(variance);
        console.log(`   📊 점수 분포: 평균=${mean.toFixed(4)}, 표준편차=${stdDev.toFixed(4)}, 최고=${scores[0]?.toFixed(4)}, 최저=${scores[scores.length - 1]?.toFixed(4)}`);

        const formatDoc = (item, idx) => {
            let prefix = `[${idx}]`;
            // tier 태그
            if (item.metadata?.tier) {
                prefix += ` [tier:${item.metadata.tier}]`;
            }
            if (item.specialty && item.specialty !== '공통' && item.specialty !== 'ALL') {
                prefix += ` (특화: ${item.specialty})`;
            }
            return `${prefix} Q: ${item.question}\nA: ${item.answer}`;
        };

        contextText = filteredContexts.map((item, idx) => formatDoc(item, idx)).join('\n\n---\n\n');
    }

    // ★ 진료과 정보 (비스트리밍과 동일)
    let specialtyInfo = '';
    if (userSpec && userSpec.label) {
        specialtyInfo = `사용자는 **${userSpec.label}** 개원을 준비 중입니다.

**[중요] 답변 생성 규칙:**
1. 검색 결과 중 **[${userSpec.label}✓]** 태그가 있는 문서를 **최우선**으로 참고하세요.
2. 태그가 없어도 본문에 ${userSpec.keywords.slice(0, 5).join(', ')} 등 ${userSpec.label} 관련 내용이 있으면 우선 포함하세요.
3. 다른 진료과 내용보다 **${userSpec.label} 관련 정보를 먼저** 설명하세요.
4. 파트너사/의료기기/비용 등의 질문에서도 **${userSpec.label}에 적합한 항목을 우선 추천**하세요.`;
    }

    // ★ 중복 배제 규칙 (비스트리밍과 동일)
    const alreadyMentioned = extractMentionedKeywords();
    let deduplicationRule = '';
    if (alreadyMentioned.length > 0) {
        deduplicationRule = `
# ⛔ 중복 금지 (이미 설명한 항목)
${alreadyMentioned.slice(0, 15).join(', ')}

→ 위 항목은 다시 설명하지 마세요. 새로운 정보만 답변하거나, 없으면 "추가 정보가 없습니다"라고 하세요.
`;
    }

    // 대화 히스토리
    const historyText = chatMemory.getContextPrompt();

    // 첫 대화인지 확인
    const isFirstMessage = !historyText || historyText === '(첫 대화)' || chatMemory.recentBuffer.length === 0;
    const topicGenerationRule = isFirstMessage ? `
# ⭐ 토픽 생성 (첫 대화일 때만)
- 이 대화의 주제를 한글 10자 이내로 요약하여 답변의 **맨 첫 줄**에 다음 형식으로 작성하세요: \`[TOPIC: 주제]\`
- 예시: \`[TOPIC: 임플란트 장비]\`, \`[TOPIC: 인테리어 비용]\`, \`[TOPIC: 세무 상담]\`
- 토픽 태그 다음 줄부터 실제 답변을 시작하세요.
` : '';

    // ★ [v6.5.2] RT 문서 → 프롬프트용 텍스트 변환 ★
    let rtTopicText = '';
    if (rtDocuments.length > 0) {
        rtTopicText = rtDocuments.map((doc, i) =>
            `[RT${i + 1}] Q: ${doc.question}\nA: ${doc.answer}`
        ).join('\n\n');
        console.log(`📝 RT 프롬프트 텍스트 생성: ${rtDocuments.length}개 문서, ${rtTopicText.length}자`);
    }

    const systemPrompt = buildSystemPrompt({ historyText, contextText, specialtyInfo, deduplicationRule, topicGenerationRule, rtTopicText });

    // 타이핑 효과를 위한 변수
    let receivedBuffer = '';  // API에서 받은 전체 텍스트
    let displayedIndex = 0;   // 현재까지 표시된 인덱스
    let typingRAF = null;     // requestAnimationFrame ID
    let streamComplete = false;
    let firstTextReceived = false; // ★ 첫 텍스트 도착 여부
    let modelName = null;
    let lastTypingTime = 0;   // 마지막 타이핑 시간

    const TYPING_SPEED = 15;  // 밀리초 (한 글자당)
    const CHARS_PER_TICK = 2; // 한 번에 추가할 글자 수

    // ★ 백그라운드 탭 복귀 시 밀린 텍스트 즉시 렌더링 ★
    const handleVisibilityChange = () => {
        if (!document.hidden && displayedIndex < receivedBuffer.length) {
            // 탭 복귀 시: 밀린 텍스트 전부 즉시 렌더링 (fast-forward)
            displayedIndex = receivedBuffer.length;
            contentDiv.innerHTML = renderMarkdownSafe(receivedBuffer.substring(0, displayedIndex));
        }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 타이핑 효과 시작 (requestAnimationFrame 기반 - 백그라운드 탭에서도 안정적)
    const startTypingEffect = () => {
        if (typingRAF) return;

        const typingLoop = (timestamp) => {
            if (!lastTypingTime) lastTypingTime = timestamp;
            const elapsed = timestamp - lastTypingTime;

            if (elapsed >= TYPING_SPEED && displayedIndex < receivedBuffer.length) {
                // 경과 시간에 비례하여 글자 수 계산 (밀린 만큼 따라잡기)
                const charsToAdd = Math.max(CHARS_PER_TICK, Math.floor(elapsed / TYPING_SPEED));
                const endIndex = Math.min(displayedIndex + charsToAdd, receivedBuffer.length);
                displayedIndex = endIndex;

                contentDiv.innerHTML = renderMarkdownSafe(receivedBuffer.substring(0, displayedIndex));
                lastTypingTime = timestamp;
            }

            if (displayedIndex < receivedBuffer.length || !streamComplete) {
                typingRAF = requestAnimationFrame(typingLoop);
            } else {
                // 스트림 완료 & 모든 글자 표시 완료
                typingRAF = null;
            }
        };
        typingRAF = requestAnimationFrame(typingLoop);
    };

    try {
        console.log('🌊 스트리밍 API 호출 시작...');

        const response = await fetch('/api/chat-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userQuery: `질문: ${userQuery}`,
                systemPrompt: systemPrompt
            }),
            signal: signal
        });

        if (!response.ok) {
            throw new Error(`스트리밍 API 오류: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // 타이핑 효과 시작
        startTypingEffect();

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                streamComplete = true;
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('event: model')) {
                    continue;
                }
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6).trim();
                    if (jsonStr === '[DONE]') continue;

                    try {
                        const data = JSON.parse(jsonStr);

                        if (data.model) {
                            modelName = data.model;
                            console.log(`🤖 스트리밍 모델: ${modelName}`);
                        }

                        if (data.text) {
                            receivedBuffer += data.text;

                            // ★ 첫 텍스트 도착 시: 인디케이터 숨기고 스트리밍 컨테이너 표시 ★
                            if (!firstTextReceived) {
                                firstTextReceived = true;
                                hideTypingIndicator();
                                // contentDiv의 부모 컨테이너 표시
                                const streamContainer = contentDiv.closest('.message');
                                if (streamContainer) streamContainer.style.display = '';
                            }
                        }
                    } catch (e) {
                        // JSON 파싱 실패 무시
                    }
                }
            }
        }

        // 타이핑 완료 대기
        await new Promise(resolve => {
            const checkComplete = setInterval(() => {
                if (displayedIndex >= receivedBuffer.length) {
                    clearInterval(checkComplete);
                    if (typingRAF) {
                        cancelAnimationFrame(typingRAF);
                        typingRAF = null;
                    }
                    // visibilitychange 리스너 정리
                    document.removeEventListener('visibilitychange', handleVisibilityChange);
                    resolve();
                }
            }, 50);
        });

        console.log('✅ 스트리밍 + 타이핑 완료');

        return {
            text: receivedBuffer,
            modelName: modelName,
            filteredContexts: filteredContexts
        };

    } catch (error) {
        // 타이머 정리
        if (typingRAF) {
            cancelAnimationFrame(typingRAF);
        }
        // visibilitychange 리스너 정리
        document.removeEventListener('visibilitychange', handleVisibilityChange);

        if (error.name === 'AbortError') {
            console.log('✨ 스트리밍 중단됨');
            throw error;
        }
        console.error('스트리밍 에러:', error);
        throw error;
    }
}


/**
 * 스트리밍 메시지 컨테이너 생성
 * @returns {{container: HTMLElement, contentDiv: HTMLElement}}
 */
function createStreamingMessageContainer() {
    const container = document.createElement('div');
    container.className = 'message bot streaming';
    container.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content streaming-content formatted-response"></div>
    `;

    const messagesContainer = document.getElementById('chatContainer');
    messagesContainer.appendChild(container);
    // ★ scrollToBottom 제거 - 사용자 메시지가 상단에 유지되도록 ★

    return {
        container: container,
        contentDiv: container.querySelector('.streaming-content')
    };
}

/**
 * 텍스트에 타이핑 효과 적용 (API 호출 없이 로컬 텍스트 사용)
 * @param {HTMLElement} contentDiv - 렌더링할 div
 * @param {string} text - 표시할 텍스트
 * @returns {Promise<void>}
 */
async function displayWithTypingEffect(contentDiv, text) {
    const TYPING_SPEED = 15;  // 밀리초 (한 글자당)
    const CHARS_PER_TICK = 2; // 한 번에 추가할 글자 수

    // ★ 백그라운드 탭 복귀 시 즉시 완료 ★
    let displayedIndex = 0;
    const handleVisibility = () => {
        if (!document.hidden && displayedIndex < text.length) {
            displayedIndex = text.length;
            contentDiv.innerHTML = renderMarkdownSafe(text);
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return new Promise((resolve) => {
        let lastTime = 0;

        const typingLoop = (timestamp) => {
            if (!lastTime) lastTime = timestamp;
            const elapsed = timestamp - lastTime;

            if (elapsed >= TYPING_SPEED && displayedIndex < text.length) {
                const charsToAdd = Math.max(CHARS_PER_TICK, Math.floor(elapsed / TYPING_SPEED));
                displayedIndex = Math.min(displayedIndex + charsToAdd, text.length);
                contentDiv.innerHTML = renderMarkdownSafe(text.substring(0, displayedIndex));
                lastTime = timestamp;
            }

            if (displayedIndex < text.length) {
                requestAnimationFrame(typingLoop);
            } else {
                document.removeEventListener('visibilitychange', handleVisibility);
                resolve();
            }
        };
        requestAnimationFrame(typingLoop);
    });
}

/**
 * 마크다운을 HTML로 변환 (스트리밍용 - 부분 텍스트에서도 안전하게)
 * v2: 테이블, 번호 리스트, 불렛 리스트 그룹화 지원
 * @param {string} text - 마크다운 텍스트
 * @returns {string} HTML
 */
function renderMarkdownSafe(text) {
    if (!text) return '';

    let processed = text
        // ★ 모든 인용/참고문서 주석 완전 제거 ★
        .replace(/\[(?:ID:\s*)?\d+(?:,\s*\d+)*\]/gi, '')
        .replace(/`\[\d+\]`/g, '')
        .replace(/참고\s*문서\s*\d+\s*번?/gi, '')
        .replace(/문서\s*\d+\s*번?/gi, '')
        .replace(/출처[:\s]*\[?\d+\]?/gi, '')
        .replace(/근거[:\s]*\[?\d+\]?/gi, '')
        .replace(/참조[:\s]*\[?\d+\]?/gi, '')
        .replace(/\[참고\s*\d*\]/gi, '')
        .replace(/\(참고[:\s]*문서?\s*\d+\)/gi, '')
        // [NO_DATA], [OFF_TOPIC] 태그 제거 (스트리밍 중 노출 방지)
        .replace(/\[NO_DATA\]/gi, '')
        .replace(/\[OFF_TOPIC\]/gi, '')
        // [TOPIC: ...] 태그 제거 (스트리밍 중 노출 방지)
        .replace(/\[TOPIC:\s*[^\]]*\]\s*/gi, '')
        // ★ 문자열 \n 을 실제 줄바꿈으로 치환 (AI 할루시네이션 방지) ★
        .replace(/\\n/g, '\n')
        // [RELATED_TOPICS]...[/RELATED_TOPICS] 블록 및 부분 태그 제거
        .replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/gi, '')
        .replace(/\[RELATED_TOPICS\][\s\S]*/gi, '')
        .replace(/\[\/RELATED_TOPICS\]/gi, '')
        .replace(/```[\s\S]*?```/g, '');  // 코드 블록 제거

    // ★ 테이블 처리 (태그 제거 후 안전하게 처리) ★
    processed = processed.replace(/((?:^\|.+\|$\n?)+)/gm, (match) => {
        const lines = match.trim().split('\n').filter(l => l.trim());
        // 구분선(|---|---|)이 없으면 테이블이 아님
        const hasSeparator = lines.some(l => /^\|[\s-:|]+\|$/.test(l.trim()));
        if (!hasSeparator || lines.length < 3) return match;

        let tableHtml = '<div class="markdown-table-wrapper"><table>';
        let headerDone = false;

        lines.forEach(line => {
            // 구분선 라인 건너뛰기
            if (/^\|[\s-:|]+\|$/.test(line.trim())) {
                headerDone = true;
                return;
            }
            const cells = line.split('|').slice(1, -1); // 앞뒤 빈 셀 제거
            if (cells.length === 0) return;

            tableHtml += '<tr>';
            cells.forEach(cell => {
                const tag = !headerDone ? 'th' : 'td';
                // 셀 내부 볼드 처리
                const cellContent = cell.trim().replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                tableHtml += `<${tag}>${cellContent}</${tag}>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</table></div>';
        return tableHtml;
    });

    // ★ 번호 리스트 (1. 2. 3.) + 들여쓰기 서브 항목 처리 ★
    // 순서: 번호 리스트를 먼저 처리 → '1. 항목'이 불렛으로 먹히는 것 방지
    processed = processed.replace(/((?:^\d+\.\s+.+$(?:\n\s{2,}[*\-•]\s+.+$)*\n?)+)/gm, (match) => {
        const lines = match.trim().split('\n').filter(l => l.trim());
        // ★ 첫 번째 항목의 실제 번호를 파싱하여 start 속성 설정 ★
        const firstNumMatch = lines[0].match(/^(\d+)\.\s+/);
        const startNum = firstNumMatch ? parseInt(firstNumMatch[1], 10) : 1;
        let listHtml = `<ol class="response-list" start="${startNum}">`;
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (/^\d+\.\s+/.test(line)) {
                const content = line.replace(/^\d+\.\s+/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                listHtml += `<li>${content}`;
                // 들여쓰기 서브 항목 수집
                let hasSubItems = false;
                while (i + 1 < lines.length && /^\s{2,}[*\-•]\s+/.test(lines[i + 1])) {
                    if (!hasSubItems) { listHtml += '<ul class="response-sublist">'; hasSubItems = true; }
                    i++;
                    const subContent = lines[i].trim().replace(/^[*\-•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    listHtml += `<li>${subContent}</li>`;
                }
                if (hasSubItems) listHtml += '</ul>';
                listHtml += '</li>';
            }
            i++;
        }
        listHtml += '</ol>';
        return listHtml;
    });

    // ★ 불렛 리스트 (줄 시작 - * •) + 들여쓰기 서브 항목 처리 ★
    // 줄 시작(^)에서 바로 시작하는 항목만 최상위로 인식
    processed = processed.replace(/((?:^[*\-•]\s+.+$(?:\n\s{2,}[*\-•]\s+.+$)*\n?)+)/gm, (match) => {
        const lines = match.trim().split('\n').filter(l => l.trim());
        let listHtml = '<ul class="response-list">';
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            if (/^[*\-•]\s+/.test(line) && !/^\s/.test(line)) {
                const content = line.replace(/^[*\-•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                listHtml += `<li>${content}`;
                // 들여쓰기 서브 항목 수집
                let hasSubItems = false;
                while (i + 1 < lines.length && /^\s{2,}[*\-•]\s+/.test(lines[i + 1])) {
                    if (!hasSubItems) { listHtml += '<ul class="response-sublist">'; hasSubItems = true; }
                    i++;
                    const subContent = lines[i].trim().replace(/^[*\-•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                    listHtml += `<li>${subContent}</li>`;
                }
                if (hasSubItems) listHtml += '</ul>';
                listHtml += '</li>';
            }
            i++;
        }
        listHtml += '</ul>';
        return listHtml;
    });

    // ★ 인라인 스타일 처리 ★
    processed = processed
        .replace(/^#{4,5} (.+)$/gm, '<h4 class="response-heading">$1</h4>')
        .replace(/^### (.+)$/gm, '<h4 class="response-heading">$1</h4>')
        .replace(/^## (.+)$/gm, '<h3 class="response-heading">$1</h3>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^---$/gm, '<hr>')
        .replace(/\n/g, '<br>');

    // ★ 불필요한 <br> 정리 (헤딩/리스트/테이블 앞뒤 - 연속 br 모두 제거) ★
    processed = processed
        .replace(/(<br>\s*)+(<h[34])/g, '$2')
        .replace(/(<\/h[34]>)(\s*<br>)+/g, '$1')
        .replace(/(<br>\s*)+(<[ou]l)/g, '$2')
        .replace(/(<\/[ou]l>)(\s*<br>)+/g, '$1')
        .replace(/(<br>\s*)+(<div class="markdown-table)/g, '$2')
        .replace(/(<\/div>)(\s*<br>)+/g, '$1')
        .replace(/(<br>\s*)+(<hr>)/g, '$2')
        .replace(/(<hr>)(\s*<br>)+/g, '$1');

    return processed;
}



/**
 * 스트리밍 메시지 업데이트 (문장 추가)
 * @param {HTMLElement} contentDiv - 콘텐츠 div
 * @param {string} fullText - 현재까지의 전체 텍스트
 */
function updateStreamingMessage(contentDiv, fullText) {
    // 전체 텍스트를 마크다운 렌더링하여 교체
    contentDiv.innerHTML = renderMarkdownSafe(fullText);
    // ★ 스트리밍 중에는 자동 스크롤 안 함 (사용자 질문이 상단에 유지되도록) ★
}

/**
 * 스트리밍 완료 후 최종 포맷팅 적용
 * @param {HTMLElement} container - 메시지 컨테이너
 * @param {string} finalText - 최종 텍스트
 * @param {Array} contexts - 참고 문서
 * @param {string} modelName - 모델명
 */
function finalizeStreamingMessage(container, finalText, contexts, modelName, options = {}) {
    // streaming 클래스 제거
    container.classList.remove('streaming');

    const contentDiv = container.querySelector('.message-content');
    // ★ formatted-response 클래스 보장 (CSS 스타일 통일) ★
    if (contentDiv && !contentDiv.classList.contains('formatted-response')) {
        contentDiv.classList.add('formatted-response');
    }
    let processedText = finalText;

    // ★ NO_DATA / OFF_TOPIC 감지 ★
    let messageType = 'normal';
    // [NO_DATA] 태그 또는 "플래너에게 연락" 문구가 포함되면 NO_DATA로 처리
    let isNoData = processedText.includes('[NO_DATA]') ||
        processedText.includes('플래너에게 연락') ||
        processedText.includes('플래너에게 문의');
    let isOffTopic = processedText.includes('[OFF_TOPIC]');

    if (isOffTopic) {
        messageType = 'off_topic';
        processedText = processedText.replace('[OFF_TOPIC]', '').trim();
    } else if (isNoData) {
        messageType = 'no_data';
        processedText = processedText.replace('[NO_DATA]', '').trim();
    }



    // [TOPIC] 태그 처리
    const topicMatch = processedText.match(/\[TOPIC:\s*([^\]]+)\]/);
    if (topicMatch && topicMatch[1]) {
        const topic = topicMatch[1].trim();
        if (typeof updateCurrentSessionTitle === 'function') {
            updateCurrentSessionTitle(topic);
        }
        processedText = processedText.replace(/\[TOPIC:\s*[^\]]+\]\n?/, '').trim();
    }

    // [RELATED_TOPICS] 추출 (파이프 + 줄바꿈 불렛 둘 다 지원)
    let relatedTopics = [];
    const topicsMatch = processedText.match(/\[RELATED_TOPICS\]([\s\S]*?)\[\/RELATED_TOPICS\]/);
    if (topicsMatch) {
        const topicsBlock = topicsMatch[1].trim();
        if (topicsBlock.includes('|')) {
            relatedTopics = topicsBlock.split('|').map(t => t.trim()).filter(t => t.length > 0);
        } else {
            relatedTopics = topicsBlock.split('\n').map(line => line.replace(/^[-•*]\s*/, '').trim()).filter(line => line.length > 0);
        }
        processedText = processedText.replace(/\[RELATED_TOPICS\][\s\S]*?\[\/RELATED_TOPICS\]/, '').trim();
    }

    // 마크다운 렌더링 (renderMarkdownSafe가 인용 제거도 포함)
    let html = renderMarkdownSafe(processedText);

    // ★ RT 처리 (skipRT 옵션이 없을 때만) ★
    if (!options.skipRT) {
        // ★ [v6.5.2] 기존 RT 자동 삽입 폴백 주석 처리 — 신규 RT 시스템에서는 LLM이 직접 생성 ★
        // if (relatedTopics.length === 0 && typeof findRelatedAnchorTopics === 'function') {
        //     const currentQ = window.currentQuestion || '';
        //     const autoTopics = findRelatedAnchorTopics(currentQ, 3);
        //     if (autoTopics.length > 0) {
        //         relatedTopics = autoTopics;
        //         console.log('🔄 RT 자동 삽입:', relatedTopics);
        //     }
        // }

        // 시스템용 버튼 생성 데이터만 추출 (관련 주제 버튼 클릭 시 사용)
        if (relatedTopics.length > 0) {
            relatedTopics.forEach(topic => {
                // 본문의 **주제**를 클릭 가능한 버튼으로 변환
                const escapedTopic = topic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`<strong>${escapedTopic}</strong>`, 'gi');
                const clickableLink = `<strong class="clickable-topic" onclick="sendRelatedTopic('${escapeHtml(topic.replace(/'/g, "\\'"))}')"> ${escapeHtml(topic)}</strong>`;
                html = html.replace(regex, clickableLink);

                if (typeof chatMemory !== 'undefined' && chatMemory.addUsedTopic) {
                    chatMemory.addUsedTopic(topic);
                }
            });
        }
    }

    // 피드백 버튼 + 복사 버튼 추가
    const messageId = Date.now();
    let feedbackButtons = `
        <div class="feedback-buttons" data-message-id="${messageId}">
            <button class="feedback-btn good" onclick="openFeedbackModal('good', ${messageId})">👍 Good</button>
            <button class="feedback-btn bad" onclick="openFeedbackModal('bad', ${messageId})">👎 Bad</button>
            <button class="feedback-btn copy" onclick="copyMessageToClipboard(${messageId}, this)" title="복사하기"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
        </div>
    `;

    // ★ NO_DATA일 경우 플래너 버튼 추가 ★
    let plannerButton = '';
    if (isNoData) {
        plannerButton = `
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
                margin-top: 16px;
                margin-bottom: 16px;
            ">
                <span style="font-size: 16px;">☎️</span> 플래너에게 연락하기
            </button>
        `;
    }



    // 질문/답변 + 맥락 + 검색로그 저장 (피드백용)
    window.lastMessages = window.lastMessages || {};
    const searchLog = {
        queryPlan: window._lastQueryPlan ? {
            intent: window._lastQueryPlan.intent,
            topic: window._lastQueryPlan.topic,
            subIntent: window._lastQueryPlan.subIntent,
            coreKeywords: window._lastQueryPlan.coreKeywords
        } : null,
        docs: (contexts || []).map((doc, idx) => ({
            rank: idx + 1,
            name: (doc.question || '').substring(0, 80),
            score: doc.score ? parseFloat(doc.score.toFixed(4)) : 0,
            tier: doc.metadata?.tier || null
        }))
    };
    window.lastMessages[messageId] = {
        question: window.currentQuestion || '',
        answer: finalText,
        contexts: contexts,
        messageType: messageType,
        searchLog: searchLog
    };

    contentDiv.innerHTML = html + plannerButton + feedbackButtons;

    // ★ Gemini 스타일 패딩 복원 (스트리밍 완료 후) ★
    chatContainer.style.paddingBottom = '24px';
}

