const fs = require('fs');
const path = require('path');

const targetPaths = [
    'data_testing/notion/advanced',
    'data_testing/notion/hospital-basics/during-construction',
    'data_testing/notion/hospital-basics/post-opening',
    'data_testing/notion/hospital-basics/pre-construction',
    'data_testing/notion/hospital-opening-roadmap.json'
];

const outputDir = 'data_testing/notion_split';
const viewerDataFile = 'data_testing/viewer_data.json';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const results = [];

function getFiles(p) {
    if (p.endsWith('.json')) return [p];
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

// 원장님의 '유도리' 기준을 적용한 고도화된 분리 함수
function advancedIntelligentSplit(title, content) {
    const lines = content.split('\n');
    let chunks = [];
    let currentChunk = [];

    // 분리 후보 지점을 찾습니다.
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        let shouldSplit = false;

        // 1. 대주제 전환 (## 수준의 헤더나 명확한 숫자 단계)
        if (line.match(/^## /) || line.match(/^### \d+\./)) {
            shouldSplit = true;
        }

        // 2. 내용적으로 완전히 다른 파트 (예: # 으로 시작하는 새 섹션)
        if (line.startsWith('# ') && i > 0) {
            shouldSplit = true;
        }

        // [유도리] 도입부(💡, 📌) 등으로 시작하면 앞의 헤더와 같이 가야 함 -> split 보류
        if (line.match(/^[💡📌⚠️✅]/) && currentChunk.length < 5) {
            shouldSplit = false;
        }

        if (shouldSplit && currentChunk.length > 0) {
            // [유도리] 현재 모은 내용이 너무 적으면(예: 250자 미만) 자르지 않고 계속 붙임
            const currentText = currentChunk.join('\n');
            if (currentText.length > 250) {
                chunks.push(currentText.trim());
                currentChunk = [];
            }
        }

        currentChunk.push(lines[i]);
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n').trim());
    }

    // [최종 병합] 쪼개진 결과 중에서도 너무 짧은 게 있으면 뒷 문단과 합침
    const finalChunks = [];
    let buffer = "";

    chunks.forEach((chunk, idx) => {
        if (buffer) {
            buffer += "\n\n" + chunk;
        } else {
            buffer = chunk;
        }

        // 충분한 정보량이 찼거나 마지막 문단이면 확정
        if (buffer.length > 400 || idx === chunks.length - 1) {
            finalChunks.push(buffer);
            buffer = "";
        }
    });

    return finalChunks;
}

let allFiles = [];
targetPaths.forEach(tp => {
    const fullPath = path.resolve(tp);
    if (fs.existsSync(fullPath)) {
        allFiles = allFiles.concat(getFiles(fullPath));
    }
});

allFiles.forEach(file => {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.items) return;

    data.items.forEach(item => {
        const splitAnswers = advancedIntelligentSplit(item.question, item.answer);

        results.push({
            fileName: path.basename(file),
            originalQuestion: item.question,
            originalAnswer: item.answer,
            splits: splitAnswers.map((ans, idx) => ({
                id: `${item.id}-s${idx}`,
                question: `${item.question} (Part ${idx + 1})`,
                answer: ans
            }))
        });
    });
});

fs.writeFileSync(viewerDataFile, JSON.stringify(results, null, 2));
console.log(`✅ Refined processing complete. Items are now more cohesive.`);
