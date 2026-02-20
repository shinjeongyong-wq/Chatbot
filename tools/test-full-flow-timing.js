/**
 * 실제 환경 전체 플로우 시간 측정
 * Stage 1 (Query Planning) + Stage 2 (Search) + Stage 3 (Answer Generation)
 */

const questions = [
    "인테리어 비용이 궁금해요",
    "그럼 업체 추천해주세요",
    "계약 시 주의사항은?"
];

let conversationHistory = [];  // 대화 히스토리 누적

async function measureStage1(userQuery, context) {
    const start = Date.now();

    const response = await fetch('http://localhost:3002/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            mode: 'planner',
            userQuery: userQuery,
            systemPrompt: `[대화 맥락]:
${context || '(첫 대화)'}

사용자 질문을 분석하여 JSON 형식으로 반환하세요.`
        })
    });

    const data = await response.json();
    return { elapsed: Date.now() - start, plan: data };
}

async function measureStage2(userQuery) {
    const start = Date.now();

    const response = await fetch('http://localhost:3002/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            query: userQuery,
            limit: 30
        })
    });

    const data = await response.json();
    return { elapsed: Date.now() - start, results: data.results?.length || 0 };
}

async function measureStage3(userQuery, context, searchResults) {
    const start = Date.now();

    // 검색 결과를 컨텍스트로 포맷팅
    let contextText = "";
    if (searchResults && searchResults.length > 0) {
        contextText = searchResults.slice(0, 10).map((r, i) =>
            `[${i + 1}] Q: ${r.question?.substring(0, 50)}...\nA: ${r.answer?.substring(0, 200)}...`
        ).join('\n\n');
    }

    const response = await fetch('http://localhost:3002/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: userQuery,
            systemPrompt: `당신은 병원 개원 컨설팅 AI입니다.

[대화 맥락]:
${context || '(첫 대화)'}

[참고 문서]:
${contextText || '(검색 결과 없음)'}

간결하게 답변하세요.`
        })
    });

    const data = await response.json();
    return { elapsed: Date.now() - start, answer: data.text?.substring(0, 100) };
}

async function runFullFlowTest() {
    console.log("=".repeat(70));
    console.log("📊 실제 환경 전체 플로우 시간 측정 (Stage 1 + 2 + 3)");
    console.log("=".repeat(70));

    const results = [];

    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const context = conversationHistory.map(h => `Q: ${h.q}\nA: ${h.a}`).join('\n');

        console.log(`\n${"─".repeat(70)}`);
        console.log(`🔹 질문 ${i + 1}: "${question}"`);
        console.log(`   맥락 길이: ${context.length}자`);

        const totalStart = Date.now();

        // Stage 1: Query Planning
        console.log("   ⏱️ Stage 1 (Query Planning)...");
        const s1 = await measureStage1(question, context);
        console.log(`   ✅ Stage 1: ${s1.elapsed}ms`);

        // Stage 2: Search
        console.log("   ⏱️ Stage 2 (Smart Search)...");
        const s2 = await measureStage2(question);
        console.log(`   ✅ Stage 2: ${s2.elapsed}ms (${s2.results}개 문서)`);

        // Stage 3: Answer Generation
        console.log("   ⏱️ Stage 3 (Answer Generation)...");
        const s3 = await measureStage3(question, context, []);
        console.log(`   ✅ Stage 3: ${s3.elapsed}ms`);

        const totalTime = Date.now() - totalStart;
        console.log(`   📈 총 소요: ${totalTime}ms`);

        // 히스토리 누적
        conversationHistory.push({ q: question, a: s3.answer || '답변' });

        results.push({
            question: i + 1,
            contextLen: context.length,
            stage1: s1.elapsed,
            stage2: s2.elapsed,
            stage3: s3.elapsed,
            total: totalTime
        });
    }

    console.log("\n" + "=".repeat(70));
    console.log("📊 결과 요약");
    console.log("=".repeat(70));
    console.log("\n| 질문 | 맥락(자) | Stage1 | Stage2 | Stage3 | 총합 |");
    console.log("|------|----------|--------|--------|--------|------|");
    results.forEach(r => {
        console.log(`| ${r.question}    | ${r.contextLen.toString().padStart(8)} | ${(r.stage1 + 'ms').padStart(6)} | ${(r.stage2 + 'ms').padStart(6)} | ${(r.stage3 + 'ms').padStart(6)} | ${(r.total + 'ms').padStart(6)} |`);
    });

    // 평균 계산
    const avgS1 = Math.round(results.reduce((a, r) => a + r.stage1, 0) / results.length);
    const avgS2 = Math.round(results.reduce((a, r) => a + r.stage2, 0) / results.length);
    const avgS3 = Math.round(results.reduce((a, r) => a + r.stage3, 0) / results.length);
    const avgTotal = Math.round(results.reduce((a, r) => a + r.total, 0) / results.length);

    console.log(`\n📈 평균 소요 시간:`);
    console.log(`   Stage 1 (Query Planning): ${avgS1}ms`);
    console.log(`   Stage 2 (Smart Search):   ${avgS2}ms`);
    console.log(`   Stage 3 (Answer Gen):     ${avgS3}ms`);
    console.log(`   총 평균:                  ${avgTotal}ms`);

    // 병목 분석
    const bottleneck = avgS1 > avgS2 && avgS1 > avgS3 ? 'Stage 1' :
        avgS2 > avgS1 && avgS2 > avgS3 ? 'Stage 2' : 'Stage 3';
    console.log(`\n🚨 현재 병목: ${bottleneck}`);
}

runFullFlowTest().catch(console.error);
