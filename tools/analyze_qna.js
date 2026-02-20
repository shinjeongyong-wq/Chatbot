const fs = require('fs');
const path = require('path');

const qnaPath = path.join(__dirname, 'data/qa/qna.json');

try {
    const rawData = fs.readFileSync(qnaPath, 'utf-8');
    const data = JSON.parse(rawData);

    const items = data.items || [];
    const count = items.length;

    console.log(`총 데이터 개수: ${count}개`);

    if (count > 0) {
        // ID 분석
        const ids = items.map(item => {
            const match = item.id.match(/^qa-(\d+)$/);
            return match ? parseInt(match[1]) : -1;
        }).filter(id => id !== -1);

        const maxId = Math.max(...ids);
        console.log(`최대 ID 번호: qa-${maxId}`);

        // Field 및 Category 분석
        const fields = {};
        const categories = {};
        let totalQList = 0;
        let totalALen = 0;

        items.forEach(item => {
            const f = item.metadata?.field || 'unknown';
            const c = item.metadata?.category || 'unknown';

            fields[f] = (fields[f] || 0) + 1;
            categories[c] = (categories[c] || 0) + 1;

            totalQList += item.question.length;
            totalALen += item.answer.length;
        });

        console.log('\n[Field 분포 Top 5]');
        Object.entries(fields)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([key, val]) => console.log(`- ${key}: ${val}개`));

        console.log('\n[Category 분포 Top 5]');
        Object.entries(categories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([key, val]) => console.log(`- ${key}: ${val}개`));

        console.log(`\n평균 질문 길이: ${Math.round(totalQList / count)}자`);
        console.log(`평균 답변 길이: ${Math.round(totalALen / count)}자`);

        // 샘플 출력 (처음, 중간, 끝)
        console.log('\n[샘플 데이터]');
        console.log('1. 첫번째:', JSON.stringify(items[0], null, 2));
        console.log('2. 중간:', JSON.stringify(items[Math.floor(count / 2)], null, 2));
        console.log('3. 마지막:', JSON.stringify(items[items.length - 1], null, 2));
    }

} catch (error) {
    console.error('분석 중 오류 발생:', error);
}
