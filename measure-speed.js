// 각 Stage별 응답 시간 측정 스크립트
require('dotenv').config();

const BASE_URL = 'http://localhost:3002';

async function measureStages() {
    const userQuery = '인테리어 파트너사';
    console.log('🔬 속도 측정 시작');
    console.log('📝 질문:', userQuery);
    console.log('='.repeat(60));

    const totalStart = Date.now();

    // ========== Stage 1: Query Planning ==========
    console.log('\n🧠 Stage 1: Query Planning...');
    const stage1Start = Date.now();

    const planResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: userQuery,
            mode: 'plan',
            userSpecialty: { code: 'derma', label: '피부과', keywords: ['피부', '레이저', '미용'] },
            recentContext: ''
        })
    });

    const planResult = await planResponse.json();
    const stage1Time = Date.now() - stage1Start;

    console.log(`   ✅ 완료: ${stage1Time}ms`);
    console.log(`   📊 Intent: ${planResult.plan?.intent}`);
    console.log(`   📊 Model: ${planResult.modelName}`);
    console.log(`   📊 Keywords: ${planResult.plan?.coreKeywords?.join(', ')}`);

    // ========== Stage 2: Smart Search ==========
    console.log('\n🔍 Stage 2: Smart Search...');
    const stage2Start = Date.now();

    const searchResponse = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            queryPlan: planResult.plan,
            maxResults: 30,
            userSpecialty: { code: 'derma', label: '피부과' }
        })
    });

    const searchResult = await searchResponse.json();
    const stage2Time = Date.now() - stage2Start;

    console.log(`   ✅ 완료: ${stage2Time}ms`);
    console.log(`   📊 문서 개수: ${searchResult.results?.length || 0}개`);

    // ========== Stage 3: Answer Generation ==========
    console.log('\n💬 Stage 3: Answer Generation...');
    const stage3Start = Date.now();

    // 참고문서 구성
    const contexts = searchResult.results || [];
    let contextText = contexts.slice(0, 30).map((item, idx) =>
        `[${idx + 1}] Q: ${item.question}\nA: ${item.answer.substring(0, 1000)}`
    ).join('\n\n');

    const systemPrompt = `당신은 병원 개원 전문 AI 컨설턴트입니다.

# 참고문서
${contextText}

# 규칙
1. 참고문서 기반으로 답변
2. 간결하게 답변`;

    const answerResponse = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: `질문: ${userQuery}`,
            systemPrompt: systemPrompt
        })
    });

    const answerResult = await answerResponse.json();
    const stage3Time = Date.now() - stage3Start;

    console.log(`   ✅ 완료: ${stage3Time}ms`);
    console.log(`   📊 Model: ${answerResult.modelName}`);
    console.log(`   📊 응답 길이: ${answerResult.text?.length || 0}자`);

    // ========== 결과 요약 ==========
    const totalTime = Date.now() - totalStart;

    console.log('\n' + '='.repeat(60));
    console.log('📊 시간 분석 결과');
    console.log('='.repeat(60));
    console.log(`   Stage 1 (Query Planning):     ${stage1Time}ms (${(stage1Time / totalTime * 100).toFixed(1)}%)`);
    console.log(`   Stage 2 (Smart Search):       ${stage2Time}ms (${(stage2Time / totalTime * 100).toFixed(1)}%)`);
    console.log(`   Stage 3 (Answer Generation):  ${stage3Time}ms (${(stage3Time / totalTime * 100).toFixed(1)}%)`);
    console.log('─'.repeat(60));
    console.log(`   총 시간:                      ${totalTime}ms`);
    console.log('='.repeat(60));

    // 병목 분석
    console.log('\n⚠️ 병목 분석:');
    const stages = [
        { name: 'Stage 1', time: stage1Time },
        { name: 'Stage 2', time: stage2Time },
        { name: 'Stage 3', time: stage3Time }
    ].sort((a, b) => b.time - a.time);

    console.log(`   🔴 가장 느림: ${stages[0].name} (${stages[0].time}ms)`);
    if (stages[0].time > 3000) {
        console.log(`   💡 권장: ${stages[0].name} 최적화 필요`);
    }

    // 응답 미리보기
    console.log('\n📝 응답 미리보기 (처음 300자):');
    console.log(answerResult.text?.substring(0, 300) + '...');
}

measureStages().catch(console.error);
