/**
 * 문맥 기반 단락 분할 스크립트
 * 
 * 원본 notion 파일을 읽고, 내용 분석을 통해 의미 단위로 분할합니다.
 * - 마크다운 태그가 아닌 주제 전환 기준으로 분할
 * - 관련 내용(설명+예시+팁)을 하나의 단락으로 유지
 * - 단락당 1,000~3,000자 목표
 */
const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');
const OUT_DIR = path.join(__dirname, 'notion_rephrased');

// ─── JSON 읽기 (실제 줄바꿈 포함 JSON 처리) ─────────────────
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

// ─── JSON 쓰기 (읽기 좋게 실제 줄바꿈 유지) ─────────────────
function writeJsonPretty(fp, data) {
    let json = JSON.stringify(data, null, 2);
    // answer 필드 내 \\n → 실제 줄바꿈으로 (#읽기 좋게)
    json = json.replace(/"answer":\s*"/g, (m) => m);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, json, 'utf8');
}

// ─── 키워드 추출 ─────────────────────────────────────────
function extractKeywords(text) {
    // 한글 단어 + 영문 단어 추출
    const words = text.match(/[가-힣]{2,}|[a-zA-Z]{3,}/g) || [];
    const stopWords = new Set(['그리고', '하지만', '또한', '대한', '위한', '통해', '따라', '대해', '있는', '없는', '하는', '되는', '이런', '그런', '이렇게', '그래서', '때문에', '정도', '경우', '필요', '중요', '해야', '하면', '있어요', '없어요', '돼요', '해요', '예요', '이에요', '거예요', '합니다', '있습니다', '됩니다', '습니다', '입니다']);
    const unique = [...new Set(words.filter(w => !stopWords.has(w)))];
    return unique.slice(0, 15);
}

// ─── 주제 기반 문단 분할 (핵심 로직) ────────────────────────
function splitByContext(answer, originalQuestion) {
    const lines = answer.split('\n');
    const paragraphs = [];
    let current = { title: '', lines: [], startH: '' };

    // 각 라인의 레벨 파악 (# = 1, ## = 2, ### = 3 ...)
    function getHeaderLevel(line) {
        const trimmed = line.trim();
        const match = trimmed.match(/^(#{1,6})\s/);
        return match ? match[1].length : 0;
    }

    function getHeaderText(line) {
        return line.trim().replace(/^#{1,6}\s+/, '');
    }

    // 1단계: 큰 주제 블록 식별 (# 또는 ## 수준)
    const blocks = [];
    let currentBlock = { title: '', content: [], headerLevel: 0 };

    for (const line of lines) {
        const level = getHeaderLevel(line);

        if (level > 0 && level <= 2) {
            // 새 큰 주제 시작
            if (currentBlock.content.length > 0 || currentBlock.title) {
                blocks.push({ ...currentBlock, content: [...currentBlock.content] });
            }
            currentBlock = { title: getHeaderText(line), content: [line], headerLevel: level };
        } else {
            currentBlock.content.push(line);
        }
    }
    if (currentBlock.content.length > 0 || currentBlock.title) {
        blocks.push(currentBlock);
    }

    // 2단계: 각 블록 내에서 ### 수준의 소주제로 세분화
    const result = [];

    for (const block of blocks) {
        const blockText = block.content.join('\n');
        const blockLen = blockText.length;

        if (blockLen <= 2500) {
            // 짧은 블록은 그대로 유지
            result.push({
                title: block.title || '내용',
                content: blockText.trim()
            });
            continue;
        }

        // 긴 블록은 ### 수준으로 세분화
        let subBlocks = [];
        let currentSub = { title: block.title, lines: [] };

        for (const line of block.content) {
            const level = getHeaderLevel(line);

            if (level === 3) {
                // 현재 소블록 저장
                if (currentSub.lines.length > 0) {
                    subBlocks.push({ ...currentSub, lines: [...currentSub.lines] });
                }
                currentSub = { title: getHeaderText(line), lines: [line] };
            } else {
                currentSub.lines.push(line);
            }
        }
        if (currentSub.lines.length > 0) {
            subBlocks.push(currentSub);
        }

        // 3단계: 너무 짧은 소블록은 합치기 (최소 300자)
        const merged = [];
        let accum = null;

        for (const sb of subBlocks) {
            const sbText = sb.lines.join('\n').trim();

            if (!accum) {
                accum = { title: sb.title, content: sbText };
                continue;
            }

            const accumLen = accum.content.length;
            const sbLen = sbText.length;

            // 합쳤을 때 3000자 이하이고, 현재 축적이 500자 이하면 합치기
            if (accumLen < 500 && (accumLen + sbLen) <= 3000) {
                accum.content += '\n' + sbText;
                // 제목은 더 의미있는 쪽으로
                if (!accum.title && sb.title) accum.title = sb.title;
            } else {
                merged.push(accum);
                accum = { title: sb.title, content: sbText };
            }
        }
        if (accum) merged.push(accum);

        // 4단계: 여전히 큰 단락(3500자+)은 다시 분할
        for (const m of merged) {
            if (m.content.length > 3500) {
                // 의미단위로 더 쪼개기 (빈 줄 기준 or 번호 목록 기준)
                const subParts = splitLargeBlock(m.content, m.title);
                result.push(...subParts);
            } else {
                result.push(m);
            }
        }
    }

    return result;
}

// 큰 블록을 추가 분할
function splitLargeBlock(content, parentTitle) {
    const lines = content.split('\n');
    const parts = [];
    let current = { title: parentTitle, lines: [] };
    let lineCount = 0;

    for (const line of lines) {
        const trimmed = line.trim();

        // ### 이하 헤더에서 분할 시도
        const level = trimmed.match(/^(#{1,6})\s/) ? trimmed.match(/^(#{1,6})\s/)[1].length : 0;

        if (level >= 3 && current.lines.join('\n').length > 800) {
            parts.push({ title: current.title, content: current.lines.join('\n').trim() });
            current = { title: trimmed.replace(/^#{1,6}\s+/, ''), lines: [line] };
        } else {
            current.lines.push(line);
        }
    }
    if (current.lines.length > 0) {
        parts.push({ title: current.title, content: current.lines.join('\n').trim() });
    }

    return parts;
}

// ─── 파일 단위 처리 ─────────────────────────────────────
function processFile(inputPath, outputPath) {
    const data = readJson(inputPath);
    const items = data.items || [];
    const newItems = [];

    for (const item of items) {
        const answer = item.answer || '';
        const question = item.question || '';
        const answerLen = answer.length;

        // 1500자 이하는 분할 불필요 (그대로 유지)
        if (answerLen <= 1500) {
            newItems.push(item);
            continue;
        }

        // 문맥 기반 분할 수행
        const paragraphs = splitByContext(answer, question);

        if (paragraphs.length <= 1) {
            // 분할 결과가 1개면 원본 유지
            newItems.push(item);
            continue;
        }

        // 분할된 단락을 개별 아이템으로 생성
        for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];
            const paraTitle = para.title || `파트 ${i + 1}`;
            const paraContent = para.content;

            // 빈 내용 건너뛰기
            if (paraContent.trim().length < 50) continue;

            const newItem = {
                id: `${item.id}-p${i + 1}`,
                source: item.source,
                pageId: item.pageId,
                question: `${question} - ${paraTitle}`,
                answer: paraContent,
                metadata: {
                    ...item.metadata,
                    originalQuestion: question,
                    originalId: item.id,
                    paragraphTitle: paraTitle,
                    paragraphIndex: i + 1,
                    totalParagraphs: paragraphs.length,
                    keywords: extractKeywords(paraContent)
                }
            };

            // embeddings 제거
            delete newItem.embeddings;
            if (newItem.metadata) delete newItem.metadata.embeddings;

            newItems.push(newItem);
        }
    }

    // 출력 데이터 구성
    const output = {
        category: data.category,
        subCategory: data.subCategory,
        itemCount: newItems.length,
        lastUpdated: new Date().toISOString(),
        items: newItems
    };

    writeJsonPretty(outputPath, output);

    return {
        file: path.relative(NOTION_DIR, inputPath),
        originalCount: items.length,
        newCount: newItems.length,
        splitItems: newItems.length - items.length
    };
}

// ─── 전체 실행 ──────────────────────────────────────────
function scanDir(dir) {
    let files = [];
    for (const f of fs.readdirSync(dir)) {
        const fp = path.join(dir, f);
        if (fs.statSync(fp).isDirectory()) {
            files.push(...scanDir(fp));
        } else if (f.endsWith('.json') && f !== 'index.json') {
            files.push(fp);
        }
    }
    return files;
}

console.log('🔄 문맥 기반 단락 분할 시작...\n');

const inputFiles = scanDir(NOTION_DIR);
const results = [];

for (const inputFile of inputFiles) {
    const relPath = path.relative(NOTION_DIR, inputFile);
    const outputFile = path.join(OUT_DIR, relPath);

    try {
        const result = processFile(inputFile, outputFile);
        results.push(result);

        const status = result.splitItems > 0
            ? `✅ ${result.originalCount} → ${result.newCount} (+${result.splitItems})`
            : `➡️ ${result.originalCount} (변경 없음)`;
        console.log(`  ${relPath}: ${status}`);
    } catch (e) {
        console.error(`  ❌ ${relPath}: ${e.message}`);
    }
}

// 요약
const totalOriginal = results.reduce((s, r) => s + r.originalCount, 0);
const totalNew = results.reduce((s, r) => s + r.newCount, 0);

console.log(`\n${'='.repeat(60)}`);
console.log(`📊 결과 요약`);
console.log(`  파일 수: ${results.length}`);
console.log(`  원본 아이템: ${totalOriginal}`);
console.log(`  분할 후 아이템: ${totalNew}`);
console.log(`  증가분: +${totalNew - totalOriginal}`);
console.log(`${'='.repeat(60)}`);

// index.json 복사
const indexSrc = path.join(NOTION_DIR, 'index.json');
const indexDst = path.join(OUT_DIR, 'index.json');
if (fs.existsSync(indexSrc)) {
    fs.copyFileSync(indexSrc, indexDst);
    console.log('\n📋 index.json 복사 완료');
}

console.log('\n✅ 분할 완료!');
