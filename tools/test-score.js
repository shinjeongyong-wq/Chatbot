// 점수 목록 테스트
require('dotenv').config();

const BASE_URL = 'http://localhost:3003';

async function testScores() {
    const query = '인테리어 파트너사 추천';
    console.log(`🔬 점수 테스트: "${query}"\n`);

    // 1. Query Plan 생성
    const planRes = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: query,
            mode: 'plan',
            userSpecialty: { code: 'derma', label: '피부과', keywords: ['피부', '레이저'] }
        })
    });
    const planData = await planRes.json();
    console.log('📋 Query Plan:');
    console.log(`   topic: ${JSON.stringify(planData.plan?.topic)}`);
    console.log(`   subIntent: ${JSON.stringify(planData.plan?.subIntent)}`);
    console.log(`   coreKeywords: ${planData.plan?.coreKeywords?.join(', ')}`);

    // 2. 검색 실행
    const searchRes = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'search',
            queryPlan: planData.plan,
            maxResults: 20,
            userSpecialty: { code: 'derma', label: '피부과', keywords: ['피부', '레이저'] }
        })
    });
    const searchData = await searchRes.json();

    console.log(`\n📊 검색 결과 (${searchData.count}개):\n`);
    console.log('순위 | 점수   | 타입    | 제목');
    console.log('─'.repeat(70));

    searchData.results?.slice(0, 15).forEach((item, idx) => {
        const source = item.source || 'unknown';
        const category = item.metadata?.structuredCategory || item.metadata?.categoryPath || '-';
        const title = (item.question || '').substring(0, 40);
        const score = item.score?.toFixed(3) || '?';

        // 파트너사 여부 표시
        const isPartner = category.includes('partners') ? '✓' : ' ';

        console.log(`[${String(idx + 1).padStart(2)}] | ${score.padStart(5)} | ${source.padEnd(6)} | ${isPartner} ${title}`);
    });

    // 파트너사 vs 비파트너사 비교
    const partners = searchData.results?.filter(r =>
        (r.metadata?.structuredCategory || r.metadata?.categoryPath || '').includes('partners')
    ) || [];
    const nonPartners = searchData.results?.filter(r =>
        !(r.metadata?.structuredCategory || r.metadata?.categoryPath || '').includes('partners')
    ) || [];

    console.log(`\n📌 파트너사 문서: ${partners.length}개`);
    console.log(`📌 비파트너사 문서: ${nonPartners.length}개`);

    if (partners.length > 0) {
        console.log(`   파트너사 평균 점수: ${(partners.reduce((s, p) => s + p.score, 0) / partners.length).toFixed(3)}`);
    }
    if (nonPartners.length > 0) {
        console.log(`   비파트너사 평균 점수: ${(nonPartners.reduce((s, p) => s + p.score, 0) / nonPartners.length).toFixed(3)}`);
    }
}

testScores().catch(console.error);
