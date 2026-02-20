const http = require('http');

async function callAPI(body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const options = {
            hostname: 'localhost',
            port: 3002,
            path: '/api/chat',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ rawBody: body });
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.setTimeout(120000);
        req.write(data);
        req.end();
    });
}

async function fullTest(query, testName) {
    console.log('='.repeat(60));
    console.log(`🧪 ${testName}`);
    console.log(`질문: ${query}`);
    console.log('='.repeat(60));

    // Step 1: Query Planning
    console.log('\n[Step 1] Query Planning...');
    const planResult = await callAPI({
        userQuery: query,
        mode: 'plan',
        userSpecialty: null,
        recentContext: '',
        alreadyMentioned: []
    });

    console.log('Intent:', planResult.plan?.intent);
    console.log('RequiresSearch:', planResult.plan?.requiresSearch);

    if (planResult.plan?.requiresSearch === false && planResult.plan?.directAnswer) {
        console.log('\n⚡ 즉시 답변 (검색 스킵)');
        console.log('DirectAnswer:', planResult.plan.directAnswer.substring(0, 300));
        return;
    }

    // Step 2: Answer Generation (검색 후 답변)
    console.log('\n[Step 2] Answer Generation...');
    const answerResult = await callAPI({
        userQuery: query,
        mode: 'answer',
        systemPrompt: `당신은 병원 개원 상담 AI입니다.
        
6. 아래 두 가지 경우 모두 → '[NO_DATA]' 태그와 함께 답변:
   - (A) 정확한 정보 없음
   - (B) 유사 정보로 대체 답변

참고문서: 검색 결과 없음`
    });

    const answerText = answerResult.text || '';
    console.log('\n📝 AI 답변 (처음 400자):');
    console.log(answerText.substring(0, 400));

    // NO_DATA 체크
    const hasNoData = answerText.includes('[NO_DATA]');
    console.log(`\n✅ [NO_DATA] 포함 여부: ${hasNoData ? '예 ✓ (플래너 버튼 표시됨)' : '아니오 ✗'}`);
}

async function main() {
    console.log('🔬 NO_DATA 태그 테스트 시작\n');

    await fullTest(
        '병원 개원할 때 인공지능 로봇 도입 비용이 얼마야?',
        '테스트1: DB에 없는 정보'
    );

    console.log('\n\n');

    await fullTest(
        '정형외과 수술실 인테리어 비용 알려줘',
        '테스트2: 유사 정보 대체 답변'
    );

    console.log('\n\n🏁 테스트 완료');
}

main().catch(console.error);
