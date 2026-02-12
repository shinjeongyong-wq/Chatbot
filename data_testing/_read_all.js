/**
 * 모든 notion 파일의 내용을 읽어서 하나의 파일로 출력
 */
const fs = require('fs');
const path = require('path');

function scan(d) {
    let r = [];
    for (const f of fs.readdirSync(d)) {
        const fp = path.join(d, f);
        if (fs.statSync(fp).isDirectory()) r.push(...scan(fp));
        else if (f.endsWith('.json')) r.push(fp);
    }
    return r;
}

// answer에 실제 줄바꿈이 있는 JSON을 안전하게 읽기
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

const BASE = path.join(__dirname, 'notion');
const files = scan(BASE);

// 파일 요약 출력
console.log('=== 파일 목록 ===\n');
for (const f of files) {
    const rel = path.relative(BASE, f).replace(/\\/g, '/');
    const d = readJson(f);
    const items = d.items || [];
    const lens = items.map(i => (i.answer || '').length);
    const total = lens.reduce((a, b) => a + b, 0);
    console.log(`${rel} | items:${items.length} | total:${total} | max:${Math.max(0, ...lens)}`);
}

// 큰 문서들의 내용 출력 (1500자 이상 아이템)
console.log('\n\n=== 큰 문서 내용 출력 ===\n');
for (const f of files) {
    const rel = path.relative(BASE, f).replace(/\\/g, '/');
    const d = readJson(f);
    const items = d.items || [];

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const answer = item.answer || '';
        if (answer.length < 1500) continue;

        console.log('\n' + '█'.repeat(80));
        console.log(`📄 ${rel} [${idx}] "${item.question}" (${answer.length}자)`);
        console.log('█'.repeat(80));
        console.log(answer);
    }
}
