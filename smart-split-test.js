const fs = require('fs');
const path = require('path');

const inputFile = 'data/notion/hospital-opening-roadmap.json';
const outputFile = 'data_testing/roadmap_split_test.json';

function smartSplit(filePath) {
    const rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const originalItem = rawData.items[0];
    const content = originalItem.answer;

    // 분리 규칙: '###' 또는 '---' 또는 '▸' 기준
    // 세밀하게 나누기 위해 정규표현식 사용
    const sections = content.split(/(?=### |---|▸ )/g);

    const newItems = [];
    let currentWave = "전체";

    sections.forEach((section, index) => {
        let trimmed = section.trim();
        if (!trimmed || trimmed === "---") return;

        // 웨이브 정보 업데이트
        if (trimmed.includes("1차 웨이브")) currentWave = "1차 웨이브";
        if (trimmed.includes("2차 웨이브")) currentWave = "2차 웨이브";
        if (trimmed.includes("3차 웨이브")) currentWave = "3차 웨이브";

        // 질문 제목 추출 (첫 줄 또는 헤더)
        let firstLine = trimmed.split('\n')[0].replace(/### |---|\*|▸|✅|📌|🌊/g, '').trim();
        if (!firstLine || firstLine.length < 2) firstLine = "상세 정보";

        // 답변 내용 정리 (구분선 제거 등)
        let cleanAnswer = trimmed.replace(/^---\n/, '').trim();

        newItems.push({
            id: `${originalItem.id}-split-${index}`,
            source: originalItem.source,
            pageId: originalItem.pageId,
            question: `${originalItem.question} - ${firstLine}`,
            answer: cleanAnswer,
            metadata: {
                ...originalItem.metadata,
                splitTopic: firstLine,
                wave: currentWave
            }
        });
    });

    const result = {
        ...rawData,
        itemCount: newItems.length,
        items: newItems
    };

    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2), 'utf8');
    console.log(`✅ Splitting complete: ${newItems.length} items created.`);
}

if (!fs.existsSync('data_testing')) fs.mkdirSync('data_testing');
smartSplit(inputFile);
