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

// [1회독] 구조 파악 (Structure Scan)
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
            // 숫자 리스트 시작점
            structureMap.push({ type: 'list-item', title: trimmed, lineIndex: index });
        }
    });

    return { lines, structureMap };
}

// [2회독] 의미 분석 (Semantic Analysis)
function pass2_analyzeSemantics(lines, structureMap) {
    const chunks = [];
    let lastSplitIndex = 0;

    console.log(`\n[2회독 분석 시작] 총 ${structureMap.length}개의 구조 요소 분석 중...`);

    // 구조 요소들을 순회하며 "여기서 자를까 말까" 결정
    for (let i = 0; i < structureMap.length; i++) {
        const current = structureMap[i];
        const next = structureMap[i + 1];

        let shouldSplit = false;
        let reason = "";

        // 판단 로직 1: 고유명사형 헤더 (예: 써마지, 피코레이저 등)
        // 헤더 레벨이 3(###)이거나 2(##)이면서, 제목이 짧고 명사형이면 독립 정보로 간주
        if (current.type === 'header') {
            if (current.title.length < 20 && !current.title.includes('팁') && !current.title.includes('주의사항')) {
                // 앞의 내용과 충분히 거리가 있거나, 헤더 레벨이 높으면 분리
                if (current.linesIndex - lastSplitIndex > 5) {
                    shouldSplit = true;
                    reason = `독립적 주제 헤더 식별: [${current.title}]`;
                }
            }
        }

        // 판단 로직 2: 리스트 아이템이 길어지는 경우
        if (current.type === 'list-item') {
            // 다음 요소까지의 거리가 멀면 (즉, 설명이 길면) 분리
            const distToNext = next ? next.lineIndex - current.lineIndex : lines.length - current.lineIndex;
            if (distToNext > 10) { // 설명이 10줄 이상이면
                shouldSplit = true;
                reason = `상세 설명이 포함된 리스트 아이템: [${current.title.substring(0, 15)}...]`;
            }
        }

        if (shouldSplit) {
            // 실제로 자르기
            // 자르는 위치는 해당 헤더/리스트의 바로 윗줄 (빈 줄 포함 등 고려)
            let splitPoint = current.lineIndex;

            // 앞의 빈 줄들 포함해서 자르기
            while (splitPoint > lastSplitIndex && lines[splitPoint - 1].trim() === '') {
                splitPoint--;
            }

            if (splitPoint > lastSplitIndex) {
                const chunkContent = lines.slice(lastSplitIndex, splitPoint).join('\n').trim();
                if (chunkContent.length > 0) {
                    chunks.push({
                        content: chunkContent,
                        startLine: lastSplitIndex,
                        endLine: splitPoint,
                        splitReason: "이전 섹션 종료"
                    });
                    console.log(`  ✂️ 분할 결정: 라인 ${splitPoint}에서 절단. (사유: ${reason})`);
                }
                lastSplitIndex = splitPoint;
            }
        }
    }

    // 마지막 조각 추가
    const finalChunk = lines.slice(lastSplitIndex).join('\n').trim();
    if (finalChunk.length > 0) {
        chunks.push({ content: finalChunk, startLine: lastSplitIndex, endLine: lines.length });
    }

    return chunks;
}

// [3회독] 다듬기 및 제목 짓기 (Refinement)
function pass3_refineAndTitle(originalQuestion, chunks) {
    const refined = [];

    chunks.forEach((chunk, idx) => {
        // 너무 짧은 조각(예: 100자 미만)은 앞이나 뒤에 붙여야 함 (여기선 단순화하여 무시하거나 그대로 둠)
        // 제목 생성 로직
        let subTitle = "";
        const lines = chunk.content.split('\n');

        // 첫 줄이 헤더면 제목으로 사용
        const firstLine = lines[0].trim();
        if (firstLine.startsWith('#')) {
            subTitle = firstLine.replace(/#+\s*/, '');
        } else if (firstLine.match(/^\d+\.\s/)) {
            subTitle = firstLine.replace(/^\d+\.\s*/, '');
        } else {
            // 본문 내용을 요약해야 하는데, 여기선 첫 줄을 사용
            subTitle = firstLine.substring(0, 30) + (firstLine.length > 30 ? "..." : "");
        }

        // 특수문자 제거
        subTitle = subTitle.replace(/[*_`]/g, '');

        refined.push({
            id: idx,
            question: `${originalQuestion} - ${subTitle}`,
            answer: chunk.content
        });
    });

    return refined;
}

function processFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    if (!data.items) return;

    console.log(`\n📂 파일 처리 중: ${path.basename(filePath)}`);

    data.items.forEach(item => {
        // 1. Structure Scan
        const { lines, structureMap } = pass1_scanStructure(item.answer);

        // 2. Semantic Analysis
        const rawChunks = pass2_analyzeSemantics(lines, structureMap);

        // 3. Refinement
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

// 특정 파일만 상세 로그를 보기 위해 먼저 처리 (medical-device-beauty.json)
const deviceFile = allFiles.find(f => f.includes('medical-device-beauty.json'));
if (deviceFile) {
    processFile(deviceFile);
    // 나머지 처리
    allFiles.filter(f => f !== deviceFile).forEach(processFile);
} else {
    allFiles.forEach(processFile);
}

fs.writeFileSync(viewerDataFile, JSON.stringify(results, null, 2));
console.log(`\n✅ 3-Pass Processing Complete. Viewer updated.`);
