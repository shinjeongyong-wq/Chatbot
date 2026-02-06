/**
 * 유사 질문 캐시 키 테스트 (상세 로그)
 */

const crypto = require('crypto');

const similarQuestionSets = [
    {
        name: "인테리어 비용",
        questions: ["인테리어 비용 얼마야?", "인테리어 비용 알려줘"]
    },
    {
        name: "인테리어 파트너사",
        questions: ["인테리어 파트너사 누구 있어?", "인테리어 업체 추천해줘"]
    }
];

function generateCacheKey(queryPlan) {
    const topicSorted = [...(queryPlan.topic || [])].sort();
    const subIntentSorted = [...(queryPlan.subIntent || [])].sort();

    const keyData = {
        topic: topicSorted,
        subIntent: subIntentSorted,
        specialty: 'none',
        hasContext: false
    };

    return crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex').substring(0, 16);
}

async function getQueryPlan(question) {
    const response = await fetch('http://localhost:3002/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userQuery: question, mode: 'plan' })
    });
    const result = await response.json();
    return result.success ? result.queryPlan : null;
}

async function runTest() {
    console.log('🧪 유사 질문 캐시 키 테스트 (상세)\n');

    for (const set of similarQuestionSets) {
        console.log(`\n📋 ${set.name}`);
        console.log('='.repeat(50));

        const results = [];
        for (const q of set.questions) {
            const plan = await getQueryPlan(q);
            if (plan) {
                const key = generateCacheKey(plan);
                results.push({ q, key, plan });

                console.log(`\n질문: "${q}"`);
                console.log(`   topic: ${JSON.stringify(plan.topic)}`);
                console.log(`   subIntent: ${plan.subIntent}`);
                console.log(`   targetCategory: ${plan.targetCategory}`);
                console.log(`   캐시키: ${key}`);
            }
        }

        // 비교
        if (results.length >= 2) {
            const key1 = results[0].key;
            const key2 = results[1].key;

            console.log(`\n🔍 비교:`);
            console.log(`   키1: ${key1}`);
            console.log(`   키2: ${key2}`);
            console.log(`   일치: ${key1 === key2 ? '✅' : '❌'}`);

            if (key1 !== key2) {
                console.log(`\n⚠️ 차이점:`);
                const p1 = results[0].plan;
                const p2 = results[1].plan;

                if (JSON.stringify(p1.topic) !== JSON.stringify(p2.topic)) {
                    console.log(`   topic 다름: ${JSON.stringify(p1.topic)} vs ${JSON.stringify(p2.topic)}`);
                }
                if (p1.subIntent !== p2.subIntent) {
                    console.log(`   subIntent 다름: ${p1.subIntent} vs ${p2.subIntent}`);
                }
            }
        }
    }
}

runTest().catch(e => console.error(e.message));
