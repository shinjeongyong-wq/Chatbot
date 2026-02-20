/**
 * 각 Stage별 응답 시간 측정 테스트
 * 3개 질문을 연달아 전송하며 시간 측정
 */

const questions = [
    "인테리어 비용이 궁금해요",
    "그럼 업체 추천해주세요",
    "계약 시 주의사항은?"
];

let sessionContext = "";  // 맥락 누적용

async function testStage1(userQuery, context) {
    const start = Date.now();

    const response = await fetch('http://localhost:3002/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: 'planner',
            userQuery: userQuery,
            systemPrompt: `당신은 병원 개원 컨설팅 AI입니다.
            
[대화 맥락]:
${context || '(첫 대화)'}

사용자 질문을 분석하여 검색 전략을 JSON으로 반환하세요.`
        })
    });

    const data = await response.json();
    const elapsed = Date.now() - start;

    return { elapsed, data };
}

async function testStage3(userQuery, context) {
    const start = Date.now();

    const response = await fetch('http://localhost:3002/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: userQuery,
            systemPrompt: `당신은 병원 개원 컨설팅 AI입니다. 간단히 답변하세요.
            
[대화 맥락]:
${context || '(첫 대화)'}

질문에 간단히 답변하세요.`
        })
    });

    const data = await response.json();
    const elapsed = Date.now() - start;

    return { elapsed, answer: data.text?.substring(0, 100) };
}

async function runTest() {
    console.log("=".repeat(60));
    console.log("📊 Stage별 응답 시간 측정 테스트");
    console.log("=".repeat(60));

    const results = [];

    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        console.log(`\n🔹 질문 ${i + 1}: "${question}"`);
        console.log(`   맥락 길이: ${sessionContext.length}자`);

        // Stage 1: Query Planning
        console.log("   ⏱️ Stage 1 (Query Planning) 시작...");
        const stage1 = await testStage1(question, sessionContext);
        console.log(`   ✅ Stage 1 완료: ${stage1.elapsed}ms`);

        // Stage 3: Answer Generation
        console.log("   ⏱️ Stage 3 (Answer Generation) 시작...");
        const stage3 = await testStage3(question, sessionContext);
        console.log(`   ✅ Stage 3 완료: ${stage3.elapsed}ms`);

        // 맥락 누적
        sessionContext += `\nQ: ${question}\nA: ${stage3.answer || '답변생성됨'}\n`;

        results.push({
            question: i + 1,
            contextLength: sessionContext.length,
            stage1: stage1.elapsed,
            stage3: stage3.elapsed,
            total: stage1.elapsed + stage3.elapsed
        });

        console.log(`   📈 총 소요: ${stage1.elapsed + stage3.elapsed}ms`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("📊 결과 요약");
    console.log("=".repeat(60));
    console.log("\n| 질문 | 맥락(자) | Stage1 | Stage3 | 총합 |");
    console.log("|------|----------|--------|--------|------|");
    results.forEach(r => {
        console.log(`| ${r.question}    | ${r.contextLength.toString().padStart(8)} | ${(r.stage1 + 'ms').padStart(6)} | ${(r.stage3 + 'ms').padStart(6)} | ${(r.total + 'ms').padStart(6)} |`);
    });

    console.log("\n💡 분석:");
    console.log(`   - 맥락이 ${results[0].contextLength}자 → ${results[2].contextLength}자로 증가`);
    console.log(`   - Stage 1 시간 변화: ${results[0].stage1}ms → ${results[2].stage1}ms`);
    console.log(`   - Stage 3 시간 변화: ${results[0].stage3}ms → ${results[2].stage3}ms`);
}

runTest().catch(console.error);
