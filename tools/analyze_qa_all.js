const fs = require('fs');
const path = require('path');

const qnaPath = path.join(__dirname, 'data/qa/qna.json');
const faqPath = path.join(__dirname, 'data/qa/faq.json');
const resultPath = path.join(__dirname, 'analysis_result.txt');

let logContent = '';

function log(message) {
    console.log(message);
    logContent += message + '\n';
}

function analyzeFile(filePath, label) {
    if (!fs.existsSync(filePath)) {
        log(`[${label}] 파일이 존재하지 않습니다.`);
        return { count: 0, maxId: 0 };
    }

    try {
        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(rawData);
        const items = data.items || [];
        const count = items.length;

        log(`\n=== [${label}] 분석 결과 ===`);
        log(`- 파일 경로: ${filePath}`);
        log(`- 총 데이터 개수: ${count}개`);

        let maxId = 0;
        let idPrefix = '';

        if (count > 0) {
            // ID 분석
            const ids = items.map(item => {
                const match = item.id.match(/^([a-z]+)-(\d+)$/);
                if (match) {
                    idPrefix = match[1];
                    return parseInt(match[2]);
                }
                return -1;
            }).filter(id => id !== -1);

            if (ids.length > 0) {
                // 정확한 maxId 찾기 (Number 정렬)
                maxId = Math.max(...ids);
                log(`- ID 패턴: ${idPrefix}-OOO`);
                log(`- 최대 ID 번호: ${maxId}`);
            }

            // Field 및 Category 분석
            const fields = {};
            const categories = {};

            items.forEach(item => {
                const f = item.metadata?.field || 'unknown';
                const c = item.metadata?.category || 'unknown';
                fields[f] = (fields[f] || 0) + 1;
                categories[c] = (categories[c] || 0) + 1;
            });

            // 상위 5개로 늘려서 확인
            log(`- 주요 Field (Top 5): ${Object.entries(fields).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')}`);
            log(`- 주요 Category (Top 5): ${Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}(${v})`).join(', ')}`);

            // 샘플 데이터
            if (items.length > 0) {
                log(`- 샘플 데이터: ${JSON.stringify(items[0], null, 2)}`);
            }
        }

        return { count, maxId, idPrefix };

    } catch (error) {
        log(`[${label}] 분석 중 오류 발생: ${error.message}`);
        return { count: 0, maxId: 0 };
    }
}

log("=== 전체 QA 데이터 분석 시작 ===");
const qnaResult = analyzeFile(qnaPath, "QnA 데이터");
const faqResult = analyzeFile(faqPath, "FAQ 데이터");

log("\n=== 최종 요약 ===");
log(`총 QnA 개수: ${qnaResult.count}`);
log(`총 FAQ 개수: ${faqResult.count}`);
log(`전체 합계: ${qnaResult.count + faqResult.count}`);
log(`\n[참고] QnA 데이터 추가 시 ID는 'qa-${qnaResult.maxId + 1}'부터 시작하면 됩니다.`);

fs.writeFileSync(resultPath, logContent, 'utf-8');
log(`\n분석 결과가 ${resultPath}에 저장되었습니다.`);
