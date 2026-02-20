// 카테고리별 쿼터 확인 테스트
require('dotenv').config();

const BASE_URL = 'http://localhost:3003';

async function test() {
    const query = '개원 프로세스 알려주고, 인테리어 파트너사 추천해줘';

    const planRes = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery: query, mode: 'plan', userSpecialty: { code: 'derma', label: '피부과' } })
    });
    const { plan } = await planRes.json();

    console.log('targetCategory:', plan.targetCategory);

    const searchRes = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', queryPlan: plan, maxResults: 30, userSpecialty: { code: 'derma', label: '피부과' } })
    });
    const { results } = await searchRes.json();

    console.log(`\n총 ${results.length}개 결과\n`);

    // 카테고리별로 그룹화
    const byCategory = {};
    results.forEach((r, i) => {
        const cat = r.metadata?.structuredCategory || r.metadata?.categoryPath || 'unknown';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push({ rank: i + 1, score: r.score, question: r.question?.substring(0, 30) });
    });

    console.log('📊 카테고리별 분포:');
    for (const [cat, docs] of Object.entries(byCategory)) {
        console.log(`\n[${cat}] - ${docs.length}개`);
        docs.forEach(d => console.log(`   순위 ${d.rank}: ${d.score.toFixed(3)} | ${d.question}`));
    }
}

test().catch(console.error);
