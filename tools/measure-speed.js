// 각 Stage별 응답 시간 측정 스크립트 v2
require('dotenv').config();

const BASE_URL = 'http://localhost:3003';

async function measureStages() {
    const userQuery = '인테리어 파트너사 추천해줘';
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

    // ========== Stage 2: Smart Search (직접 키워드로) ==========
    console.log('\n🔍 Stage 2: Smart Search...');
    const stage2Start = Date.now();

    // 직접 queryPlan 구성해서 검색
    const queryPlan = {
        intent: 'SPECIFIC',
        subIntent: '파트너사목록',
        topic: '인테리어',
        coreKeywords: ['인테리어', '파트너사', '추천'],
        expandedKeywords: ['업체', '비용', '견적'],
        searchStrategy: 'broad'
    };

    const searchResponse = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            queryPlan: queryPlan,
            maxResults: 30,
            userSpecialty: { code: 'derma', label: '피부과' }
        })
    });

    const searchResult = await searchResponse.json();
    const stage2Time = Date.now() - stage2Start;

    const docCount = searchResult.results?.length || 0;
    console.log(`   ✅ 완료: ${stage2Time}ms`);
    console.log(`   📊 문서 개수: ${docCount}개`);

    // ========== Stage 3: Answer Generation ==========
    console.log('\n💬 Stage 3: Answer Generation...');
    const stage3Start = Date.now();

    // 참고문서 구성 (실제 문서가 없으면 더미 데이터)
    let contexts = searchResult.results || [];

    if (contexts.length === 0) {
        // 더미 데이터로 토큰 비용 시뮬레이션
        contexts = Array(30).fill(null).map((_, i) => ({
            question: `인테리어 관련 질문 ${i + 1}`,
            answer: '인테리어 업체 추천으로는 플랜디자인, 인투익스, 무아디자인 등이 있습니다. 평당 비용은 약 150-200만원 선이며, 진료과에 따라 달라질 수 있습니다. '.repeat(3)
        }));
        console.log('   ⚠️ 더미 데이터 30개로 시뮬레이션');
    }

    let contextText = contexts.slice(0, 30).map((item, idx) =>
        `[${idx + 1}] Q: ${item.question}\nA: ${item.answer?.substring(0, 500) || ''}`
    ).join('\n\n');

    const systemPrompt = `당신은 병원 개원 전문 AI 컨설턴트입니다.

# 사용자 진료과
사용자는 **피부과** 개원을 준비 중입니다.

# 참고문서
${contextText}

# 규칙
1. 참고문서 기반으로 답변
2. 간결하게 답변
3. 인용 번호 사용`;

    console.log(`   📊 System Prompt 길이: ${systemPrompt.length}자`);

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
    console.log(`   총 시간:                      ${totalTime}ms (${(totalTime / 1000).toFixed(1)}초)`);
    console.log('='.repeat(60));

    // 병목 분석
    console.log('\n⚠️ 병목 분석:');
    const stages = [
        { name: 'Stage 1', time: stage1Time },
        { name: 'Stage 2', time: stage2Time },
        { name: 'Stage 3', time: stage3Time }
    ].sort((a, b) => b.time - a.time);

    stages.forEach((s, i) => {
        const icon = i === 0 ? '🔴' : (s.time > 3000 ? '🟡' : '🟢');
        console.log(`   ${icon} ${s.name}: ${s.time}ms`);
    });

    // 최적화 제안
    console.log('\n💡 최적화 제안:');
    if (stage1Time > 5000) {
        console.log('   - Stage 1: 더 빠른 모델 사용 또는 프롬프트 축소');
    }
    if (stage3Time > 5000) {
        console.log('   - Stage 3: 문서 개수 축소 (30→15개) 또는 스트리밍');
    }
}

measureStages().catch(console.error);
