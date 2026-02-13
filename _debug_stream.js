// 간단한 3턴 디버그: userQuery vs 실제 답변 확인
const BASE_URL = 'http://localhost:3003';

async function callStream(userQuery, systemPrompt) {
    const res = await fetch(`${BASE_URL}/api/chat-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery: `질문: ${userQuery}`, systemPrompt })
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let answer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && !trimmed.includes('"model"')) {
                try {
                    const p = JSON.parse(trimmed.slice(6));
                    if (p.text) answer += p.text;
                } catch (e) { }
            }
        }
    }
    return answer;
}

async function main() {
    const questions = [
        '인테리어 업체 추천해주세요',
        '간판 업체 추천해주세요',
        '개원 비용 알려주세요',
    ];

    for (const q of questions) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📤 SENDING: "${q}"`);

        // 간단한 프롬프트 (히스토리 없음)
        const prompt = `당신은 병원 개원 전문 AI 컨설턴트입니다. 질문에만 답변하세요. 첫 줄은 핵심 결론을 한 문장으로 작성하세요.\n\n# 이전 대화\n(첫 대화)\n\n# 참고문서\n(관련 데이터 없음)`;

        const answer = await callStream(q, prompt);
        console.log(`📥 ANSWER FIRST 100 chars:`);
        console.log(`   "${answer.substring(0, 100)}"`);
        console.log(`   TOTAL: ${answer.length}자`);

        // 3초 대기
        await new Promise(r => setTimeout(r, 3000));
    }
}

main().catch(console.error);
