/**
 * 모든 notion 파일을 읽어서 개별 파일로 출력 (UTF-8)
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
const OUT_DIR = path.join(__dirname, '_docs');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 파일 목록 + 큰 파일만 개별 저장
const summary = [];

for (const f of files) {
    const rel = path.relative(BASE, f).replace(/\\/g, '/');
    const d = readJson(f);
    const items = d.items || [];

    for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const answer = item.answer || '';
        const q = item.question || '';
        const len = answer.length;

        summary.push({ rel, idx, q, len, needsSplit: len > 1500 });

        if (len > 800) {
            const safeName = rel.replace(/\//g, '_').replace('.json', '') + '_' + idx + '.txt';
            const content = `파일: ${rel}\n인덱스: ${idx}\n질문: ${q}\n길이: ${len}자\n${'='.repeat(60)}\n\n${answer}`;
            fs.writeFileSync(path.join(OUT_DIR, safeName), content, 'utf8');
        }
    }
}

// 요약 출력
const summaryText = summary
    .sort((a, b) => b.len - a.len)
    .map(s => `${s.needsSplit ? '⚡' : '  '} ${s.rel} [${s.idx}] "${s.q}" (${s.len}자)`)
    .join('\n');

fs.writeFileSync(path.join(OUT_DIR, '_summary.txt'), summaryText, 'utf8');
console.log(`완료: ${summary.length}개 아이템, ${summary.filter(s => s.len > 800).length}개 파일 저장`);
