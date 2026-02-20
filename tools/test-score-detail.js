// 점수 상세 분석 테스트
require('dotenv').config();

const BASE_URL = 'http://localhost:3003';

async function analyzeScores() {
    const query = '개원 프로세스 알려주고, 인테리어 파트너사 추천해줘';
    console.log(`🔬 질문: "${query}"\n`);

    // 1. Query Plan
    const planRes = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: query,
            mode: 'plan',
            userSpecialty: { code: 'derma', label: '피부과', keywords: ['피부', '레이저'] }
        })
    });
    const { plan } = await planRes.json();

    console.log('📋 Query Plan:');
    console.log(`   topic: ${JSON.stringify(plan.topic)}`);
    console.log(`   subIntent: ${JSON.stringify(plan.subIntent)}`);
    console.log(`   targetCategory: ${JSON.stringify(plan.targetCategory)}`);
    console.log(`   coreKeywords: ${plan.coreKeywords?.join(', ')}`);
    console.log(`   expandedKeywords: ${plan.expandedKeywords?.join(', ')}`);

    // 2. 검색 결과
    const searchRes = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'search',
            queryPlan: plan,
            maxResults: 30,
            userSpecialty: { code: 'derma', label: '피부과', keywords: ['피부', '레이저'] }
        })
    });
    const { results } = await searchRes.json();

    console.log(`\n📊 검색 결과 상위 20개:\n`);
    console.log('순위 | 점수   | 카테고리              | 제목');
    console.log('─'.repeat(80));

    results?.slice(0, 20).forEach((item, idx) => {
        const category = item.metadata?.structuredCategory || item.metadata?.categoryPath || item.source || '-';
        const title = (item.question || '').substring(0, 35);
        const score = item.score?.toFixed(3) || '?';

        // 로드맵/개원 관련 표시
        const isRoadmap = category.includes('roadmap') || category.includes('opening');
        const isPartners = category.includes('partners');
        const marker = isRoadmap ? '🗺️' : isPartners ? '🤝' : '  ';

        console.log(`[${String(idx + 1).padStart(2)}] | ${score.padStart(5)} | ${category.padEnd(20)} | ${marker} ${title}`);
    });

    // 로드맵 문서 찾기
    const roadmapDocs = results?.filter(r => {
        const cat = r.metadata?.structuredCategory || r.metadata?.categoryPath || '';
        const q = r.question || '';
        return cat.includes('roadmap') || cat.includes('opening') || q.includes('로드맵') || q.includes('프로세스');
    });

    console.log(`\n📌 로드맵/프로세스 관련 문서: ${roadmapDocs?.length || 0}개`);
    if (roadmapDocs?.length > 0) {
        roadmapDocs.forEach((doc, i) => {
            console.log(`   [${i + 1}] 점수: ${doc.score?.toFixed(3)} | ${doc.question?.substring(0, 50)}`);
        });
    }

    // 파트너사 문서 통계
    const partnerDocs = results?.filter(r =>
        (r.metadata?.structuredCategory || r.metadata?.categoryPath || '').includes('partners')
    );
    console.log(`\n📌 파트너사 문서: ${partnerDocs?.length || 0}개`);
    if (partnerDocs?.length > 0) {
        console.log(`   평균 점수: ${(partnerDocs.reduce((s, p) => s + p.score, 0) / partnerDocs.length).toFixed(3)}`);
        console.log(`   최고 점수: ${Math.max(...partnerDocs.map(p => p.score)).toFixed(3)}`);
    }
}

analyzeScores().catch(console.error);
