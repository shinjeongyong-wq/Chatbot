const fs = require('fs');
const path = require('path');

const SPLIT_DIR = 'data_testing/notion_split';
const PL = ['플래너의 역할', '플래너님께서 해주셔야 하는 일', '플래너님이 해주셔야 하는 일', '플래너님이 해주시면 좋은'];

function scan(dir) {
    let r = [];
    fs.readdirSync(dir).forEach(f => {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) r = r.concat(scan(p));
        else if (f.endsWith('.json')) r.push(p);
    });
    return r;
}

const files = scan(SPLIT_DIR);
const results = [];

files.forEach(fp => {
    const rel = path.relative(SPLIT_DIR, fp).replace(/\\/g, '/');
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));

    data.items.forEach((it, i) => {
        const q = it.question;
        const a = it.answer;
        const ch = a.length;
        const isSub = it.id.includes('-sub-');
        const isPl = PL.some(k => q.includes(k));
        const hasTag = /^\[.+\]\n/.test(a);

        const nH3 = (a.match(/### \d+[\.\s]/g) || []).length;
        const arrows = (a.match(/^  ▸ /gm) || []).length;
        const allH3 = (a.match(/^### /gm) || []).length;

        // Case 1: Still bundled numbered sub-items
        if (!isSub && !isPl && nH3 >= 2 && ch > 400) {
            results.push(`SUBSPLIT | ${rel} | #${i} | ${nH3} numbered H3 | ${ch}chars | ${q.substring(0, 70)}`);
        }

        // Case 2: Still bundled arrow items
        if (!isSub && !isPl && arrows >= 2 && ch > 400) {
            results.push(`ARROW | ${rel} | #${i} | ${arrows} arrows | ${ch}chars | ${q.substring(0, 70)}`);
        }

        // Case 3: Sub-split item missing context tag
        if (isSub && !hasTag) {
            results.push(`NO_TAG | ${rel} | #${i} | ${ch}chars | ${q.substring(0, 70)}`);
        }

        // Case 4: Multiple non-numbered H3 sections bundled
        if (!isSub && !isPl && (allH3 - nH3) >= 3 && ch > 800) {
            results.push(`H3_BUNDLE | ${rel} | #${i} | ${allH3 - nH3} non-num H3 | ${ch}chars | ${q.substring(0, 70)}`);
        }
    });
});

console.log('=== SCAN RESULTS ===');
console.log('Total issues: ' + results.length);
console.log('');
results.forEach(r => console.log(r));
