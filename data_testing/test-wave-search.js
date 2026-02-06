/**
 * 강화된 문단 검색 테스트 스크립트 v2
 * - 웨이브 테스트: 반환된 문단에 핵심 키워드가 포함되어 있는지 검증
 * - 통증 의료기기 테스트: 관련 문단들이 여러 개 검색되는지 검증
 */

const fs = require('fs');
const path = require('path');

const PARAGRAPHS_FILE = path.join(__dirname, 'paragraphs.json');
const RESULTS_FILE = path.join(__dirname, 'test-results.json');

// 테스트 케이스 정의
const TEST_CASES = [
    {
        id: 'test-wave1',
        type: 'content-check',
        question: '개원 프로세스 중 1차 웨이브가 궁금해',
        expectedKeywords: ['1차 웨이브', '1차웨이브'],
        requiredContent: ['대출', '세무', '인테리어', '간판', '홈페이지', 'PC', '마케팅', '채용'],
        minRequiredCount: 6  // 최소 6개 이상 포함해야 통과
    },
    {
        id: 'test-wave2',
        type: 'content-check',
        question: '개원 프로세스 중 2차 웨이브가 궁금해',
        expectedKeywords: ['2차 웨이브', '2차웨이브'],
        requiredContent: ['가구', '가전', '정수기', '유니폼', 'EMR', 'CRM', '폐기물'],
        minRequiredCount: 5
    },
    {
        id: 'test-wave3',
        type: 'content-check',
        question: '개원 프로세스 중 3차 웨이브가 궁금해',
        expectedKeywords: ['3차 웨이브', '3차웨이브'],
        requiredContent: ['소방', '보건소', '심평원', '요양기관기호', '방사선', '간판'],
        minRequiredCount: 4
    },
    {
        id: 'test-pain-device',
        type: 'multi-result',
        question: '통증 의료기기 뭐가 있어?',
        searchKeywords: ['통증', '의료기기', '장비'],
        requiredTopics: ['C-Arm', '초음파', '고주파', '체외충격파', '레이저'],
        minTopicsFound: 3  // 최소 3개 장비 관련 내용이 검색되어야 함
    }
];

// 간단한 키워드 매칭 검색
function searchParagraphs(question, paragraphs, searchKeywords = null) {
    // 질문에서 키워드 추출
    const queryKeywords = searchKeywords || [];

    // 웨이브 관련
    if (question.includes('1차') && question.includes('웨이브')) {
        queryKeywords.push('1차 웨이브', '1차웨이브');
    }
    if (question.includes('2차') && question.includes('웨이브')) {
        queryKeywords.push('2차 웨이브', '2차웨이브');
    }
    if (question.includes('3차') && question.includes('웨이브')) {
        queryKeywords.push('3차 웨이브', '3차웨이브');
    }
    if (question.includes('개원') || question.includes('프로세스')) {
        queryKeywords.push('개업 로드맵', '개원 프로세스');
    }

    // 통증 의료기기 관련
    if (question.includes('통증') && (question.includes('의료기기') || question.includes('장비'))) {
        queryKeywords.push('통증 의료기기', 'C-Arm', '초음파', '고주파', '체외충격파', '레이저');
    }

    // 각 문단에 대해 점수 계산
    const scoredParagraphs = paragraphs.map(p => {
        let score = 0;

        for (const keyword of queryKeywords) {
            // 제목 매칭 (가장 높은 점수)
            if (p.title.includes(keyword)) {
                score += 15;
            }
            // 키워드 배열 매칭
            if (p.keywords.some(k => k.includes(keyword) || keyword.includes(k))) {
                score += 8;
            }
            // 내용 매칭
            if (p.content.includes(keyword)) {
                score += 3;
            }
        }

        return { paragraph: p, score };
    });

    // 점수 기준 정렬
    scoredParagraphs.sort((a, b) => b.score - a.score);

    // 점수가 있는 결과만 반환
    return scoredParagraphs.filter(s => s.score > 0);
}

// 테스트 실행
function runTests() {
    console.log('🧪 강화된 문단 검색 테스트 v2 시작...\n');

    // 문단 데이터 로드
    const data = JSON.parse(fs.readFileSync(PARAGRAPHS_FILE, 'utf-8'));
    const paragraphs = data.paragraphs;

    console.log(`📄 버전: ${data.version}`);
    console.log(`📄 총 ${paragraphs.length}개 문단 로드\n`);

    let totalPoints = 0;
    let maxPoints = 0;
    const results = [];

    for (const testCase of TEST_CASES) {
        console.log(`${'━'.repeat(60)}`);
        console.log(`❓ 질문: ${testCase.question}`);
        console.log(`📋 테스트 유형: ${testCase.type}`);

        // 검색 수행
        const searchResults = searchParagraphs(
            testCase.question,
            paragraphs,
            testCase.searchKeywords || []
        );

        if (searchResults.length === 0) {
            console.log(`❌ 검색 결과 없음`);
            maxPoints += 100;
            results.push({
                testId: testCase.id,
                question: testCase.question,
                passed: false,
                score: 0,
                reason: '검색 결과 없음'
            });
            continue;
        }

        // 테스트 유형별 검증
        if (testCase.type === 'content-check') {
            // 내용 검증 테스트
            const topResult = searchResults[0];
            const content = topResult.paragraph.content;

            console.log(`\n🔍 상위 결과: [${topResult.paragraph.id}] ${topResult.paragraph.title}`);
            console.log(`   점수: ${topResult.score}`);
            console.log(`   내용 길이: ${content.length}자`);

            // 필수 내용 포함 여부 검사
            const foundItems = testCase.requiredContent.filter(item => content.includes(item));
            const foundRatio = foundItems.length / testCase.requiredContent.length;
            const passed = foundItems.length >= testCase.minRequiredCount;

            console.log(`\n📊 핵심 내용 검증:`);
            console.log(`   필수 항목: ${testCase.requiredContent.join(', ')}`);
            console.log(`   발견된 항목: ${foundItems.join(', ')}`);
            console.log(`   결과: ${foundItems.length}/${testCase.requiredContent.length} (최소 ${testCase.minRequiredCount}개 필요)`);

            const testScore = Math.round(foundRatio * 100);
            totalPoints += testScore;
            maxPoints += 100;

            if (passed) {
                console.log(`\n✅ 테스트 통과! (${testScore}점)`);
            } else {
                console.log(`\n❌ 테스트 실패 - 필수 항목 부족 (${testScore}점)`);
            }

            results.push({
                testId: testCase.id,
                question: testCase.question,
                passed: passed,
                score: testScore,
                foundItems: foundItems,
                missingItems: testCase.requiredContent.filter(item => !content.includes(item)),
                paragraphId: topResult.paragraph.id
            });

        } else if (testCase.type === 'multi-result') {
            // 다중 결과 검증 테스트
            console.log(`\n🔍 상위 10개 검색 결과:`);
            searchResults.slice(0, 10).forEach((r, i) => {
                console.log(`   ${i + 1}. [${r.paragraph.id}] ${r.paragraph.title.slice(0, 35)}... (점수: ${r.score})`);
            });

            // 각 주제가 검색 결과에 포함되어 있는지 확인
            const topResultsContent = searchResults.slice(0, 10)
                .map(r => r.paragraph.title + ' ' + r.paragraph.content)
                .join(' ');

            const foundTopics = testCase.requiredTopics.filter(topic =>
                topResultsContent.includes(topic)
            );

            const foundRatio = foundTopics.length / testCase.requiredTopics.length;
            const passed = foundTopics.length >= testCase.minTopicsFound;

            console.log(`\n📊 주제 검증:`);
            console.log(`   필수 주제: ${testCase.requiredTopics.join(', ')}`);
            console.log(`   발견된 주제: ${foundTopics.join(', ')}`);
            console.log(`   결과: ${foundTopics.length}/${testCase.requiredTopics.length} (최소 ${testCase.minTopicsFound}개 필요)`);

            const testScore = Math.round(foundRatio * 100);
            totalPoints += testScore;
            maxPoints += 100;

            if (passed) {
                console.log(`\n✅ 테스트 통과! (${testScore}점)`);
            } else {
                console.log(`\n❌ 테스트 실패 - 필수 주제 부족 (${testScore}점)`);
            }

            results.push({
                testId: testCase.id,
                question: testCase.question,
                passed: passed,
                score: testScore,
                foundTopics: foundTopics,
                missingTopics: testCase.requiredTopics.filter(t => !topResultsContent.includes(t)),
                totalResults: searchResults.length
            });
        }
    }

    // 최종 결과
    const finalScore = Math.round((totalPoints / maxPoints) * 100);
    const passedCount = results.filter(r => r.passed).length;

    console.log(`\n${'━'.repeat(60)}`);
    console.log(`📊 최종 결과`);
    console.log(`${'━'.repeat(60)}`);
    console.log(`   테스트 통과: ${passedCount}/${TEST_CASES.length}`);
    console.log(`   총점: ${totalPoints}/${maxPoints}`);
    console.log(`   최종 점수: ${finalScore}점`);
    console.log(`${'━'.repeat(60)}`);

    // 결과 저장
    const finalResult = {
        timestamp: new Date().toISOString(),
        version: data.version,
        totalParagraphs: paragraphs.length,
        testsRun: TEST_CASES.length,
        testsPassed: passedCount,
        totalPoints: totalPoints,
        maxPoints: maxPoints,
        finalScore: finalScore,
        results: results
    };

    fs.writeFileSync(RESULTS_FILE, JSON.stringify(finalResult, null, 2), 'utf-8');
    console.log(`\n💾 결과 저장: ${RESULTS_FILE}`);

    return { score: finalScore, passed: passedCount, total: TEST_CASES.length };
}

// 메인 실행
const result = runTests();

if (result.score === 100) {
    console.log('\n🎉🎉🎉 100점 달성! 모든 테스트 통과! 🎉🎉🎉');
} else if (result.score >= 80) {
    console.log(`\n🟢 ${result.score}점 - 양호! 일부 개선 필요.`);
} else if (result.score >= 60) {
    console.log(`\n🟡 ${result.score}점 - 보통. 개선 필요.`);
} else {
    console.log(`\n🔴 ${result.score}점 - 미흡. 대폭 개선 필요.`);
}
