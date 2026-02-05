// 필터링 조합 분석 스크립트
const fs = require('fs');
const path = require('path');

// 데이터 로드
function loadAllData() {
    const data = [];

    // Q&A 데이터 (qna.json)
    const qnaPath = './data/qa/qna.json';
    if (fs.existsSync(qnaPath)) {
        const qnaData = JSON.parse(fs.readFileSync(qnaPath, 'utf-8'));
        qnaData.items?.forEach(item => data.push({ ...item, source: 'qa' }));
    }

    // FAQ 데이터
    const faqPath = './data/qa/faq.json';
    if (fs.existsSync(faqPath)) {
        const faqData = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
        faqData.items?.forEach(item => data.push({ ...item, source: 'faq' }));
    }

    // Notion 데이터
    const notionDir = './data/notion';
    const loadNotionRecursive = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                loadNotionRecursive(fullPath);
            } else if (entry.name.endsWith('.json') && !entry.name.includes('index')) {
                const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                content.items?.forEach(item => data.push({ ...item, source: 'notion' }));
            }
        }
    };
    loadNotionRecursive(notionDir);

    return data;
}

const data = loadAllData();
console.log(`\n📊 전체 데이터: ${data.length}개\n`);
console.log(`   - Q&A: ${data.filter(d => d.source === 'qa').length}개`);
console.log(`   - Notion: ${data.filter(d => d.source === 'notion').length}개`);

// 1. 데이터 메타데이터 분석
console.log('\n' + '='.repeat(80));
console.log('1️⃣ 데이터 메타데이터 분석');
console.log('='.repeat(80));

// field 값 분포
const fieldCounts = {};
data.forEach(d => {
    const field = d.metadata?.field || 'undefined';
    fieldCounts[field] = (fieldCounts[field] || 0) + 1;
});
console.log('\n📌 field 값 분포:');
Object.entries(fieldCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   "${k}": ${v}개`);
});

// structuredCategory 값 분포
const catCounts = {};
data.forEach(d => {
    const cat = d.metadata?.structuredCategory || 'undefined';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
});
console.log('\n📌 structuredCategory 값 분포:');
Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   "${k}": ${v}개`);
});

// structuredSubCategory 값 분포
const subCatCounts = {};
data.forEach(d => {
    const subCat = d.metadata?.structuredSubCategory || 'undefined';
    subCatCounts[subCat] = (subCatCounts[subCat] || 0) + 1;
});
console.log('\n📌 structuredSubCategory 값 분포:');
Object.entries(subCatCounts).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => {
    console.log(`   "${k}": ${v}개`);
});

// 2. Query Plan 필드와 데이터 매핑 분석
console.log('\n' + '='.repeat(80));
console.log('2️⃣ Query Plan 필드 → 데이터 매핑 분석');
console.log('='.repeat(80));

// topic → field 매핑 테스트
const topicOptions = ["플래너 AI", "인테리어", "간판", "홈페이지", "가구", "의료기기", "세무/대출", "EMR/CRM", "마케팅", "개원로드맵", "파트너사정보"];
console.log('\n📌 topic → field 매핑 (topic이 field에 포함되는 문서 수):');
topicOptions.forEach(topic => {
    const count = data.filter(d => d.metadata?.field?.includes(topic)).length;
    console.log(`   "${topic}": ${count}개`);
});

// targetCategory → structuredCategory 매핑 테스트
const categoryOptions = ["qa", "hospital-opening-roadmap", "hospital-basics", "partners", "advanced", "checklist", "portfolio"];
console.log('\n📌 targetCategory → structuredCategory 매핑:');
categoryOptions.forEach(cat => {
    const count = data.filter(d => d.metadata?.structuredCategory?.includes(cat)).length;
    console.log(`   "${cat}": ${count}개`);
});

// 3. 필터링 조합 시뮬레이션
console.log('\n' + '='.repeat(80));
console.log('3️⃣ 필터링 조합 시뮬레이션');
console.log('='.repeat(80));

// 시뮬레이션용 Query Plan 예시들
const testCases = [
    {
        name: '단일 주제: 인테리어 파트너사',
        topic: ['인테리어'],
        targetCategory: ['partners'],
        coreKeywords: ['인테리어', '파트너사', '업체']
    },
    {
        name: '복합: 개원 프로세스 + 인테리어 파트너사',
        topic: ['개원로드맵', '인테리어'],
        targetCategory: ['hospital-opening-roadmap', 'partners'],
        coreKeywords: ['개원', '프로세스', '인테리어', '파트너사']
    },
    {
        name: '복합: 간판 + 홈페이지',
        topic: ['간판', '홈페이지'],
        targetCategory: ['partners', 'hospital-basics'],
        coreKeywords: ['간판', '홈페이지', '설치', '제작']
    },
    {
        name: '단일: 대출 관련',
        topic: ['세무/대출'],
        targetCategory: ['hospital-basics', 'partners'],
        coreKeywords: ['대출', '세무', '은행', '자금']
    }
];

testCases.forEach(tc => {
    console.log(`\n📋 테스트: ${tc.name}`);
    console.log(`   topic: ${JSON.stringify(tc.topic)}`);
    console.log(`   targetCategory: ${JSON.stringify(tc.targetCategory)}`);
    console.log(`   coreKeywords: ${JSON.stringify(tc.coreKeywords)}`);

    // 필터 A: topic만 (field에 topic 포함)
    const filterA = data.filter(d => {
        const field = d.metadata?.field || '';
        return tc.topic.some(t => field.includes(t));
    });

    // 필터 B: targetCategory만 (structuredCategory에 포함)
    const filterB = data.filter(d => {
        const cat = d.metadata?.structuredCategory || '';
        return tc.targetCategory.some(c => cat.includes(c));
    });

    // 필터 C: topic OR targetCategory
    const filterC = data.filter(d => {
        const field = d.metadata?.field || '';
        const cat = d.metadata?.structuredCategory || '';
        return tc.topic.some(t => field.includes(t)) ||
            tc.targetCategory.some(c => cat.includes(c));
    });

    // 필터 D: topic OR targetCategory OR keyword (question에 1개 이상 포함)
    const filterD = data.filter(d => {
        const field = d.metadata?.field || '';
        const cat = d.metadata?.structuredCategory || '';
        const question = d.question || '';
        return tc.topic.some(t => field.includes(t)) ||
            tc.targetCategory.some(c => cat.includes(c)) ||
            tc.coreKeywords.some(k => question.includes(k));
    });

    // 필터 E: keyword만 (question에 1개 이상 포함)
    const filterE = data.filter(d => {
        const question = d.question || '';
        return tc.coreKeywords.some(k => question.includes(k));
    });

    console.log(`   ─────────────────────────────────────`);
    console.log(`   [A] topic만:                  ${filterA.length}개 (${(filterA.length / data.length * 100).toFixed(1)}%)`);
    console.log(`   [B] targetCategory만:         ${filterB.length}개 (${(filterB.length / data.length * 100).toFixed(1)}%)`);
    console.log(`   [C] topic OR targetCategory:  ${filterC.length}개 (${(filterC.length / data.length * 100).toFixed(1)}%)`);
    console.log(`   [D] topic OR cat OR keyword:  ${filterD.length}개 (${(filterD.length / data.length * 100).toFixed(1)}%)`);
    console.log(`   [E] keyword만:                ${filterE.length}개 (${(filterE.length / data.length * 100).toFixed(1)}%)`);
    console.log(`   [전체]:                       ${data.length}개 (100%)`);
});

// 4. 권장사항 도출
console.log('\n' + '='.repeat(80));
console.log('4️⃣ 분석 요약 및 권장사항');
console.log('='.repeat(80));
