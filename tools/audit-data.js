// 전체 데이터 전수조사 스크립트
const fs = require('fs');
const path = require('path');

// 결과 저장
const results = {
    total: 0,
    bySource: {},      // qa, notion, faq
    byField: {},       // field별 분류
    byCategory: {},    // category별 분류
    byStructuredCategory: {},  // Notion structuredCategory
    byStructuredSubCategory: {}, // Notion structuredSubCategory
    unmapped: []       // 분류 불가 데이터
};

// Q&A 데이터 로드
console.log('📊 Q&A 데이터 분석 중...');
const qaData = require('./data/qa/qna.json');
qaData.items.forEach((item, idx) => {
    results.total++;

    const source = item.source || 'unknown';
    results.bySource[source] = (results.bySource[source] || 0) + 1;

    const field = item.metadata?.field || 'NO_FIELD';
    results.byField[field] = results.byField[field] || [];
    results.byField[field].push({
        id: item.id,
        source: source,
        question: item.question?.substring(0, 50) + '...',
        category: item.metadata?.category || 'NO_CATEGORY'
    });

    const cat = item.metadata?.category || 'NO_CATEGORY';
    results.byCategory[cat] = (results.byCategory[cat] || 0) + 1;
});

console.log(`   Q&A: ${qaData.items.length}개`);

// Notion 데이터 로드
console.log('📊 Notion 데이터 분석 중...');
const notionDir = './data/notion';

function loadNotionRecursive(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            loadNotionRecursive(filePath);
        } else if (file.endsWith('.json') && file !== 'index.json') {
            try {
                const data = require('./' + filePath.replace(/\\/g, '/'));
                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach(item => {
                        results.total++;

                        const source = item.source || 'notion';
                        results.bySource[source] = (results.bySource[source] || 0) + 1;

                        // structuredCategory
                        const sCat = item.metadata?.structuredCategory || data.category || 'NO_STRUCTURED_CAT';
                        results.byStructuredCategory[sCat] = results.byStructuredCategory[sCat] || [];
                        results.byStructuredCategory[sCat].push({
                            id: item.id,
                            file: filePath,
                            question: item.question?.substring(0, 40) || 'NO_QUESTION',
                            subCat: item.metadata?.structuredSubCategory || data.subCategory || 'NO_SUB'
                        });

                        // structuredSubCategory
                        const sSubCat = item.metadata?.structuredSubCategory || data.subCategory || 'NO_SUB';
                        results.byStructuredSubCategory[sSubCat] = (results.byStructuredSubCategory[sSubCat] || 0) + 1;

                        // field (Notion)
                        const field = item.metadata?.field || 'NO_FIELD';
                        if (!results.byField[field]) {
                            results.byField[field] = [];
                        }
                        results.byField[field].push({
                            id: item.id,
                            source: 'notion',
                            file: filePath,
                            question: item.question?.substring(0, 40) || 'NO_Q'
                        });
                    });
                }
            } catch (e) {
                console.error(`   Error loading ${filePath}:`, e.message);
            }
        }
    });
}

loadNotionRecursive(notionDir);

// 결과 출력
console.log('\n' + '='.repeat(80));
console.log('📊 전수조사 결과');
console.log('='.repeat(80));

console.log(`\n📌 총 데이터: ${results.total}개`);

console.log('\n📌 Source별 분류:');
Object.entries(results.bySource).forEach(([k, v]) => {
    console.log(`   ${k}: ${v}개`);
});

console.log('\n📌 Field별 분류 (Q&A + Notion):');
Object.entries(results.byField).sort((a, b) => b[1].length - a[1].length).forEach(([field, items]) => {
    console.log(`   ${field}: ${items.length}개`);
});

console.log('\n📌 Category별 분류 (Q&A만):');
Object.entries(results.byCategory).sort((a, b) => b - a).forEach(([k, v]) => {
    console.log(`   ${k}: ${v}개`);
});

console.log('\n📌 Notion structuredCategory별:');
Object.entries(results.byStructuredCategory).forEach(([cat, items]) => {
    console.log(`   ${cat}: ${items.length}개`);
});

console.log('\n📌 Notion structuredSubCategory별:');
Object.entries(results.byStructuredSubCategory).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v}개`);
});

// Query Plan 매핑 테이블
console.log('\n' + '='.repeat(80));
console.log('🎯 Query Plan 매핑 분석');
console.log('='.repeat(80));

const queryPlanTopics = ['인테리어', '간판', '의료기기', '세무', '마케팅', '개원비용', 'CI/BI', '기타'];
const queryPlanCategories = ['partners', 'hospital-basics', 'advanced', 'checklist', 'all'];
const queryPlanSubCategories = ['interior', 'signage', 'homepage', 'medical-device', 'tax', 'finance', 'all'];

console.log('\n📌 Field → Topic 매핑:');
Object.keys(results.byField).forEach(field => {
    const matched = queryPlanTopics.find(t => field.includes(t) || t.includes(field));
    const status = matched ? `✅ → ${matched}` : '❌ 매칭 없음';
    console.log(`   ${field} (${results.byField[field].length}개) ${status}`);
});

console.log('\n📌 structuredCategory → targetCategory 매핑:');
Object.keys(results.byStructuredCategory).forEach(cat => {
    const matched = queryPlanCategories.find(c => cat === c);
    const status = matched ? `✅ → ${matched}` : '❌ 매칭 없음';
    console.log(`   ${cat} (${results.byStructuredCategory[cat].length}개) ${status}`);
});

console.log('\n📌 structuredSubCategory → targetSubCategory 매핑:');
Object.keys(results.byStructuredSubCategory).forEach(subCat => {
    const matched = queryPlanSubCategories.find(s => subCat.includes(s));
    const status = matched ? `✅ → ${matched}` : '❌ 매칭 없음';
    console.log(`   ${subCat} (${results.byStructuredSubCategory[subCat]}개) ${status}`);
});

// 상세 데이터 파일로 저장
fs.writeFileSync('./data-audit-result.json', JSON.stringify(results, null, 2));
console.log('\n📁 상세 결과: data-audit-result.json 저장 완료');
