/**
 * recover-splits.js
 * viewer_data.json에서 날아간 notion_split 파일들 복구
 * 그 후 context-subsplit.js와 context-subsplit-concepts.js 재적용
 */
const fs = require('fs');
const path = require('path');

const VIEWER_DATA = 'data_testing/viewer_data.json';
const NOTION_DIR = 'data_testing/notion';
const SPLIT_DIR = 'data_testing/notion_split';

const viewerData = JSON.parse(fs.readFileSync(VIEWER_DATA, 'utf8'));

console.log('=== 1단계: viewer_data.json에서 기본 분할 복구 ===\n');

let recovered = 0;
let alreadyOk = 0;

viewerData.forEach(entry => {
    const outPath = path.join(SPLIT_DIR, entry.fileName);
    const outDir = path.dirname(outPath);

    // Check if file exists and has correct number of items
    let needsRecovery = true;
    if (fs.existsSync(outPath)) {
        try {
            const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
            // If existing has sub-splits already applied, skip
            if (existing.items.some(it => it.id.includes('-sub-'))) {
                console.log(`  ✅ ${entry.fileName} — 이미 세분화 적용됨 (${existing.itemCount}개), 스킵`);
                alreadyOk++;
                needsRecovery = false;
            }
        } catch (e) { }
    }

    if (needsRecovery) {
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        // Get original data structure from notion dir
        const origPath = path.join(NOTION_DIR, entry.fileName);
        let origData = {};
        if (fs.existsSync(origPath)) {
            origData = JSON.parse(fs.readFileSync(origPath, 'utf8'));
        }

        const result = {
            ...origData,
            itemCount: entry.splits.length,
            items: entry.splits
        };

        fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
        console.log(`  🔧 ${entry.fileName} — 복구 완료 (${entry.splits.length}개)`);
        recovered++;
    }
});

console.log(`\n복구: ${recovered}개, 기존 유지: ${alreadyOk}개\n`);

// Step 2: Re-apply context-subsplit (절차별 세부 설명)
console.log('=== 2단계: 절차별 세부 설명 세분화 재적용 ===\n');

const PLANNER_EXCLUSIONS = ['플래너의 역할', '플래너님께서 해주셔야 하는 일', '플래너님이 해주셔야 하는 일', '플래너님이 해주시면 좋은'];

function shouldSubSplit(answer, question) {
    if (PLANNER_EXCLUSIONS.some(kw => question.includes(kw))) return false;
    const chars = answer.length;
    const numberedH3 = (answer.match(/### \d+[\.\s]/g) || []).length;
    const arrowItems = (answer.match(/^  ▸ /gm) || []).length;
    if (numberedH3 >= 3 && chars > 500) return true;
    if (arrowItems >= 3 && chars > 500) return true;
    if (chars > 5000) return true;
    return false;
}

function extractSubSections(answer) {
    let matches = [...answer.matchAll(/### \d+[\.\s][^\n]*/g)];
    if (matches.length < 3) {
        matches = [...answer.matchAll(/^  ▸ [^\n]*/gm)];
    }
    if (matches.length < 3) return null;

    const firstMatchIdx = matches[0].index;
    const textBefore = answer.substring(0, firstMatchIdx);
    let parentHeading = '';
    const h2Match = textBefore.match(/## \**([^\n*]+)\**/);
    const h1Match = textBefore.match(/# \**([^\n*]+)\**/);
    const h3TitleMatch = textBefore.match(/### ([^\n]+)/);
    if (h2Match) parentHeading = h2Match[1].trim();
    else if (h3TitleMatch) parentHeading = h3TitleMatch[1].trim();
    else if (h1Match) parentHeading = h1Match[1].trim();

    const sections = [];
    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : answer.length;
        const title = matches[i][0].replace(/^### /, '').replace(/^  ▸ /, '').replace(/\*+/g, '').trim();
        const content = answer.substring(start, end).trim();
        sections.push({ title, content });
    }
    return { parentHeading, sections };
}

function scan(dir) {
    let r = [];
    fs.readdirSync(dir).forEach(f => {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) r = r.concat(scan(p));
        else if (f.endsWith('.json')) r.push(p);
    });
    return r;
}

const allFiles = scan(SPLIT_DIR);
let totalSubSplits = 0;

allFiles.forEach(fp => {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    // Skip if already has sub-splits
    if (data.items.some(it => it.id.includes('-sub-'))) return;

    const newItems = [];
    let splitCount = 0;

    data.items.forEach((item, idx) => {
        if (!shouldSubSplit(item.answer, item.question)) {
            newItems.push(item);
            return;
        }
        const result = extractSubSections(item.answer);
        if (!result || result.sections.length < 3) {
            newItems.push(item);
            return;
        }
        splitCount++;
        const parentLabel = result.parentHeading || item.question.split(' - ').pop();
        result.sections.forEach((sec, si) => {
            newItems.push({
                id: `${item.id}-sub-${si}`,
                question: `${item.question} > ${sec.title}`,
                answer: `[${parentLabel}]\n\n${sec.content}`
            });
        });
    });

    if (splitCount > 0) {
        data.items = newItems;
        data.itemCount = newItems.length;
        fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
        const rel = path.relative(SPLIT_DIR, fp).replace(/\\/g, '/');
        console.log(`  ✂️ ${rel}: ${splitCount}개 청크 세분화 → ${data.itemCount}개`);
        totalSubSplits += splitCount;
    }
});
console.log(`  총 ${totalSubSplits}개 청크 세분화 완료\n`);

// Step 3: Re-apply concepts split (핵심 개념)
console.log('=== 3단계: 핵심 개념 세분화 재적용 ===\n');

const CONCEPT_TARGETS = [
    { file: path.join(SPLIT_DIR, 'hospital-basics/post-opening/admin.json'), match: '기초 지식' },
    { file: path.join(SPLIT_DIR, 'hospital-basics/post-opening/emr-crm.json'), match: '핵심 개념' },
    { file: path.join(SPLIT_DIR, 'hospital-basics/pre-construction/medical-device.json'), match: '핵심 개념' },
    { file: path.join(SPLIT_DIR, 'hospital-basics/pre-construction/tax-loan.json'), match: '핵심 개념' }
];

function splitByH3(answer) {
    const matches = [...answer.matchAll(/^### ([^\n]+)/gm)];
    if (matches.length < 2) return null;
    let parent = '';
    const before = answer.substring(0, matches[0].index);
    const h2m = before.match(/## \**([^\n*]+)/);
    if (h2m) parent = h2m[1].trim();
    const sections = [];
    for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : answer.length;
        sections.push({ title: matches[i][1].replace(/\*+/g, '').trim(), content: answer.substring(start, end).trim() });
    }
    return { parent, sections };
}

CONCEPT_TARGETS.forEach(target => {
    if (!fs.existsSync(target.file)) return;
    const data = JSON.parse(fs.readFileSync(target.file, 'utf8'));
    const newItems = [];
    let changed = false;

    data.items.forEach((item) => {
        if (item.id.includes('-sub-') || !item.question.includes(target.match) ||
            item.question.includes('해주셔야') || item.question.includes('해주시면')) {
            newItems.push(item);
            return;
        }
        const result = splitByH3(item.answer);
        if (!result || result.sections.length < 2) { newItems.push(item); return; }
        changed = true;
        const parentLabel = result.parent || item.question.split(' - ').pop();
        console.log(`  ✂️ ${path.basename(target.file)}: "${item.question.split(' - ').pop()}" → ${result.sections.length}개`);
        result.sections.forEach((sec, si) => {
            newItems.push({
                id: `${item.id}-sub-${si}`,
                question: `${item.question} > ${sec.title}`,
                answer: `[${parentLabel}]\n\n${sec.content}`
            });
        });
    });

    if (changed) {
        data.items = newItems;
        data.itemCount = newItems.length;
        fs.writeFileSync(target.file, JSON.stringify(data, null, 2), 'utf8');
    }
});

// Final count
console.log('\n=== 최종 결과 ===\n');
let totalItems = 0;
let totalFiles = 0;
scan(SPLIT_DIR).forEach(fp => {
    const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
    totalItems += data.itemCount;
    totalFiles++;
});
console.log(`총 파일: ${totalFiles}개`);
console.log(`총 아이템: ${totalItems}개`);
console.log('\n✅ 복구 및 재적용 완료!');
