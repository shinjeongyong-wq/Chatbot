// Stage 2 속도 측정 테스트

const queryPlan = {
    intent: 'SPECIFIC',
    subIntent: '정보요청',
    topic: '인테리어',
    coreKeywords: ['인테리어', '비용'],
    expandedKeywords: ['평당', '견적'],
    searchStrategy: 'broad',
    requiresSearch: true
};

console.log('🔍 Stage 2 속도 측정 시작...');

const start = Date.now();

fetch('http://localhost:3002/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        action: 'search',
        queryPlan: queryPlan,
        maxResults: 30,
        userSpecialty: null
    })
})
    .then(res => res.json())
    .then(data => {
        const elapsed = Date.now() - start;
        console.log(`✅ Stage 2 완료: ${elapsed}ms`);
        console.log(`   결과 수: ${data.count || 0}개`);
    })
    .catch(err => {
        const elapsed = Date.now() - start;
        console.log(`❌ 오류 (${elapsed}ms):`, err.message);
    });
