/**
 * 모든 notion 문서의 answer에서 # 헤딩 구조만 추출
 */
const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');

function scan(dir) {
    const results = [];
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) results.push(...scan(fp));
        else if (f.endsWith('.json')) results.push(fp);
    }
    return results;
}

const files = scan(NOTION_DIR);

for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(NOTION_DIR, f);
    const items = data.items || [];

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const answer = item.answer || '';
        if (answer.length < 1500) continue; // 짧은 건 스킵

        console.log(`\n${'='.repeat(80)}`);
        console.log(`FILE: ${rel} [${idx}] "${item.question}" (${answer.length} chars)`);
        console.log('='.repeat(80));

        // 헤딩 라인만 추출
        const lines = answer.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#')) {
                const level = line.match(/^#+/)[0].length;
                const indent = '  '.repeat(level - 1);
                console.log(`  L${String(i + 1).padStart(4)} ${indent}${line}`);
            }
        }
    }
}
