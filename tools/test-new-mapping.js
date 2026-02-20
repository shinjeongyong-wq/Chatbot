// 신규 분류 체계 100% 매칭 테스트
const fs = require('fs');
const path = require('path');

// ===================== 신규 분류 체계 정의 =====================

// Topic 매핑 테이블 (Q&A field → topic)
const FIELD_TO_TOPIC = {
    '인테리어': '인테리어',
    '인\ufffd\ufffd\ufffd리어': '인테리어',  // 깨진 문자 처리
    '간판': '간판',
    '의료기기': '의료기기',
    '마케팅': '마케팅',
    '홈페이지': '홈페이지',
    'PC&네트워크&가전': 'PC&네트워크',
    'PC&네\ufffd\ufffd워크&가전': 'PC&네트워크',  // 깨진 문자
    'PC&네트워크&가\ufffd\ufffd\ufffd': 'PC&네트워크',  // 깨진 문자
    '이동가구': '가구',
    '노무': '노무',
    '플래너 AI': '파트너사정보',  // Notion 파트너사 데이터
    '개업 로드맵': '개원로드맵',
    'NO_FIELD': '기타'
};

// targetCategory 목록
const TARGET_CATEGORIES = [
    'partners',
    'hospital-basics',
    'advanced',
    'checklist',
    'portfolio',
    'hospital-opening-roadmap',
    'qa'  // Q&A 데이터용
];

// targetSubCategory 목록
const TARGET_SUB_CATEGORIES = [
    // pre-construction
    'pre-construction/interior',
    'pre-construction/signage',
    'pre-construction/homepage',
    'pre-construction/bank',
    'pre-construction/pc-network',
    'pre-construction/medical-device',
    'pre-construction/marketing',
    'pre-construction/tax-loan',
    'pre-construction/demolition',
    // during-construction
    'during-construction/furniture',
    'during-construction/infrastructure',
    'during-construction/textiles',
    'during-construction/waste',
    // post-construction
    'post-construction/furniture',
    'post-construction/emr-crm',
    'post-construction/marketing',
    // post-opening
    'post-opening/admin',
    'post-opening/emr-crm',
    'post-opening/management',
    'post-opening/pharmacy',
    // checklist
    'checklist/general',
    'checklist/facilities',
    'checklist/regulations',
    // portfolio
    'portfolio/customers',
    // advanced
    'advanced/interior',
    'advanced/signage',
    'advanced/medical-device-beauty',
    'advanced/medical-device-dental',
    'advanced/medical-device-internal',
    'advanced/medical-device-pain',
    // special
    'roadmap',
    'qa'  // Q&A 전용
];

// 결과 저장
const results = {
    total: 0,
    matched: 0,
    unmatched: [],
    byTopic: {},
    byCategory: {},
    bySubCategory: {}
};

// Topic 매핑 함수
function mapTopic(field) {
    if (!field) return '기타';

    // 직접 매핑
    if (FIELD_TO_TOPIC[field]) {
        return FIELD_TO_TOPIC[field];
    }

    // 부분 매칭 시도
    if (field.includes('인테리어')) return '인테리어';
    if (field.includes('네트워크') || field.includes('PC')) return 'PC&네트워크';
    if (field.includes('플래너')) return '파트너사정보';

    return '기타';
}

// Category 매핑 함수
function mapCategory(item, source) {
    if (source === 'qa') return 'qa';

    const sCat = item.metadata?.structuredCategory;
    if (sCat && TARGET_CATEGORIES.includes(sCat)) {
        return sCat;
    }

    // hospital-opening-roadmap 처리
    if (sCat === 'hospital-opening-roadmap') return 'hospital-opening-roadmap';

    return 'unknown';
}

// SubCategory 매핑 함수
function mapSubCategory(item, source) {
    if (source === 'qa') return 'qa';

    let subCat = item.metadata?.structuredSubCategory;
    if (!subCat) return 'unknown';

    // 직접 매칭
    if (TARGET_SUB_CATEGORIES.includes(subCat)) {
        return subCat;
    }

    // advanced 하위 처리 (medical-device-beauty 등)
    if (subCat.startsWith('medical-device-')) {
        return 'advanced/' + subCat;
    }

    // interior, signage 직접 매핑
    if (subCat === 'interior') return 'advanced/interior';
    if (subCat === 'signage') return 'advanced/signage';
    if (subCat === 'general') return 'checklist/general';
    if (subCat === 'facilities') return 'checklist/facilities';
    if (subCat === 'regulations') return 'checklist/regulations';
    if (subCat === 'customers') return 'portfolio/customers';
    if (subCat === 'roadmap') return 'roadmap';

    return subCat; // 그대로 반환
}

console.log('🔬 신규 분류 체계 100% 매칭 테스트\n');

// ===================== Q&A 데이터 테스트 =====================
console.log('📊 Q&A 데이터 테스트 중...');
const qaData = require('./data/qa/qna.json');

qaData.items.forEach((item, idx) => {
    results.total++;

    const field = item.metadata?.field || 'NO_FIELD';
    const topic = mapTopic(field);
    const category = 'qa';
    const subCategory = 'qa';

    // Topic 카운트
    results.byTopic[topic] = (results.byTopic[topic] || 0) + 1;
    results.byCategory[category] = (results.byCategory[category] || 0) + 1;
    results.bySubCategory[subCategory] = (results.bySubCategory[subCategory] || 0) + 1;

    if (topic !== '기타') {
        results.matched++;
    } else {
        results.unmatched.push({
            id: item.id,
            source: 'qa',
            field: field,
            question: item.question?.substring(0, 50)
        });
    }
});

console.log(`   Q&A: ${qaData.items.length}개 처리 완료`);

// ===================== Notion 데이터 테스트 =====================
console.log('📊 Notion 데이터 테스트 중...');
const notionDir = './data/notion';
let notionCount = 0;

function testNotionRecursive(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            testNotionRecursive(filePath);
        } else if (file.endsWith('.json') && file !== 'index.json') {
            try {
                const data = require('./' + filePath.replace(/\\/g, '/'));
                if (data.items && Array.isArray(data.items)) {
                    data.items.forEach(item => {
                        results.total++;
                        notionCount++;

                        const field = item.metadata?.field || 'NO_FIELD';
                        const topic = mapTopic(field);
                        const category = mapCategory(item, 'notion');
                        const subCategory = mapSubCategory(item, 'notion');

                        // 카운트
                        results.byTopic[topic] = (results.byTopic[topic] || 0) + 1;
                        results.byCategory[category] = (results.byCategory[category] || 0) + 1;
                        results.bySubCategory[subCategory] = (results.bySubCategory[subCategory] || 0) + 1;

                        // 매칭 확인
                        const topicOk = topic !== '기타';
                        const catOk = category !== 'unknown';
                        const subCatOk = subCategory !== 'unknown';

                        if (topicOk && catOk && subCatOk) {
                            results.matched++;
                        } else {
                            results.unmatched.push({
                                id: item.id,
                                source: 'notion',
                                file: filePath,
                                field: field,
                                topic: topic,
                                category: category,
                                subCategory: subCategory,
                                issues: [
                                    !topicOk ? 'topic=기타' : null,
                                    !catOk ? 'category=unknown' : null,
                                    !subCatOk ? 'subCategory=unknown' : null
                                ].filter(Boolean)
                            });
                        }
                    });
                }
            } catch (e) {
                console.error(`   Error: ${filePath}`, e.message);
            }
        }
    });
}

testNotionRecursive(notionDir);
console.log(`   Notion: ${notionCount}개 처리 완료`);

// ===================== 결과 출력 =====================
console.log('\n' + '='.repeat(80));
console.log('📊 100% 매칭 테스트 결과');
console.log('='.repeat(80));

const matchRate = ((results.matched / results.total) * 100).toFixed(1);
console.log(`\n📌 총 데이터: ${results.total}개`);
console.log(`✅ 매칭 성공: ${results.matched}개 (${matchRate}%)`);
console.log(`❌ 매칭 실패: ${results.unmatched.length}개`);

console.log('\n📌 Topic별 분포:');
Object.entries(results.byTopic).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    const pct = ((v / results.total) * 100).toFixed(1);
    console.log(`   ${k}: ${v}개 (${pct}%)`);
});

console.log('\n📌 Category별 분포:');
Object.entries(results.byCategory).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v}개`);
});

console.log('\n📌 SubCategory별 분포 (상위 15개):');
Object.entries(results.bySubCategory).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => {
    console.log(`   ${k}: ${v}개`);
});

if (results.unmatched.length > 0) {
    console.log('\n❌ 매칭 실패 상세 (최대 20개):');
    results.unmatched.slice(0, 20).forEach((item, idx) => {
        console.log(`   [${idx + 1}] ${item.source} | field="${item.field}" | ${item.issues?.join(', ') || ''}`);
        if (item.question) console.log(`       Q: ${item.question}`);
    });
}

// 결과 저장
fs.writeFileSync('./mapping-test-result.json', JSON.stringify(results, null, 2));
console.log('\n📁 상세 결과: mapping-test-result.json 저장 완료');
