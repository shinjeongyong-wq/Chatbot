const fs = require('fs');
const path = require('path');

const SPLITS_FILE = 'data_testing/manual_splits.json';
const NOTION_DIR = 'data_testing/notion';
const VIEWER_DATA = 'data_testing/viewer_data.json';

if (!fs.existsSync(SPLITS_FILE)) {
    console.error("수동 분할 데이터가 없습니다.");
    process.exit(1);
}

const manualSplits = JSON.parse(fs.readFileSync(SPLITS_FILE, 'utf8'));

function executeSplits() {
    let viewerData = [];

    for (const [relativePath, splitPoints] of Object.entries(manualSplits)) {
        const fullPath = path.join(NOTION_DIR, relativePath);
        if (!fs.existsSync(fullPath)) continue;

        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
        const item = data.items[0];
        const lines = item.answer.split('\n');
        const sortedPoints = splitPoints.sort((a, b) => a - b);

        let chunks = [];
        let start = 0;

        sortedPoints.forEach(point => {
            const chunkLines = lines.slice(start, point + 1); // point 뒤에서 자름
            chunks.push(chunkLines.join('\n').trim());
            start = point + 1;
        });

        // 마지막 남은 부분
        if (start < lines.length) {
            chunks.push(lines.slice(start).join('\n').trim());
        }

        // 결과 가공
        const processedSplits = chunks.map((chunk, idx) => {
            const firstLine = chunk.split('\n')[0].trim().replace(/#+\s*/, '').replace(/[*_]/g, '');
            return {
                id: `${item.id}-manual-${idx}`,
                question: `${item.question} - ${firstLine.substring(0, 40)}${firstLine.length > 40 ? '...' : ''}`,
                answer: chunk
            };
        });

        viewerData.push({
            fileName: relativePath,
            originalQuestion: item.question,
            originalAnswer: item.answer,
            splits: processedSplits
        });

        // 실제 파일로도 저장 (검증용)
        const outputFilePath = path.join('data_testing/notion_split', relativePath);
        const outputDir = path.dirname(outputFilePath);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

        fs.writeFileSync(outputFilePath, JSON.stringify({
            ...data,
            itemCount: processedSplits.length,
            items: processedSplits
        }, null, 2));
    }

    fs.writeFileSync(VIEWER_DATA, JSON.stringify(viewerData, null, 2));
    console.log(`✅ manual split execution complete for ${Object.keys(manualSplits).length} files.`);
}

executeSplits();
