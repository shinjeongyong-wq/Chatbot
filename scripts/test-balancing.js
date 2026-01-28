
const testItems = [
    {
        id: 'item1_tips',
        source: 'notion',
        question: '간판 시인성 높이는 팁',
        answer: '밤에 멀리서도 잘 보이게 하려면 LED 백릿 방식이 유리하며, 채널형 글자보다는 일체형이 깔끔합니다.',
        metadata: {
            topic: '간판',
            field: '지식',
            categoryPath: 'advanced/signage',
            structuredSubCategory: 'signage'
        }
    },
    {
        id: 'item2_partner',
        source: 'notion',
        question: '디자인캐프',
        answer: '간판 및 옥외광고물 전문 업체. 10년 경력의 연출 전문가 보유.',
        metadata: {
            topic: '간판',
            field: '업체',
            categoryPath: 'partners/signage',
            structuredSubCategory: 'signage'
        }
    },
    {
        id: 'item3_interior',
        source: 'notion',
        question: '무아디자인',
        answer: '인테리어 전문 업체. 통증의학과 시공 사례 다수.',
        metadata: {
            topic: '인테리어',
            field: '업체',
            categoryPath: 'partners/interior',
            structuredSubCategory: 'interior'
        }
    },
    {
        id: 'item4_qa',
        source: 'qa',
        question: '밤에도 간판이 잘 보였으면 좋겠어요',
        answer: '광도(Brightness) 조절이 가능한 센서를 부착하여 어두워지면 자동으로 밝아지게 설정할 수 있습니다.',
        metadata: {
            field: '간판'
        }
    }
];

const queryPlan = {
    intent: '정보요청',
    topic: '간판',
    targetCategory: 'all',
    targetSubCategory: 'signage',
    coreKeywords: ['간판', '밤', '잘 보이게'],
    expandedKeywords: ['야간', '시인성'],
    searchStrategy: 'semantic'
};

// Simplified Scoring Logic (mimicking sheets-loader.js)
function calculateScore(item, plan, useFix = true) {
    const { topic, targetSubCategory, intent, coreKeywords, expandedKeywords } = plan;
    const text = (item.question + ' ' + item.answer + ' ' + (item.metadata?.field || '')).toLowerCase();

    let score = 0;

    // 1. Keyword Matching (Simplified)
    coreKeywords.forEach(kw => { if (text.includes(kw.toLowerCase())) score += 0.2; });
    expandedKeywords.forEach(kw => { if (text.includes(kw.toLowerCase())) score += 0.05; });

    const itemTopic = item.metadata?.topic || '';
    const itemPath = item.metadata?.categoryPath || '';
    const itemField = (item.metadata?.field || '').toLowerCase();
    const itemSubPath = item.metadata?.structuredSubCategory || '';

    // Logic from smartSearch
    if (topic && topic !== '기타') {
        const searchTopic = topic.toLowerCase();
        if (item.source === 'notion' && (itemTopic.includes(searchTopic) || itemPath.includes(searchTopic))) {
            score += useFix ? 1.2 : 2.0;
        } else if ((item.source === 'qa') && itemField.includes(searchTopic)) {
            score += useFix ? 1.0 : 1.5;
        } else if (topic === '인테리어' && (itemPath.includes('signage') || itemField.includes('간판'))) {
            score *= useFix ? 0.6 : 0.1;
        } else if (topic === '간판' && (itemPath.includes('interior') || itemField.includes('인테리어'))) {
            score *= useFix ? 0.6 : 0.1;
        }
    }

    // SubCategory Bonus
    if (targetSubCategory && targetSubCategory !== 'all' && item.source === 'notion') {
        if (itemSubPath.includes(targetSubCategory)) {
            score += useFix ? 1.0 : 3.0;
        } else if (targetSubCategory === 'interior' && itemSubPath.includes('signage')) {
            score *= useFix ? 0.5 : 0.01;
        }
    }

    // Intent Bonus
    const isHowToIntent = intent === '정보요청';
    if (isHowToIntent) {
        if (itemPath.startsWith('advanced') || item.source === 'qa') {
            score += useFix ? 0.8 : 2.5;
        }
        if (itemPath.startsWith('partners')) {
            score *= useFix ? 0.7 : 0.3;
        }
    }

    return score;
}

console.log('--- [검증] 통사적(Strict) vs 유연한(Balanced) 로직 비교 ---');
console.log('질문: "밤에 간판 잘 보이게 하고 싶어"');
console.log('의도: 정보요청, 주제: 간판, 타겟: all(전체)');
console.log('');

const runTest = (useFix) => {
    console.log(useFix ? '✅ [유연한 로직 적용 결과]' : '❌ [기존(Strict) 로직 적용 결과]');
    const results = testItems.map(item => ({
        id: item.id,
        score: calculateScore(item, queryPlan, useFix).toFixed(2),
        type: item.metadata?.field || item.source
    })).sort((a, b) => b.score - a.score);

    results.forEach((r, i) => {
        console.log(`${i + 1}위: ${r.id} (${r.type}) - 점수: ${r.score}`);
    });
    console.log('');
};

runTest(false);
runTest(true);
