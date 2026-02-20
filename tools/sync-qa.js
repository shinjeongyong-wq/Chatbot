const fs = require('fs');
const https = require('https');
const path = require('path');

const SPREADSHEET_ID = '1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4';
const API_KEY = 'AIzaSyBBkdLW38OJKXPbnzb1oWzXA1fWip0rb78';

const CONFIG = {
    QA: {
        range: 'Q&A!A2:M1000',
        file: 'data/qa/qna.json',
        columns: { QUESTION: 2, ANSWER: 3, FIELD: 7, CATEGORY: 8 }
    },
    FAQ: {
        range: '생성형 FAQ!A2:F1000',
        file: 'data/qa/faq.json',
        columns: { TOPIC_PATH: 0, QUESTION: 1, ANSWER: 2 }
    }
};

function fetchRange(range) {
    return new Promise((resolve, reject) => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) reject(new Error(json.error.message));
                    else resolve(json.values || []);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function parseQAData(rows) {
    return rows.filter(row => row[CONFIG.QA.columns.QUESTION] && row[CONFIG.QA.columns.ANSWER])
        .map((row, idx) => ({
            id: `qa-${idx}`,
            source: 'qa',
            question: row[CONFIG.QA.columns.QUESTION],
            answer: row[CONFIG.QA.columns.ANSWER],
            metadata: {
                field: row[CONFIG.QA.columns.FIELD] || '기타',
                category: row[CONFIG.QA.columns.CATEGORY] || '일반'
            }
        }));
}

function parseFAQData(rows) {
    // FAQ 데이터 파싱 (시트 구조에 맞춰 조정 필요할 수 있음)
    // 첫 행이 헤더일 수 있으므로 유효한 데이터만 필터링
    return rows.filter(row => row[CONFIG.FAQ.columns.QUESTION] && row[CONFIG.FAQ.columns.ANSWER])
        .map((row, idx) => ({
            id: `faq-${idx}`,
            source: 'faq',
            question: row[CONFIG.FAQ.columns.QUESTION],
            answer: row[CONFIG.FAQ.columns.ANSWER],
            metadata: {
                topicPath: row[CONFIG.FAQ.columns.TOPIC_PATH] || '미분류'
            }
        }));
}

async function sync() {
    console.log('🚀 구글 시트 데이터 동기화 시작...');

    try {
        // 1. Q&A 데이터
        console.log('📡 Q&A 데이터 가져오는 중...');
        const qaRows = await fetchRange(CONFIG.QA.range);
        const qaData = parseQAData(qaRows);
        fs.writeFileSync(path.join(process.cwd(), CONFIG.QA.file), JSON.stringify({ items: qaData }, null, 2));
        console.log(`✅ Q&A 데이터 저장 완료: ${qaData.length}개 항목`);

        // 2. FAQ 데이터
        console.log('📡 FAQ 데이터 가져오는 중...');
        const faqRows = await fetchRange(CONFIG.FAQ.range);
        const faqData = parseFAQData(faqRows);
        fs.writeFileSync(path.join(process.cwd(), CONFIG.FAQ.file), JSON.stringify({ items: faqData }, null, 2));
        console.log(`✅ FAQ 데이터 저장 완료: ${faqData.length}개 항목`);

        console.log('\n✨ 모든 데이터가 data/qa/ 폴더에 성공적으로 저장되었습니다!');
    } catch (error) {
        console.error('\n❌ 동기화 중 오류 발생:', error.message);
    }
}

sync();
