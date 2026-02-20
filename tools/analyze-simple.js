// Simplified filter analysis
const fs = require('fs');
const path = require('path');

function loadAllData() {
    const data = [];
    const qnaPath = './data/qa/qna.json';
    if (fs.existsSync(qnaPath)) {
        const qnaData = JSON.parse(fs.readFileSync(qnaPath, 'utf-8'));
        qnaData.items?.forEach(item => data.push({ ...item, source: 'qa' }));
    }
    const faqPath = './data/qa/faq.json';
    if (fs.existsSync(faqPath)) {
        const faqData = JSON.parse(fs.readFileSync(faqPath, 'utf-8'));
        faqData.items?.forEach(item => data.push({ ...item, source: 'faq' }));
    }
    const notionDir = './data/notion';
    const loadNotionRecursive = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) loadNotionRecursive(fullPath);
            else if (entry.name.endsWith('.json') && !entry.name.includes('index')) {
                const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                content.items?.forEach(item => data.push({ ...item, source: 'notion' }));
            }
        }
    };
    loadNotionRecursive(notionDir);
    return data;
}

const data = loadAllData();
console.log('Total:', data.length);

// Test case: complex query
const tc = {
    topic: ['개원로드맵', '인테리어'],
    targetCategory: ['hospital-opening-roadmap', 'partners'],
    targetSubCategory: ['roadmap', 'pre-construction/interior'],
    coreKeywords: ['개원', '프로세스', '인테리어', '파트너사'],
    expandedKeywords: ['개원 절차', '병원 인테리어', '시공사', '협력사']
};

const filters = {
    T: (item) => { const f = item.metadata?.field || ''; return tc.topic.some(t => f.includes(t)); },
    C: (item) => { const c = item.metadata?.structuredCategory || ''; return tc.targetCategory.some(t => c.includes(t)); },
    S: (item) => { const s = item.metadata?.structuredSubCategory || ''; return tc.targetSubCategory.some(t => s.includes(t)); },
    K: (item) => { const txt = (item.question || '') + (item.answer || ''); return tc.coreKeywords.some(k => txt.includes(k)); },
    E: (item) => { const txt = (item.question || '') + (item.answer || ''); return tc.expandedKeywords.some(k => txt.includes(k)); }
};

// Check roadmap doc
const roadmap = data.find(d => d.metadata?.structuredCategory === 'hospital-opening-roadmap');
const partner = data.find(d => d.question?.includes('인테리어') && d.metadata?.structuredCategory === 'partners');

console.log('\n=== ROADMAP DOC ===');
console.log('Q:', roadmap?.question?.substring(0, 40));
console.log('field:', roadmap?.metadata?.field);
console.log('structuredCategory:', roadmap?.metadata?.structuredCategory);
console.log('T(topic):', filters.T(roadmap));
console.log('C(category):', filters.C(roadmap));
console.log('S(subCat):', filters.S(roadmap));
console.log('K(coreKW):', filters.K(roadmap));
console.log('E(expandKW):', filters.E(roadmap));

console.log('\n=== PARTNER DOC ===');
console.log('Q:', partner?.question?.substring(0, 40));
console.log('field:', partner?.metadata?.field);
console.log('structuredCategory:', partner?.metadata?.structuredCategory);
console.log('T(topic):', filters.T(partner));
console.log('C(category):', filters.C(partner));
console.log('K(coreKW):', filters.K(partner));

// All combinations
const names = ['T', 'C', 'S', 'K', 'E'];
const results = [];
for (let i = 1; i < 32; i++) {
    const combo = names.filter((_, j) => i & (1 << j));
    const filtered = data.filter(item => combo.some(f => filters[f](item)));
    const hasRoadmap = filtered.some(d => d.metadata?.structuredCategory === 'hospital-opening-roadmap');
    const hasPartner = filtered.some(d => d.question?.includes('인테리어') && d.metadata?.structuredCategory === 'partners');
    results.push({
        combo: combo.join('+'),
        count: filtered.length,
        pct: (filtered.length / data.length * 100).toFixed(1),
        roadmap: hasRoadmap ? 'Y' : 'N',
        partner: hasPartner ? 'Y' : 'N'
    });
}
results.sort((a, b) => a.count - b.count);

console.log('\n=== ALL COMBINATIONS (sorted by count) ===');
console.log('Combo                 | Count |  Pct  | Roadmap | Partner');
console.log('-----------------------------------------------------------');
results.forEach(r => {
    console.log(`${r.combo.padEnd(20)} | ${String(r.count).padStart(5)} | ${r.pct.padStart(5)}% |    ${r.roadmap}    |    ${r.partner}`);
});
