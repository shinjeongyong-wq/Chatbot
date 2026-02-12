/**
 * 파트너사 JSON 파일을 tier별로 분리하는 스크립트
 * 
 * 사용법:
 *   node data_testing/_split_tier.js split    → tier별 분리
 *   node data_testing/_split_tier.js restore  → 원래대로 복원
 */
const fs = require('fs');
const path = require('path');

const TIER_MAP = {
    '무아디자인': 1, '인투익스': 1, '메이드바이': 1,
    '톤앤무드': 2, '네스트디자인': 2,
    '플랜디자인': 3, '아임디자인': 3, '플럭스': 3,
    '더 코나 메디스페이스': 3, 'JWC그룹': 3, '씨투와이': 3, '써드스페이스': 3,
    'LS디자인': 1, '디자인캐프': 1,
    '더프라임': 2, '디온에이(D.on.A)': 2,
    '동부기업': 3,
};

// signage.json에서 간판 업체(지웍스 제외-시트명이 다를 수 있음)
// interior.json, signage.json만 분리 대상

const mode = process.argv[2] || 'split';
const partnersDir = path.resolve(__dirname, '..', 'data', 'notion', 'partners');
const backupDir = path.resolve(__dirname, '..', 'data', 'notion', 'partners_backup');

function splitFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.items) return;

    const tiers = { 1: [], 2: [], 3: [] };
    const nonPartner = [];

    for (const item of data.items) {
        if (item.metadata?.category === 'DB 레코드') {
            const name = (item.question || '').trim();
            const tier = TIER_MAP[name] || 3;
            item.metadata.tier = tier;
            tiers[tier].push(item);
        } else {
            nonPartner.push(item);
        }
    }

    const basename = path.basename(filePath, '.json');
    const dir = path.dirname(filePath);

    for (const t of [1, 2, 3]) {
        if (tiers[t].length === 0) continue;
        const tierData = { ...data, items: tiers[t] };
        const tierFile = path.join(dir, `${basename}-tier${t}.json`);
        fs.writeFileSync(tierFile, JSON.stringify(tierData, null, 2), 'utf-8');
        console.log(`  ✅ ${path.relative(partnersDir, tierFile)}: ${tiers[t].length}개 파트너사`);
    }

    // 원본은 비파트너 문서만 남김 (또는 전부 비우기)
    if (nonPartner.length > 0) {
        const remaining = { ...data, items: nonPartner };
        fs.writeFileSync(filePath, JSON.stringify(remaining, null, 2), 'utf-8');
        console.log(`  📄 ${path.relative(partnersDir, filePath)}: ${nonPartner.length}개 비파트너 문서 유지`);
    } else {
        // 원본 파일은 빈 items로
        fs.writeFileSync(filePath, JSON.stringify({ ...data, items: [] }, null, 2), 'utf-8');
        console.log(`  📄 ${path.relative(partnersDir, filePath)}: 비움 (파트너 문서 모두 분리됨)`);
    }
}

function restoreFile(filePath) {
    const basename = path.basename(filePath, '.json');
    const dir = path.dirname(filePath);

    // 백업에서 원본 복원
    const backupFile = path.join(backupDir, path.relative(partnersDir, filePath));
    if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, filePath);
        console.log(`  🔄 ${path.relative(partnersDir, filePath)}: 백업에서 복원`);
    }

    // tier 파일 삭제
    for (const t of [1, 2, 3]) {
        const tierFile = path.join(dir, `${basename}-tier${t}.json`);
        if (fs.existsSync(tierFile)) {
            fs.unlinkSync(tierFile);
            console.log(`  🗑️ ${path.relative(partnersDir, tierFile)}: 삭제`);
        }
    }
}

const targetFiles = [
    path.join(partnersDir, 'pre-construction', 'interior.json'),
    path.join(partnersDir, 'pre-construction', 'signage.json'),
];

console.log(`\n🔧 파일 ${mode === 'split' ? '분리' : '복원'} 중...\n`);

for (const f of targetFiles) {
    if (mode === 'split') splitFile(f);
    else restoreFile(f);
}

console.log('\n✅ 완료\n');
