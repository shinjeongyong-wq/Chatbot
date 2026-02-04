const fs = require('fs');
const https = require('https');

const topicsToShorten = JSON.parse(fs.readFileSync('topics_to_shorten.json', 'utf8'));

// 이모지 제거 함수
function removeEmoji(text) {
    return text.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u200D]/gu, '').trim();
}

// AI 요약 함수
async function summarizeWithAI(topics) {
    return new Promise((resolve, reject) => {
        const prompt = `다음 병원 개원 관련 질문들을 각각 15자 이하의 핵심 키워드로 요약해주세요.

규칙:
1. 반드시 15자 이하로 요약
2. 질문의 핵심 주제/의도를 파악해서 요약 (단순히 앞부분 자르기 금지)
3. 이모지 사용 금지
4. 자연스러운 한국어 표현 사용
5. 각 줄에 "ID: 요약된주제" 형식으로 출력

예시:
- "인테리어 평당가 얼마나 하나요?" → "인테리어 평당가"
- "단일 페이지로 구성된 홈페이지가 검색 엔진 결과에서 중복 노출되어 유입량을 극대화하려면 어떤 기술이 필요한가요?" → "SEO 중복노출 방지"
- "접수 데스크 공간을 깔끔하게 유지하면서 차팅 업무의 효율을 높일 수 있는 PC 구성 방식은 무엇인가요?" → "접수 데스크 PC 구성"
- "고층부에 외부 현수막을 설치할 때 통풍 문제나 창문 개폐에 지장을 주지 않으려면 무엇을 고려해야 하나요?" → "고층 현수막 설치 주의"

질문 목록:
${topics.map(t => `${t.id}: ${removeEmoji(t.original)}`).join('\n')}

각 ID에 대해 "ID: 요약" 형식으로 응답해주세요.`;

        const data = JSON.stringify({
            model: 'google/gemini-2.0-flash-001',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 8000
        });

        const options = {
            hostname: 'openrouter.ai',
            port: 443,
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(body);
                    resolve(result.choices[0].message.content);
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// 배치 처리
async function processBatch(batch, batchNum) {
    console.log(`배치 ${batchNum} 처리 중... (${batch.length}개)`);
    try {
        const result = await summarizeWithAI(batch);
        return result;
    } catch (e) {
        console.error(`배치 ${batchNum} 에러:`, e.message);
        return null;
    }
}

async function main() {
    console.log('=== AI 기반 주제 요약 시작 ===');
    console.log('총 주제:', topicsToShorten.length, '개\n');

    const results = new Map();
    const batchSize = 50;

    for (let i = 0; i < topicsToShorten.length; i += batchSize) {
        const batch = topicsToShorten.slice(i, i + batchSize);
        const batchNum = Math.floor(i / batchSize) + 1;

        const response = await processBatch(batch, batchNum);

        if (response) {
            // 파싱
            const lines = response.split('\n');
            for (const line of lines) {
                const match = line.match(/^(\d+):\s*(.+)$/);
                if (match) {
                    const id = parseInt(match[1]);
                    let summary = match[2].trim();
                    // 15자 초과시 자르기
                    if (summary.length > 15) {
                        summary = summary.substring(0, 15);
                    }
                    results.set(id, summary);
                }
            }
        }

        // API 레이트 리밋 방지
        await new Promise(r => setTimeout(r, 1000));
    }

    // 결과 저장
    const finalResults = topicsToShorten.map(t => ({
        id: t.id,
        original: t.original,
        shortened: results.get(t.id) || removeEmoji(t.original).substring(0, 15),
        originalLen: t.original.length,
        shortenedLen: (results.get(t.id) || t.original.substring(0, 15)).length
    }));

    fs.writeFileSync('topics_shortened.json', JSON.stringify(finalResults, null, 2));

    console.log('\n=== 완료 ===');
    console.log('처리된 주제:', finalResults.length, '개');

    // 15자 초과 확인
    const over15 = finalResults.filter(r => r.shortened.length > 15);
    console.log('15자 초과:', over15.length, '개');

    // 샘플 출력
    console.log('\n=== 요약 예시 30개 ===');
    finalResults.slice(0, 30).forEach((r, i) => {
        console.log(`${i + 1}. "${r.original}"`);
        console.log(`   → "${r.shortened}" (${r.shortened.length}자)`);
    });
}

main().catch(console.error);
