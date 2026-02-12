// 각 파일의 answer 처음 부분 + 헤딩 구조 요약 출력
const fs = require('fs');
const path = require('path');
const NOTION_DIR = path.join(__dirname, 'notion');
function scan(dir) {
    const r = [];
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) r.push(...scan(fp));
        else if (f.endsWith('.json')) r.push(fp);
    }
    return r;
}
const files = scan(NOTION_DIR);
// 큰 파일들의 h1 헤딩 + 내용 첫 줄만 출력
for (const f of files) {
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(NOTION_DIR, f);
    for (const item of (data.items || [])) {
        const a = item.answer || '';
        if (a.length < 2000) continue;
        console.log(`\n${'='.repeat(70)}`);
        console.log(`[${rel}] "${item.question}" (${a.length}chars)`);
        console.log('='.repeat(70));
        // h1, h2 헤딩만 + 그 다음 줄 1줄
        const lines = a.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const l = lines[i].trim();
            if (/^#{1,2}\s/.test(l)) {
                console.log(`  L${i + 1}: ${l}`);
            }
        }
    }
}
