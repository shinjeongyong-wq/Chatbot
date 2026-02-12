/**
 * 비교 뷰어용 데이터 생성 (v3)
 * 동일 ID 문제 해결 - 인덱스 기반 매칭 추가
 */
const fs = require('fs');
const path = require('path');

function readJson(fp) {
    let raw = fs.readFileSync(fp, 'utf8');
    try { return JSON.parse(raw); }
    catch (e) {
        let fixed = '', inStr = false, esc = false;
        for (let i = 0; i < raw.length; i++) {
            const ch = raw[i];
            if (inStr) {
                if (esc) { esc = false; fixed += ch; continue }
                if (ch === '\\') { esc = true; fixed += ch; continue }
                if (ch === '\n') { fixed += '\\n'; continue }
                if (ch === '\r') { continue }
                if (ch === '"') { inStr = false }
                fixed += ch;
            } else {
                if (ch === '"') inStr = true;
                fixed += ch;
            }
        }
        return JSON.parse(fixed);
    }
}

function scanDir(dir) {
    let files = [];
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) files.push(...scanDir(fp));
        else if (f.endsWith('.json') && f !== 'index.json') files.push(fp);
    }
    return files;
}

const NOTION = path.join(__dirname, 'notion');
const REPHRASED = path.join(__dirname, 'notion_rephrased');
const origFiles = scanDir(NOTION);
const compareData = [];

for (const origFile of origFiles) {
    const rel = path.relative(NOTION, origFile).replace(/\\/g, '/');
    const rephrasedFile = path.join(REPHRASED, path.relative(NOTION, origFile));

    const origData = readJson(origFile);
    const origItems = origData.items || [];

    let rephrasedItems = [];
    if (fs.existsSync(rephrasedFile)) {
        const rephrasedData = readJson(rephrasedFile);
        rephrasedItems = rephrasedData.items || [];
    }

    // 원본이 1개 아이템인 경우 → 모든 rephrased가 이 아이템에서 분할된 것
    if (origItems.length === 1) {
        const item = origItems[0];
        compareData.push({
            file: rel,
            originalId: item.id,
            originalQuestion: item.question,
            originalAnswer: item.answer || '',
            originalLength: (item.answer || '').length,
            paragraphs: rephrasedItems.map(p => ({
                id: p.id,
                question: p.question,
                answer: p.answer || '',
                length: (p.answer || '').length,
                keywords: p.metadata?.keywords || [],
                paragraphTitle: p.metadata?.paragraphTitle || ''
            })),
            wasSplit: rephrasedItems.length > 1
        });
        continue;
    }

    // 원본이 여러 아이템인 경우 → 각각 매칭
    for (let idx = 0; idx < origItems.length; idx++) {
        const item = origItems[idx];

        // originalId 기반 매칭
        const byOrigId = rephrasedItems.filter(ri => ri.metadata?.originalId === item.id);

        if (byOrigId.length > 0) {
            // 분할된 경우
            compareData.push({
                file: rel,
                originalId: item.id,
                originalQuestion: item.question,
                originalAnswer: item.answer || '',
                originalLength: (item.answer || '').length,
                paragraphs: byOrigId.map(p => ({
                    id: p.id,
                    question: p.question,
                    answer: p.answer || '',
                    length: (p.answer || '').length,
                    keywords: p.metadata?.keywords || [],
                    paragraphTitle: p.metadata?.paragraphTitle || ''
                })),
                wasSplit: byOrigId.length > 1
            });
        } else {
            // 분할 안 된 경우 → 같은 인덱스의 rephrased 아이템 사용
            const rItem = rephrasedItems[idx] || item;
            compareData.push({
                file: rel,
                originalId: item.id,
                originalQuestion: item.question,
                originalAnswer: item.answer || '',
                originalLength: (item.answer || '').length,
                paragraphs: [{
                    id: rItem.id,
                    question: rItem.question,
                    answer: rItem.answer || '',
                    length: (rItem.answer || '').length,
                    keywords: rItem.metadata?.keywords || [],
                    paragraphTitle: '원본 유지'
                }],
                wasSplit: false
            });
        }
    }
}

const totalOriginal = compareData.length;
const splitDocs = compareData.filter(d => d.wasSplit).length;
const totalParagraphs = compareData.reduce((s, d) => s + d.paragraphs.length, 0);

const output = {
    generated: new Date().toISOString(),
    stats: {
        totalOriginalDocs: totalOriginal,
        splitDocs,
        unchangedDocs: totalOriginal - splitDocs,
        totalParagraphs,
        avgParagraphsPerSplit: splitDocs > 0 ? Math.round(totalParagraphs / splitDocs * 10) / 10 : 0
    },
    items: compareData
};

fs.writeFileSync(
    path.join(__dirname, 'compare-data.json'),
    JSON.stringify(output, null, 2),
    'utf8'
);

console.log('📊 비교 데이터 생성 완료');
console.log(`  원본 문서: ${totalOriginal}개`);
console.log(`  분할된 문서: ${splitDocs}개`);
console.log(`  변경 없음: ${totalOriginal - splitDocs}개`);
console.log(`  총 단락: ${totalParagraphs}개`);
