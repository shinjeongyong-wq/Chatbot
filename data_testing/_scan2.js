const fs = require('fs');
const path = require('path');

function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const results = [];
    for (const f of entries) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) results.push(...scan(p));
        else if (f.name.endsWith('.json') && f.name !== 'index.json') results.push(p);
    }
    return results;
}

const files = scan('notion');
for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, 'utf-8'));
    const rel = path.relative('notion', f);
    for (let i = 0; i < d.items.length; i++) {
        const a = d.items[i].answer || '';
        if (a.length > 1500) {
            const hs = a.split('\n').filter(l => l.trim().match(/^#{1,3}\s/));
            console.log(`\n[${rel}] item ${i} (${a.length}chars, ${hs.length} headings):`);
            hs.forEach(h => console.log('  ' + h.trim().substring(0, 90)));
        }
    }
}
