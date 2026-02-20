// ChatMemory 세션 분리 테스트

// ChatMemory 클래스 복사 (script.js에서 가져옴)
class ChatMemory {
    constructor() {
        this.sessionMemories = {};
        this.currentSessionId = null;
    }

    setSession(sessionId) {
        this.currentSessionId = sessionId;
        if (!this.sessionMemories[sessionId]) {
            this.sessionMemories[sessionId] = {
                recentBuffer: [],
                contextSummary: '',
                isSummarizing: false,
                usedTopics: []
            };
            console.log(`🧠 [ChatMemory] 새 세션 메모리 생성: ${sessionId}`);
        } else {
            console.log(`🧠 [ChatMemory] 세션 전환: ${sessionId} (기존 대화 ${this.sessionMemories[sessionId].recentBuffer.length}턴 복원)`);
        }
    }

    get currentMemory() {
        if (!this.currentSessionId || !this.sessionMemories[this.currentSessionId]) {
            return { recentBuffer: [], contextSummary: '', isSummarizing: false, usedTopics: [] };
        }
        return this.sessionMemories[this.currentSessionId];
    }

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

    getContextPrompt() {
        let prompt = "";
        if (this.contextSummary) {
            prompt += `[이전 대화 요약]:\n${this.contextSummary}\n\n`;
        }
        if (this.recentBuffer.length > 0) {
            prompt += `[최근 대화]:\n${this.recentBuffer.map(h => `Q: ${h.user}\nA: ${h.assistant}`).join('\n')}\n`;
        }
        return prompt || '(첫 대화)';
    }

    addTurn(userMsg, botMsg) {
        if (!this.currentSessionId) {
            console.warn('⚠️ 세션이 설정되지 않음');
            return;
        }
        this.recentBuffer.push({ user: userMsg, assistant: botMsg });
        console.log(`🧠 대화 저장: ${this.recentBuffer.length}턴 (세션: ${this.currentSessionId})`);
    }
}

// ========== 테스트 시작 ==========
console.log('='.repeat(50));
console.log('ChatMemory 세션 분리 테스트');
console.log('='.repeat(50));

const chatMemory = new ChatMemory();

// 세션 A 생성 및 대화
console.log('\n--- 세션 A 생성 ---');
chatMemory.setSession('session-A-12345');
chatMemory.addTurn('인테리어 비용이 얼마야?', '인테리어 비용은 평당 200~500만원입니다.');
chatMemory.addTurn('치과 개원 절차는?', '치과 개원은 1) 입지 선정 2) 인테리어 3) 장비 구매 순서입니다.');

console.log('\n세션 A 맥락:');
console.log(chatMemory.getContextPrompt().substring(0, 300));

// 세션 B로 전환
console.log('\n--- 세션 B로 전환 ---');
chatMemory.setSession('session-B-67890');

console.log('\n세션 B 맥락 (새 세션):');
console.log(chatMemory.getContextPrompt());

// 세션 B에서 대화
chatMemory.addTurn('간판 설치 비용은?', '간판 설치는 300~800만원 정도입니다.');

console.log('\n세션 B 맥락 (대화 후):');
console.log(chatMemory.getContextPrompt());

// 다시 세션 A로 전환
console.log('\n--- 다시 세션 A로 전환 ---');
chatMemory.setSession('session-A-12345');

console.log('\n세션 A 맥락 (복원됨):');
console.log(chatMemory.getContextPrompt().substring(0, 300));

// 검증
console.log('\n='.repeat(50));
console.log('검증 결과:');
console.log('='.repeat(50));

const sessionA = chatMemory.sessionMemories['session-A-12345'];
const sessionB = chatMemory.sessionMemories['session-B-67890'];

console.log('세션 A recentBuffer 길이:', sessionA.recentBuffer.length, '(예상: 2)');
console.log('세션 B recentBuffer 길이:', sessionB.recentBuffer.length, '(예상: 1)');
console.log('세션 A 첫 질문:', sessionA.recentBuffer[0]?.user?.substring(0, 20));
console.log('세션 B 첫 질문:', sessionB.recentBuffer[0]?.user?.substring(0, 20));

const passed = sessionA.recentBuffer.length === 2 &&
    sessionB.recentBuffer.length === 1 &&
    sessionA.recentBuffer[0].user.includes('인테리어') &&
    sessionB.recentBuffer[0].user.includes('간판');

console.log('\n✅ 테스트 결과:', passed ? 'PASSED - 세션 분리 정상!' : '❌ FAILED - 세션 분리 문제!');
