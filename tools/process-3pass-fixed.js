const fs = require('fs');
const path = require('path');

const targetPaths = [
    'data_testing/notion/advanced',
    'data_testing/notion/hospital-basics/during-construction',
    'data_testing/notion/hospital-basics/post-opening',
    'data_testing/notion/hospital-basics/pre-construction',
    'data_testing/notion/hospital-opening-roadmap.json'
];

const viewerDataFile = 'data_testing/viewer_data.json';
const results = [];

// [1회독] 구조 스캔
function pass1_scanStructure(content) {
    const lines = content.split('\n');
    const structureMap = [];

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) {
            const level = trimmed.match(/^#+/)[0].length;
            const title = trimmed.replace(/^#+\s*/, '');
            structureMap.push({ type: 'header', level, title, lineIndex: index });
        } else if (trimmed.match(/^\d+\.\s/)) {
            structureMap.push({ type: 'list-item', title: trimmed, lineIndex: index });
        }
    });

    return { lines, structureMap };
}

// [2회독] 의미 분석 (강제 분할 포함)
function pass2_analyzeSemantics(lines, structureMap) {
    const chunks = [];
    let lastSplitIndex = 0;

    // 구조체 순회 분할 시도
    for (let i = 0; i < structureMap.length; i++) {
        const current = structureMap[i];

        // 1. 헤더 분할: ##, ### 은 내용이 짧더라도 독립성을 인정해 분할 시도
        if (current.type === 'header') {
            const dist = current.lineIndex - lastSplitIndex;
            // 이전 분할점으로부터 내용이 조금이라도(5줄 이상) 있으면 자름
            if (dist > 5) {
                // 이번 헤더 바로 위에서 자르기
                let cutPoint = current.lineIndex;
                while (cutPoint > lastSplitIndex && lines[cutPoint - 1].trim() === '') cutPoint--;

                if (cutPoint > lastSplitIndex) {
                    chunks.push({
                        content: lines.slice(lastSplitIndex, cutPoint).join('\n').trim(),
                        startLine: lastSplitIndex,
                        endLine: cutPoint
                    });
                    lastSplitIndex = cutPoint;
                }
            }
        }

        // 2. 리스트 분할: 1. 2. 3. ... 항목 사이가 길면 자름
        if (current.type === 'list-item') {
            const dist = current.lineIndex - lastSplitIndex;
            // 앞 내용이 15줄 이상이면 자름 (설명이 긴 경우)
            if (dist > 15) {
                let cutPoint = current.lineIndex;
                while (cutPoint > lastSplitIndex && lines[cutPoint - 1].trim() === '') cutPoint--;

                if (cutPoint > lastSplitIndex) {
                    chunks.push({
                        content: lines.slice(lastSplitIndex, cutPoint).join('\n').trim(),
                        startLine: lastSplitIndex,
                        endLine: cutPoint
                    });
                    lastSplitIndex = cutPoint;
                }
            }
        }
    }

    // 마지막 조각
    if (lastSplitIndex < lines.length) {
        chunks.push({
            content: lines.slice(lastSplitIndex).join('\n').trim(),
            startLine: lastSplitIndex,
            endLine: lines.length
        });
    }

    // [Fallback Logic] 만약 여전히 통짜(1개)이고 길이가 길다면?
    if (chunks.length === 1 && chunks[0].content.length > 500) {
        // console.log("  ⚠️ 통짜 문서 감지! 강제 분할 모드 발동");
        return forceSplitByParagraphs(lines);
    }

    // 조각 중에서도 너무 긴 것(2000자 이상)이 있으면 내부 재분할
    const refinedChunks = [];
    chunks.forEach(chunk => {
        if (chunk.content.length > 1500) {
            // console.log("  ⚠️ 거대 조각 감지! 내부 재분할");
            const subChunks = forceSplitByParagraphs(chunk.content.split('\n'));
            refinedChunks.push(...subChunks);
        } else {
            refinedChunks.push(chunk);
        }
    });

    return refinedChunks;
}

// [강제 분할 함수] 문맥(빈 줄) 기준으로 쪼갬
function forceSplitByParagraphs(lines) {
    const forcedChunks = [];
    let currentLines = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 빈 줄이 2개 연속되거나, 특정 구분선이 나오면 분할
        const isSeparator = (line.trim() === '' && lines[i - 1]?.trim() === '') || line.startsWith('---');

        if (isSeparator && currentLines.join('\n').length > 300) {
            forcedChunks.push({ content: currentLines.join('\n').trim() });
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    // 남은 것
    if (currentLines.length > 0) {
        forcedChunks.push({ content: currentLines.join('\n').trim() });
    }

    return forcedChunks;
}


// [3회독] 다듬기 및 제목
function pass3_refineAndTitle(originalQuestion, chunks) {
    return chunks.map((chunk, idx) => {
        let title = "";
        const lines = chunk.content.split('\n');

        // 헤더 찾기
        for (let l of lines) {
            if (l.trim().startsWith('#')) {
                title = l.trim().replace(/^#+\s*/, '');
                break;
            } else if (l.trim().match(/^\d+\.\s/)) {
                title = l.trim();
                break;
            } else if (l.trim().startsWith('•') || l.trim().startsWith('-')) {
                // 리스트 아이템이 제목일 경우
                const clean = l.trim().replace(/^[•-]\s*/, '');
                if (clean.length < 30) {
                    title = clean;
                    break;
                }
            }
        }

        if (!title) title = lines[0].substring(0, 30).replace(/[*#]/g, '') + "...";

        return {
            id: idx,
            question: `${originalQuestion} - ${title}`,
            answer: chunk.content
        };
    });
}

function processFile(filePath) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.items) return;

    data.items.forEach(item => {
        const { lines, structureMap } = pass1_scanStructure(item.answer);
        const rawChunks = pass2_analyzeSemantics(lines, structureMap);
        const finalChunks = pass3_refineAndTitle(item.question, rawChunks);

        results.push({
            fileName: path.basename(filePath),
            originalQuestion: item.question,
            originalAnswer: item.answer,
            splits: finalChunks
        });
    });
}

function getFiles(p) {
    if (p.endsWith('.json')) return [p];
    if (!fs.existsSync(p)) return [];
    let files = [];
    const list = fs.readdirSync(p);
    list.forEach(file => {
        const fullPath = path.join(p, file);
        if (fs.statSync(fullPath).isDirectory()) {
            files = files.concat(getFiles(fullPath));
        } else if (file.endsWith('.json') && file !== 'index.json') {
            files.push(fullPath);
        }
    });
    return files;
}

let allFiles = [];
targetPaths.forEach(tp => {
    allFiles = allFiles.concat(getFiles(path.resolve(tp)));
});
allFiles.forEach(processFile);

fs.writeFileSync(viewerDataFile, JSON.stringify(results, null, 2));
console.log(`✅ Fixed splitting logic. Processed ${results.length} files.`);
