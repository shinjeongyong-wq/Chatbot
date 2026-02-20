// 복합 질문 배열 지원 테스트
require('dotenv').config();

const BASE_URL = 'http://localhost:3003';

const COMPLEX_QUESTIONS = [
    "개원 프로세스 알려주고, 인테리어 파트너사 추천해줘",
    "간판이랑 홈페이지 비용 얼마야?",
    "EMR 시스템 추천하고 체크리스트도 줘",
    "의료기기 업체랑 가구 업체 둘 다 알려줘"
];

async function runTest() {
    console.log('🧪 복합 질문 배열 지원 테스트\n');
    console.log('='.repeat(80));

    for (let i = 0; i < COMPLEX_QUESTIONS.length; i++) {
        const q = COMPLEX_QUESTIONS[i];
        console.log(`\n[${i + 1}/4] "${q}"`);

        try {
            const startTime = Date.now();
            const response = await fetch(`${BASE_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userQuery: q,
                    mode: 'plan',
                    userSpecialty: { code: 'derma', label: '피부과' }
                })
            });

            const result = await response.json();
            const elapsed = Date.now() - startTime;

            if (result.plan) {
                const p = result.plan;

                // 배열 여부 확인
                const isTopicArray = Array.isArray(p.topic);
                const isCatArray = Array.isArray(p.targetCategory);
                const isSubIntentArray = Array.isArray(p.subIntent);

                console.log(`   시간: ${elapsed}ms`);
                console.log(`   subIntent: ${JSON.stringify(p.subIntent)} ${isSubIntentArray ? '✅ 배열' : '⚠️ string'}`);
                console.log(`   topic: ${JSON.stringify(p.topic)} ${isTopicArray ? '✅ 배열' : '⚠️ string'}`);
                console.log(`   targetCategory: ${JSON.stringify(p.targetCategory)} ${isCatArray ? '✅ 배열' : '⚠️ string'}`);
                console.log(`   targetSubCategory: ${JSON.stringify(p.targetSubCategory)}`);
                console.log(`   coreKeywords: ${p.coreKeywords?.join(', ')}`);

                // 복합 질문 처리 확인
                const topicCount = isTopicArray ? p.topic.length : 1;
                if (topicCount >= 2) {
                    console.log(`   ✅ 복합 질문 정상 처리 (${topicCount}개 topic)`);
                } else {
                    console.log(`   ⚠️ topic 1개만 감지됨`);
                }
            } else {
                console.log(`   ❌ 검색 불필요로 분류됨`);
            }
        } catch (error) {
            console.log(`   ❌ ERROR: ${error.message}`);
        }
    }

    console.log('\n' + '='.repeat(80));
    console.log('테스트 완료');
}

runTest().catch(console.error);
