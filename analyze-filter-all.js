// 모든 필터링 경우의 수 분석 스크립트
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

// 테스트 케이스 정의
const testCases = [
    {
        name: '복합: 개원 프로세스 + 인테리어 파트너사',
        topic: ['개원로드맵', '인테리어'],
        targetCategory: ['hospital-opening-roadmap', 'partners'],
        targetSubCategory: ['roadmap', 'pre-construction/interior'],
        coreKeywords: ['개원', '프로세스', '인테리어', '파트너사'],
        expandedKeywords: ['개원 절차', '병원 인테리어', '시공사', '협력사']
    },
    {
        name: '복합: 간판 + 홈페이지',
        topic: ['간판', '홈페이지'],
        targetCategory: ['partners', 'hospital-basics'],
        targetSubCategory: ['pre-construction/signage', 'pre-construction/homepage'],
        coreKeywords: ['간판', '홈페이지', '설치', '제작'],
        expandedKeywords: ['외부 간판', '내부 간판', '웹사이트', '병원 홈페이지']
    },
    {
        name: '단일: 대출 관련',
        topic: ['세무/대출'],
        targetCategory: ['hospital-basics', 'partners'],
        targetSubCategory: ['pre-construction/bank'],
        coreKeywords: ['대출', '세무', '은행', '자금'],
        expandedKeywords: ['개원 대출', '닥터론', '세무사', '신용보증']
    },
    {
        name: '단일: EMR/CRM',
        topic: ['EMR/CRM'],
        targetCategory: ['partners', 'hospital-basics'],
        targetSubCategory: ['post-construction/emr-crm'],
        coreKeywords: ['EMR', 'CRM', '차트', '예약'],
        expandedKeywords: ['전자차트', '환자관리', '예약시스템']
    }
];

// 필터 함수들 정의
const filters = {
    // 단일 필드
    topic: (item, tc) => {
        const field = item.metadata?.field || '';
        return tc.topic.some(t => field.toLowerCase().includes(t.toLowerCase()));
    },
    targetCategory: (item, tc) => {
        const cat = item.metadata?.structuredCategory || '';
        return tc.targetCategory.some(c => cat.includes(c));
    },
    targetSubCategory: (item, tc) => {
        const subCat = item.metadata?.structuredSubCategory || '';
        return tc.targetSubCategory.some(s => subCat.includes(s));
    },
    coreKeywords: (item, tc) => {
        const text = (item.question || '') + ' ' + (item.answer || '');
        return tc.coreKeywords.some(k => text.includes(k));
    },
    expandedKeywords: (item, tc) => {
        const text = (item.question || '') + ' ' + (item.answer || '');
        return tc.expandedKeywords.some(k => text.includes(k));
    }
};

// 모든 조합 생성 (OR 조합)
function getAllCombinations(arr) {
    const result = [];
    const len = arr.length;
    for (let i = 1; i < (1 << len); i++) {
        const combo = [];
        for (let j = 0; j < len; j++) {
            if (i & (1 << j)) {
                combo.push(arr[j]);
            }
        }
        result.push(combo);
    }
    return result;
}

const filterNames = Object.keys(filters);
const allCombinations = getAllCombinations(filterNames);

console.log('='.repeat(100));
console.log('모든 필터 조합 분석 (OR 조합)');
console.log('='.repeat(100));

testCases.forEach(tc => {
    console.log(`\n${'─'.repeat(100)}`);
    console.log(`📋 테스트: ${tc.name}`);
    console.log(`${'─'.repeat(100)}`);

    const results = [];

    allCombinations.forEach(combo => {
        const filtered = data.filter(item => {
            return combo.some(filterName => filters[filterName](item, tc));
        });

        const qaCount = filtered.filter(d => d.source === 'qa').length;
        const notionCount = filtered.filter(d => d.source === 'notion').length;
        const faqCount = filtered.filter(d => d.source === 'faq').length;

        results.push({
            combo: combo.join(' OR '),
            total: filtered.length,
            percent: (filtered.length / data.length * 100).toFixed(1),
            qa: qaCount,
            notion: notionCount,
            faq: faqCount
        });
    });

    // 결과를 문서 수 기준으로 정렬
    results.sort((a, b) => a.total - b.total);

    console.log('\n조합 (OR)                                                              | 총문서 | 비율   | Q&A  | Notion | FAQ');
    console.log('─'.repeat(120));

    results.forEach(r => {
        const comboStr = r.combo.padEnd(70);
        console.log(`${comboStr} | ${String(r.total).padStart(5)} | ${r.percent.padStart(5)}% | ${String(r.qa).padStart(4)} | ${String(r.notion).padStart(6)} | ${String(r.faq).padStart(3)}`);
    });
});

// 핵심 분석: 중요 문서 포함 여부 체크
console.log('\n\n' + '='.repeat(100));
console.log('핵심 문서 포함 여부 체크');
console.log('='.repeat(100));

// 개원 로드맵 문서 찾기
const roadmapDoc = data.find(d => d.question?.includes('로드맵') || d.metadata?.structuredCategory === 'hospital-opening-roadmap');
console.log(`\n로드맵 문서: "${roadmapDoc?.question?.substring(0, 50)}..."`);
console.log(`  - field: ${roadmapDoc?.metadata?.field}`);
console.log(`  - structuredCategory: ${roadmapDoc?.metadata?.structuredCategory}`);

// 각 필터로 로드맵 문서가 잡히는지 확인
const tc = testCases[0]; // 복합: 개원 프로세스 + 인테리어 파트너사
console.log(`\n테스트 케이스: ${tc.name}`);
console.log(`  - topic으로 잡히나? ${filters.topic(roadmapDoc, tc)}`);
console.log(`  - targetCategory로 잡히나? ${filters.targetCategory(roadmapDoc, tc)}`);
console.log(`  - targetSubCategory로 잡히나? ${filters.targetSubCategory(roadmapDoc, tc)}`);
console.log(`  - coreKeywords로 잡히나? ${filters.coreKeywords(roadmapDoc, tc)}`);
console.log(`  - expandedKeywords로 잡히나? ${filters.expandedKeywords(roadmapDoc, tc)}`);

// 인테리어 파트너사 문서 찾기
const partnerDoc = data.find(d => d.question?.includes('인테리어') && d.metadata?.structuredCategory === 'partners');
console.log(`\n인테리어 파트너사 문서: "${partnerDoc?.question?.substring(0, 50)}..."`);
console.log(`  - field: ${partnerDoc?.metadata?.field}`);
console.log(`  - structuredCategory: ${partnerDoc?.metadata?.structuredCategory}`);
console.log(`  - topic으로 잡히나? ${filters.topic(partnerDoc, tc)}`);
console.log(`  - targetCategory로 잡히나? ${filters.targetCategory(partnerDoc, tc)}`);
console.log(`  - coreKeywords로 잡히나? ${filters.coreKeywords(partnerDoc, tc)}`);

console.log('\n\n' + '='.repeat(100));
console.log('권장사항');
console.log('='.repeat(100));
