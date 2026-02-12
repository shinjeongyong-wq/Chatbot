/**
 * 파트너사 tier별 분포와 진료과 페널티 영향 분석
 */
const fs = require('fs');
const path = require('path');

// _add_tier.js의 tier 매핑 가져오기
const tierMapPath = path.resolve(__dirname, '_add_tier.js');
const tierScript = fs.readFileSync(tierMapPath, 'utf-8');

// 파트너사 데이터 로드
const partnersDir = path.resolve(__dirname, '../data/notion/partners');
const categories = {};

function scan(dir) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) scan(p);
        else if (f.endsWith('.json') && !f.includes('backup')) {
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            const sub = data.subCategory || path.basename(f, '.json');
            const catName = path.basename(f, '.json');
            if (!data.items) return;
            categories[catName] = data.items.map(item => ({
                name: item.question,
                tier: item.metadata?.tier || null,
                specs: item.metadata?.specialties || [],
                field: item.metadata?.field || ''
            }));
        }
    }
}
scan(partnersDir);

console.log('═══════════════════════════════════════════════════════════');
console.log('  📊 파트너사 Tier × 진료과 분석');
console.log('  👤 사용자: 미용(피부과/성형외과)');
console.log('═══════════════════════════════════════════════════════════\n');

for (const [cat, items] of Object.entries(categories)) {
    console.log(`\n📁 ${cat} (${items.length}개)`);
    console.log('─'.repeat(65));

    // tier별 그룹핑
    const byTier = { 1: [], 2: [], 3: [], none: [] };
    for (const item of items) {
        const key = item.tier || 'none';
        byTier[key] = byTier[key] || [];
        byTier[key].push(item);
    }

    for (const tier of [1, 2, 3, 'none']) {
        const group = byTier[tier];
        if (!group || group.length === 0) continue;
        const label = tier === 'none' ? '(비파트너/종합)' : `T${tier}`;
        console.log(`  [${label}]`);
        for (const item of group) {
            const hasMiyong = item.specs.some(s =>
                ['미용', '피부', '성형'].includes(s.toLowerCase())
            );
            const penalty = (item.specs.length > 0 && !item.specs.some(s => s.toLowerCase() === '미용'))
                ? '❌ ×0.6 페널티'
                : (item.specs.length > 0 ? '✅ 미용 포함' : '⬜ 태그없음');
            console.log(`    ${item.name.padEnd(25)} specs=[${item.specs.join(',')}] → ${penalty}`);
        }
    }
}

// 간판 파트너사의 스코어 시뮬레이션 (테스트4)
console.log('\n\n═══════════════════════════════════════════════════════════');
console.log('  🔍 테스트4 심층 분석: "간판 파트너사 추천해줘"');
console.log('═══════════════════════════════════════════════════════════\n');

const signageData = JSON.parse(fs.readFileSync(
    path.join(partnersDir, 'pre-construction/signage.json'), 'utf-8'
));

const coreKW = ['간판', '파트너사', '추천', '업체'];
const expandKW = ['미용', '피부과', '성형외과', '디자인', '시공'];

for (const item of signageData.items) {
    const q = item.question || '';
    const answer = item.answer || '';
    const field = item.metadata?.field || '';
    const specs = item.metadata?.specialties || [];
    const text = (q + ' ' + answer + ' ' + field + ' ' + specs.join(' ')).toLowerCase();
    const question = q.toLowerCase();

    let coreHits = 0;
    for (const kw of coreKW) {
        if (text.includes(kw)) { coreHits++; if (question.includes(kw)) coreHits += 0.5; }
    }
    const coreScore = Math.min((coreHits / coreKW.length) * 0.6, 0.6);

    let expandHits = 0;
    for (const kw of expandKW) { if (text.includes(kw)) expandHits++; }
    const expandScore = Math.min((expandHits / expandKW.length) * 0.25, 0.25);

    let topicScore = 0;
    if (field.toLowerCase().includes('간판') || question.includes('간판')) topicScore = 0.1;

    const itemField = (field || '').toLowerCase();
    const itemTopic = (item.metadata?.topic || '').toLowerCase();
    let topicBonus = (itemTopic.includes('간판') || itemField.includes('간판')) ? 0.5 : 0;
    const partnerBonus = 0.2;

    let specBonus = 0;
    if (specs.some(s => s.toLowerCase() === '미용')) specBonus = 0.2;

    const rawScore = coreScore + expandScore + topicScore + topicBonus + partnerBonus + specBonus;

    const hasSpec = specs.length > 0;
    const matchesUser = specs.some(s => s.toLowerCase() === '미용');
    const penalty = (hasSpec && !matchesUser) ? 0.6 : 1.0;
    const finalScore = rawScore * penalty;

    const tier = item.metadata?.tier || '-';
    const pass = finalScore >= 1.175 ? '✅ PASS' : '❌ FAIL';
    console.log(`  T${tier} ${q.padEnd(20)} raw=${rawScore.toFixed(3)} × ${penalty} = ${finalScore.toFixed(3)} ${pass} | specs=[${specs.join(',')}]`);
}
