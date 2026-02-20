const https = require('https');

const SPREADSHEET_ID = '1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4';
const API_KEY = 'AIzaSyBBkdLW38OJKXPbnzb1oWzXA1fWip0rb78';
const RANGES = ['Q&A!A1:M2', '생성형 FAQ!A1:F2'];

function fetchRange(range) {
    return new Promise((resolve, reject) => {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                const json = JSON.parse(data);
                if (json.error) {
                    reject(json.error);
                } else {
                    resolve(json.values);
                }
            });
        }).on('error', reject);
    });
}

async function test() {
    console.log('🔍 구글 시트 연결 테스트 중...');
    for (const range of RANGES) {
        try {
            const values = await fetchRange(range);
            console.log(`✅ [${range}] 데이터 읽기 성공! (행 수: ${values ? values.length : 0})`);
            if (values && values.length > 0) {
                console.log('   첫 행 데이터:', values[0]);
            }
        } catch (error) {
            console.error(`❌ [${range}] 오류:`, error.message);
        }
    }
}

test();
