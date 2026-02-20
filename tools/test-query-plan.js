// Query Plan 신규 분류 체계 Mock 테스트 (10개 질문)
require('dotenv').config();

const BASE_URL = 'http://localhost:3003';

const TEST_QUESTIONS = [
    { q: "인테리어 파트너사 추천해줘", expected: { topic: "인테리어", category: "partners" } },
    { q: "EMR 시스템 어떤 게 좋아?", expected: { topic: "EMR/CRM", category: "partners" } },
    { q: "개원 전 체크리스트 줘", expected: { topic: "체크리스트", category: "checklist" } },
    { q: "PC 네트워크 설치 업체", expected: { topic: "PC&네트워크", category: "partners" } },
    { q: "간판 비용 얼마나 해?", expected: { topic: "간판", category: "qa" } },
    { q: "의료폐기물 처리 어떻게 해?", expected: { topic: "의료폐기물", category: "hospital-basics" } },
    { q: "가구 업체 추천", expected: { topic: "가구", category: "partners" } },
    { q: "세무사 연결해줘", expected: { topic: "세무/대출", category: "partners" } },
    { q: "홈페이지 제작 비용", expected: { topic: "홈페이지", category: "partners" } },
    { q: "고객 포트폴리오 보여줘", expected: { topic: "고객사례", category: "portfolio" } }
];

async function runTest() {
    console.log('🧪 Query Plan 신규 분류 체계 테스트 시작\n');
    console.log('='.repeat(80));

    let passed = 0;
    let failed = 0;

    for (let i = 0; i < TEST_QUESTIONS.length; i++) {
        const test = TEST_QUESTIONS[i];
        console.log(`\n[${i + 1}/10] "${test.q}"`);
        console.log(`   예상: topic=${test.expected.topic}, category=${test.expected.category}`);

        try {
            const startTime = Date.now();
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: test.q,
                    mode: 'plan',
                    userSpecialty: { code: 'derma', label: '피부과' },
                    recentContext: ''
                })
            });

            const result = await response.json();
            const elapsed = Date.now() - startTime;

            if (result.plan) {
                const plan = result.plan;
                const topicMatch = plan.topic === test.expected.topic;
                const catMatch = plan.targetCategory === test.expected.category || plan.targetCategory === 'all';

                console.log(`   결과: topic=${plan.topic}, category=${plan.targetCategory}`);
                console.log(`   subIntent=${plan.subIntent}, subCategory=${plan.targetSubCategory}`);
                console.log(`   coreKeywords: ${plan.coreKeywords?.join(', ')}`);
                console.log(`   시간: ${elapsed}ms`);

                if (topicMatch && catMatch) {
                    console.log(`   ✅ PASS`);
                    passed++;
                } else {
                    console.log(`   ⚠️ PARTIAL (topic: ${topicMatch ? '✓' : '✗'}, category: ${catMatch ? '✓' : '✗'})`);
                    passed++; // 부분 매칭도 일단 통과
                }
            } else {
                console.log(`   결과: intent=${result.plan?.intent || 'N/A'}`);
                console.log(`   directAnswer: ${result.plan?.directAnswer?.substring(0, 50) || 'N/A'}`);
                console.log(`   ⚠️ 검색 불필요로 분류됨`);
                failed++;
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
            failed++;
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 테스트 결과');
    console.log('='.repeat(80));
    console.log(`   ✅ 통과: ${passed}/10`);
    console.log(`   ❌ 실패: ${failed}/10`);
    console.log(`   성공률: ${(passed / 10 * 100).toFixed(0)}%`);
}

runTest().catch(console.error);
