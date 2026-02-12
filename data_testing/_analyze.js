/**
 * Notion 데이터 구조 분석 스크립트
 * 각 파일의 아이템 수, 답변 길이, 헤딩 구조를 분석
 */
const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');

function scan(dir) {
    const results = [];
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) {
            results.push(...scan(fp));
        } else if (f.endsWith('.json')) {
            results.push(fp);
        }
    }
    return results;
}

const files = scan(NOTION_DIR);
let totalItems = 0;
let longItems = []; // answer > 2000 chars

console.log('=== Notion 데이터 구조 분석 ===\n');

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(NOTION_DIR, f);
    const items = data.items || [];
    totalItems += items.length;

    const lens = items.map(i => (i.answer || '').length);
    const total = lens.reduce((a, b) => a + b, 0);

    console.log(`📄 ${rel}`);
    console.log(`   items: ${items.length} | total_chars: ${total}`);

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const answer = item.answer || '';
        const len = answer.length;

        // 헤딩 구조 분석
        const h1 = (answer.match(/^# [^#]/gm) || []).length;
        const h2 = (answer.match(/^## [^#]/gm) || []).length;
        const h3 = (answer.match(/^### /gm) || []).length;

        if (len > 500) {
            console.log(`   [${idx}] "${item.question}" | ${len}chars | h1:${h1} h2:${h2} h3:${h3}`);
        }

        if (len > 2000) {
            longItems.push({
                file: rel,
                idx,
                question: item.question,
                len,
                h1, h2, h3
            });
        }
    }
    console.log('');
}

console.log(`\n=== 요약 ===`);
console.log(`총 파일: ${files.length}`);
console.log(`총 아이템: ${totalItems}`);
console.log(`긴 아이템 (>2000chars): ${longItems.length}\n`);

console.log('=== 분리가 필요한 긴 문서 목록 ===');
longItems.sort((a, b) => b.len - a.len);
for (const item of longItems) {
    console.log(`  ${item.file} [${item.idx}] "${item.question}" → ${item.len}chars (h1:${item.h1} h2:${item.h2} h3:${item.h3})`);
}
