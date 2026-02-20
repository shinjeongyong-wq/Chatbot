// Query Plan 캐시 키 검증 테스트
require('dotenv').config();

const BASE_URL = 'http://localhost:3002';

async function getQueryPlan(question) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: question,
            mode: 'plan',
            userSpecialty: { code: 'derma', label: '피부과' }
        })
    });
    const { plan } = await res.json();
    return plan;
}

function generateCacheKey(plan, specialty) {
    const topicSorted = [...(plan.topic || [])].sort();
    const subIntentSorted = [...(plan.subIntent || [])].sort();

    return JSON.stringify({
        topic: topicSorted,
        subIntent: subIntentSorted,
        specialty: specialty
    });
}

async function test() {
    const questions = [
        "인테리어 비용",
        "인테리어 하는데 보통 얼마나 들어?",
        "인테리어 비용이 궁금해요",
        "병원 인테리어 평당 단가 알려줘",
        "인테리어 파트너사 추천해줘",
        "인테리어 업체 누구 있어?"
    ];

    console.log('='.repeat(80));
    console.log('Query Plan 캐시 키 검증');
    console.log('='.repeat(80));

    const results = [];

    for (const q of questions) {
        const plan = await getQueryPlan(q);
        const cacheKey = generateCacheKey(plan, 'derma');

        results.push({
            question: q,
            topic: plan.topic,
            subIntent: plan.subIntent,
            cacheKey: cacheKey
        });

        console.log(`\n질문: "${q}"`);
        console.log(`  topic: ${JSON.stringify(plan.topic)}`);
        console.log(`  subIntent: ${JSON.stringify(plan.subIntent)}`);
        console.log(`  캐시 키: ${cacheKey.substring(0, 50)}...`);
    }

    // 같은 캐시 키끼리 그룹화
    console.log('\n' + '='.repeat(80));
    console.log('캐시 키 그룹 (같은 키 = 캐시 히트 가능)');
    console.log('='.repeat(80));

    const groups = {};
    results.forEach(r => {
        if (!groups[r.cacheKey]) groups[r.cacheKey] = [];
        groups[r.cacheKey].push(r.question);
    });

    Object.entries(groups).forEach(([key, questions], idx) => {
        console.log(`\n그룹 ${idx + 1} (${questions.length}개):`);
        questions.forEach(q => console.log(`  - "${q}"`));
    });
}

test().catch(console.error);
