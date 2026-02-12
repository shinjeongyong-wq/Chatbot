const fs = require('fs');
const path = require('path');
function scan(dir) {
    const r = [];
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) r.push(...scan(fp));
        else if (f.endsWith('.json')) r.push(fp);
    }
    return r;
}
const files = scan(path.join(__dirname, 'notion', 'partners'));
for (const f of files) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(path.join(__dirname, 'notion'), f);
    console.log('\n[' + rel + '] items:' + d.items.length);
    for (let j = 0; j < d.items.length; j++) {
        const item = d.items[j];
        const a = item.answer || '';
        console.log('  [' + j + '] "' + item.question + '" (' + a.length + '자)');
        if (a.length > 0) {
            console.log('       → ' + a.substring(0, 120).replace(/\n/g, ' '));
        }
    }
}
