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

function getFiles(p) {
    if (p.endsWith('.json')) return [p];
    let files = [];
    if (!fs.existsSync(p)) return [];

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

// 인간의 눈으로 보고 쪼개는 로직 (Final Refined Version)
function humanLikeSplit(title, content) {
    const lines = content.split('\n');
    let chunks = [];
    let currentChunk = [];

    // Chunk의 성격을 파악하기 위한 상태 변수
    let hasStructuralSubItems = false; // "• 특징", "• 장점" 같은 서브 구조가 있는지

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]; // trim하지 않고 원본 들여쓰기 유지
        const trimmedLine = line.trim();

        let shouldSplit = false;

        // [Rule 1: 강력한 헤더 분할]
        // #, ##, ### 뒤에 텍스트가 있으면 무조건 새로운 주제의 시작으로 간주
        if (trimmedLine.match(/^#{1,3}\s+/)) {
            // 단, 현재 청크가 거의 비어있으면(제목만 있고 내용 없음) 자르지 않음
            if (currentChunk.join('\n').trim().length > 50) {
                shouldSplit = true;
            }
        }

        // [Rule 2: 긴 번호 목록 분할]
        // "1. 어쩌구"로 시작하는데, 그 내용이 길어질 것 같으면 분할
        // (단순히 1. 2. 3. 나열이 아니라, 1. 하고 설명이 줄줄 달리는 경우)
        if (trimmedLine.match(/^\d+\.\s+/)) {
            // 앞의 내용이 이미 충분히 길고(100자 이상), 이전 라인이 빈 줄이었을 때
            if (currentChunk.join('\n').length > 100 && lines[i - 1]?.trim() === '') {
                shouldSplit = true;
            }
        }

        // [Rule 3: 특정 키워드 섹션 분리]
        // "미팅 전 준비", "1차 인테리어" 같은 단계별 명사가 나오면 분리
        if (trimmedLine.match(/^(단계|Step|Phase) \d+|^\d+차\s?|^[가-힣]+(준비|절차|미팅|계약)/) && trimmedLine.length < 30) {
            // 이전에 맥락이 끊어진 경우(빈 줄)
            if (lines[i - 1]?.trim() === '' && currentChunk.length > 5) {
                shouldSplit = true;
            }
        }

        // 실행
        if (shouldSplit) {
            // [Check] 분할 하되, 너무 짧은 건 합치는 로직 (유도리)
            // 하지만 "의료기기 상세" 처럼 구조화된 서브 리스트(•)가 있으면 짧아도 독립시킴
            const chunkText = currentChunk.join('\n');
            const feelsLikeDictItem = currentChunk.some(l => l.trim().startsWith('•') || l.trim().startsWith('- '));

            // 일반 텍스트인데 150자 미만이면 병합 (너무 자잘한 것 방지)
            if (chunkText.length < 150 && !feelsLikeDictItem && !chunkText.includes('#')) {
                // Keep accumulating (Don't push yet, actually this logic is tricky in loop)
                // 현재 루프 구조상 'shouldSplit'을 취소하는 게 맞음
                shouldSplit = false;
            } else {
                chunks.push(chunkText);
                currentChunk = [];
                hasStructuralSubItems = false;
            }
        }

        currentChunk.push(line);
        if (trimmedLine.startsWith('•') || trimmedLine.startsWith('- ')) {
            hasStructuralSubItems = true;
        }
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }

    // [Post-Processing] 빈 껍데기나 제목만 있는 청크 정리
    return chunks.filter(c => c.trim().length > 10).map(c => c.trim());
}


let allFiles = [];
targetPaths.forEach(tp => {
    const fullPath = path.resolve(tp);
    allFiles = allFiles.concat(getFiles(fullPath));
});

allFiles.forEach(file => {
    try {
        const fileContent = fs.readFileSync(file, 'utf8');
        const data = JSON.parse(fileContent);
        if (!data.items) return;

        data.items.forEach(item => {
            const splitAnswers = humanLikeSplit(item.question, item.answer);

            results.push({
                fileName: path.basename(file),
                originalQuestion: item.question,
                originalAnswer: item.answer,
                splits: splitAnswers.map((ans, idx) => {
                    // 제목 추출 (첫 줄이 헤더면 그것을 제목으로)
                    let subTopic = "";
                    const firstLine = ans.split('\n')[0].trim();
                    if (firstLine.startsWith('#')) subTopic = firstLine.replace(/#+\s*/, '');
                    else if (firstLine.match(/^\d+\./)) subTopic = firstLine;

                    const q = subTopic ? `${item.question} - ${subTopic}` : `${item.question} (${idx + 1})`;

                    return {
                        id: `${item.id}-s${idx}`,
                        question: q,
                        answer: ans
                    };
                })
            });
        });
    } catch (e) {
        console.error(`Error processing ${file}: ${e.message}`);
    }
});

fs.writeFileSync(viewerDataFile, JSON.stringify(results, null, 2));
console.log(`✅ List-sensitive splitting complete. Processed ${results.length} files.`);
