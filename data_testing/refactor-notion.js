/**
 * Notion 데이터 리팩토링 스크립트
 * 
 * 1. data_testing/notion/ 의 모든 JSON 파일 읽기
 * 2. embedding 필드 제거
 * 3. answer 필드를 헤딩 기반으로 문단 분리
 * 4. data_testing/notion_rephrased/ 에 결과 저장
 * 5. answer 필드에 실제 줄바꿈 적용 (가독성)
 */
const fs = require('fs');
const path = require('path');

const BASE = __dirname;
const NOTION_DIR = path.join(BASE, 'notion');
const OUTPUT_DIR = path.join(BASE, 'notion_rephrased');
const MIN_SPLIT = 1500;
const MAX_PARA = 4000;

// ─── 유틸 ───
function scanJson(dir) {
    const r = [];
    if (!fs.existsSync(dir)) return r;
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) r.push(...scanJson(fp));
        else if (f.endsWith('.json')) r.push(fp);
    }
    return r;
}

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); }

// ─── 헤딩 기반 분리 ───
function splitByHeading(answer, level) {
    const lines = answer.split('\n');
    const pfx = '#'.repeat(level);
    const re = new RegExp(`^${pfx}(?!#)\\s+(.+)`);
    const sections = [];
    let cur = null;
    let pre = [];

    for (const line of lines) {
        const m = line.trim().match(re);
        if (m) {
            if (cur) sections.push(cur);
            else if (pre.some(l => l.trim())) {
                sections.push({ title: '개요', content: pre.join('\n').trim() });
            }
            cur = { title: m[1].replace(/\[이미지\]/g, '').trim(), content: line };
        } else {
            if (cur) cur.content += '\n' + line;
            else pre.push(line);
        }
    }
    if (cur) sections.push(cur);
    else if (pre.some(l => l.trim())) {
        sections.push({ title: '개요', content: pre.join('\n').trim() });
    }

    // 100자 미만 섹션은 이전에 머지
    const merged = [];
    for (const s of sections) {
        if (s.content.trim().length < 100 && merged.length > 0) {
            merged[merged.length - 1].content += '\n\n' + s.content;
        } else {
            merged.push({ ...s, content: s.content.trim() });
        }
    }
    return merged;
}

// 재귀적 분리: 큰 섹션은 하위 레벨로 추가 분리
function splitRecursive(answer) {
    if (answer.length < MIN_SPLIT) return null;

    const lines = answer.split('\n');
    const h1 = lines.filter(l => /^#(?!#)\s/.test(l.trim())).length;
    const h2 = lines.filter(l => /^##(?!#)\s/.test(l.trim())).length;
    const h3 = lines.filter(l => /^###(?!#)\s/.test(l.trim())).length;

    let sections, nextLevel;
    if (h1 >= 2) { sections = splitByHeading(answer, 1); nextLevel = 2; }
    else if (h2 >= 3) { sections = splitByHeading(answer, 2); nextLevel = 3; }
    else if (h3 >= 4) { sections = splitByHeading(answer, 3); nextLevel = 0; }
    else return null;

    if (sections.length <= 1) return null;

    // 큰 섹션 추가 분리
    if (nextLevel > 0) {
        const expanded = [];
        for (const sec of sections) {
            if (sec.content.length > MAX_PARA) {
                const sub = splitByHeading(sec.content, nextLevel);
                if (sub.length >= 2) {
                    sub.forEach(s => {
                        s.title = sec.title + ' > ' + s.title;
                        expanded.push(s);
                    });
                    continue;
                }
            }
            expanded.push(sec);
        }
        return expanded;
    }
    return sections;
}

// ─── 키워드 추출 ───
function extractKeywords(title, content) {
    const kw = new Set();
    // 타이틀에서
    title.replace(/[^\w가-힣\s]/g, '').split(/\s+/)
        .filter(w => w.length >= 2).forEach(w => kw.add(w));
    // 헤딩에서
    (content.match(/^#{1,3}\s+(.+)/gm) || []).forEach(h => {
        h.replace(/^#+\s+/, '').replace(/[^\w가-힣\s]/g, '')
            .split(/\s+/).filter(w => w.length >= 2).forEach(w => kw.add(w));
    });
    return [...kw].slice(0, 12);
}

// ─── 아이템 문단 분리 ───
function paragraphItem(item) {
    const answer = item.answer || '';

    // embedding 제거
    const clean = { ...item };
    delete clean.embedding;
    if (clean.metadata) {
        clean.metadata = { ...clean.metadata };
        delete clean.metadata.embedding;
    }

    if (answer.length < MIN_SPLIT) return [clean];

    const sections = splitRecursive(answer);
    if (!sections || sections.length <= 1) return [clean];

    return sections.map((sec, idx) => ({
        id: `${item.id}-p${idx + 1}`,
        source: item.source,
        pageId: item.pageId,
        question: `${item.question} - ${sec.title}`,
        answer: sec.content.trim(),
        metadata: {
            ...(clean.metadata || {}),
            originalQuestion: item.question,
            originalId: item.id,
            paragraphTitle: sec.title,
            keywords: extractKeywords(sec.title, sec.content)
        }
    }));
}

// ─── JSON 포맷팅 (answer에 실제 줄바꿈) ───
function writeFormattedJson(filepath, data) {
    const json = JSON.stringify(data, null, 2);
    const lines = json.split('\n');
    const expanded = [];

    for (const line of lines) {
        // "answer": "...내용..." 패턴 찾기
        const m = line.match(/^(\s*"answer":\s*")((?:[^"\\]|\\.)*)("(?:,?\s*))$/);
        if (m) {
            const [, prefix, content, suffix] = m;
            const indent = ' '.repeat(prefix.indexOf('"answer"') + 2);
            const formatted = content.replace(/\\n/g, '\n' + indent);
            expanded.push(prefix + formatted + suffix);
        } else {
            expanded.push(line);
        }
    }

    ensureDir(path.dirname(filepath));
    fs.writeFileSync(filepath, expanded.join('\n'), 'utf8');
}

// ─── 메인 실행 ───
function main() {
    console.log('=== Notion 데이터 리팩토링 시작 ===\n');

    // 1. 출력 디렉토리 확인 (이미 PowerShell에서 정리됨)
    ensureDir(OUTPUT_DIR);
    console.log('✅ notion_rephrased/ 준비 완료');

    // 2. 소스 파일 스캔
    const files = scanJson(NOTION_DIR);
    console.log(`📁 소스 파일: ${files.length}개\n`);

    let totalOriginal = 0;
    let totalParagraphed = 0;
    const summary = [];

    for (const srcFile of files) {
        const rel = path.relative(NOTION_DIR, srcFile);
        const data = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
        const items = data.items || [];
        totalOriginal += items.length;

        // 3. 각 아이템 처리 (embedding 제거 + 문단 분리)
        const newItems = [];
        for (const item of items) {
            const paragraphs = paragraphItem(item);
            newItems.push(...paragraphs);
        }
        totalParagraphed += newItems.length;

        // 4. 원본 파일 업데이트 (embedding 제거만)
        const cleanedOriginal = {
            ...data,
            itemCount: items.length,
            items: items.map(it => {
                const c = { ...it };
                delete c.embedding;
                if (c.metadata) { c.metadata = { ...c.metadata }; delete c.metadata.embedding; }
                return c;
            })
        };
        writeFormattedJson(srcFile, cleanedOriginal);

        // 5. 리팩토링된 파일 저장
        const outFile = path.join(OUTPUT_DIR, rel);
        const outData = {
            category: data.category,
            subCategory: data.subCategory,
            itemCount: newItems.length,
            lastUpdated: new Date().toISOString(),
            items: newItems
        };
        writeFormattedJson(outFile, outData);

        const diff = newItems.length - items.length;
        const marker = diff > 0 ? `+${diff}` : diff === 0 ? '=' : `${diff}`;
        console.log(`  📄 ${rel}: ${items.length} → ${newItems.length} (${marker})`);
        summary.push({ file: rel, before: items.length, after: newItems.length });
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`📊 결과 요약`);
    console.log(`  원본 아이템: ${totalOriginal}`);
    console.log(`  분리 후 아이템: ${totalParagraphed}`);
    console.log(`  증가: +${totalParagraphed - totalOriginal}`);
    console.log(`${'='.repeat(50)}\n`);

    // 분리된 파일 상세
    const split = summary.filter(s => s.after > s.before);
    if (split.length > 0) {
        console.log('📝 문단 분리된 파일:');
        for (const s of split) {
            console.log(`  ${s.file}: ${s.before} → ${s.after}`);
        }
    }

    console.log('\n✅ 리팩토링 완료!');
}

try {
    main();
} catch (e) {
    const msg = `ERROR: ${e.message}\nSTACK: ${e.stack}`;
    console.error(msg);
    fs.writeFileSync(path.join(BASE, '_error_log.txt'), msg, 'utf8');
    process.exit(1);
}
