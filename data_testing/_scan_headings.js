const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');

function sanitizeJson(raw) {
    const len = raw.length;
    const result = [];
    let inString = false;
    let i = 0;
    let chunkStart = 0;
    while (i < len) {
        const c = raw.charCodeAt(i);
        if (inString) {
            if (c === 92) { i += 2; continue; }
            if (c === 34) { inString = false; i++; continue; }
            if (c === 10) { result.push(raw.substring(chunkStart, i)); result.push('\\n'); chunkStart = i + 1; }
            else if (c === 13) { result.push(raw.substring(chunkStart, i)); result.push('\\r'); chunkStart = i + 1; }
            else if (c === 9) { result.push(raw.substring(chunkStart, i)); result.push('\\t'); chunkStart = i + 1; }
            else if (c < 32) { result.push(raw.substring(chunkStart, i)); result.push(' '); chunkStart = i + 1; }
            i++;
        } else {
            if (c === 34) inString = true;
            i++;
        }
    }
    result.push(raw.substring(chunkStart));
    return result.join('');
}

function findJsonFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) results.push(...findJsonFiles(fullPath));
        else if (entry.name.endsWith('.json') && entry.name !== 'index.json') results.push(fullPath);
    }
    return results;
}

const files = findJsonFiles(NOTION_DIR);

for (const file of files) {
    const rel = path.relative(NOTION_DIR, file);
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(sanitizeJson(raw));

    console.log(`\n${'='.repeat(60)}`);
    console.log(`FILE: ${rel}`);
    console.log(`Items: ${data.items?.length || 0}`);

    for (let idx = 0; idx < (data.items?.length || 0); idx++) {
        const item = data.items[idx];
        const answer = item.answer || '';
        const headings = answer.match(/^#{1,3}\s+.+$/gm) || [];

        console.log(`  [${idx}] Q: ${(item.question || '').substring(0, 60)}`);
        console.log(`      Length: ${answer.length} chars`);
        console.log(`      Headings (${headings.length}):`);
        headings.forEach(h => console.log(`        ${h.trim().substring(0, 80)}`));
    }
}
