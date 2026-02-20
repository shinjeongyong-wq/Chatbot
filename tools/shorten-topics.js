const fs = require('fs');

// 요약 규칙 기반 축약 함수
function shortenTopic(original) {
    let result = original;

    // 1. 이모지 완전 제거
    result = result.replace(/[\u{1F300}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u200D]/gu, '').trim();

    // 2. 번호 제거 (1), (2) 등
    result = result.replace(/\s*\(\d+\)\s*$/g, '').trim();

    // 3. 불필요한 접미사 제거 (긴 것부터)
    const suffixes = [
        '무엇을 점검해야 하나요?',
        '잘하는 업체 있나요?',
        '정상 작동 여부',
        '가 어떻게 되나요?',
        '는 어떻게 되나요?',
        '이 어떻게 되나요?',
        '어떻게 되나요?',
        '얼마나 하나요?',
        '얼마나 드나요?',
        '얼마나 걸리나요?',
        '뭘 결정하나요?',
        '뭐가 있나요?',
        '작동 여부',
        '작동 상태',
        '가능 여부',
        '가 뭔가요?',
        '는 뭔가요?',
        '이 뭔가요?',
        '해야 하나요?',
        '알려주세요',
        '설명해주세요',
        '추천해주세요',
        '하나요?',
        '인가요?',
        '일까요?',
        ' 설명',
        ' 설명해',
    ];

    for (const suffix of suffixes) {
        if (result.endsWith(suffix)) {
            result = result.slice(0, -suffix.length).trim();
        }
    }

    // 4. 특정 패턴 정리
    result = result
        .replace(/\s+vs\s+/, ' vs ')
        .replace(/\s+\/\s+/g, '/')
        .replace(/\s+,\s+/g, ', ')
        .replace(/\s+/g, ' ')
        .trim();

    // 5. 15자 초과 시 핵심 추출
    if (result.length > 15) {
        result = smartTruncate(result);
    }

    return result;
}

// 스마트 축약 (의미 보존)
function smartTruncate(text) {
    // 특수 케이스 처리
    const specialCases = {
        '계단실/복도 연기감지기 및 비상조명등': '계단실 연기감지기',
        '전기실 및 EPS실 접근 불가하거나 잠금 상태 아님': 'EPS실 접근 가능여부',
        '철거 주체 확인 (양도양수, 미철거 공실)': '철거 주체 확인',
        '인테리어 공사(소음, 일반) 지정 시간대': '공사 지정 시간대',
        '폐기물 / 자재 / 장비 반출입 경로': '반출입 경로',
        '피난구(비상계단) 도어 개폐': '비상계단 도어',
        '비상 콘센트, 누전차단기': '비상콘센트/차단기',
        '바닥 종류, 상태, 마감재, 방통': '바닥 마감재/방통',
        '옆/위/아래 기존 임차인': '기존 임차인 현황',
        '의료기관 개설 신고 가능여부': '개설신고 가능여부',
        '중개팀→플래너팀 부동산': '부동산 정보 점검',
        '행정업무 체크리스트 (원장님용)': '행정업무 체크',
        '붙박이 가구 vs 이동 가구': '가구 유형 비교',
        '마감재 미팅에서 뭘 결정': '마감재 미팅',
        '견적서 구성은 어떻게': '견적서 구성',
        '전유부/공용부 차이': '전유부/공용부',
        '인테리어 심화편': '인테리어 심화',
        '의료기기 미용 편': '미용 의료기기',
        '의료기기 치과 편': '치과 의료기기',
        '의료기기 내과 편': '내과 의료기기',
        '의료기기 통증 편': '통증 의료기기',
    };

    for (const [key, value] of Object.entries(specialCases)) {
        if (text.includes(key) || text === key) {
            return value;
        }
    }

    // 괄호 내용 제거
    let result = text.replace(/\([^)]*\)/g, '').trim();

    // 쉼표로 구분된 건 앞부분만
    if (result.includes(',') && result.length > 15) {
        result = result.split(',')[0].trim();
    }

    // 그래도 15자 초과면 의미 단위로
    if (result.length > 15) {
        const words = result.split(' ');
        result = '';
        for (const word of words) {
            const newResult = (result + ' ' + word).trim();
            if (newResult.length <= 15) {
                result = newResult;
            } else {
                break;
            }
        }
        if (result.length < 3) {
            result = text.substring(0, 14) + '…';
        }
    }

    return result;
}

// 메인 실행
const topicsToShorten = JSON.parse(fs.readFileSync('topics_to_shorten.json', 'utf8'));
const results = [];

for (const item of topicsToShorten) {
    const shortened = shortenTopic(item.original);
    results.push({
        id: item.id,
        original: item.original,
        shortened: shortened,
        originalLen: item.original.length,
        shortenedLen: shortened.length,
        success: shortened.length <= 15
    });
}

// 결과 저장
fs.writeFileSync('topics_shortened.json', JSON.stringify(results, null, 2));

// 통계
const success = results.filter(r => r.success).length;
const failed = results.filter(r => !r.success).length;

console.log('=== 축약 결과 ===');
console.log('총 처리:', results.length, '개');
console.log('성공 (15자 이하):', success, '개');
console.log('실패 (15자 초과):', failed, '개');

if (failed > 0) {
    console.log('\n=== 15자 초과 (실패) 목록 ===');
    results.filter(r => !r.success).forEach((r, i) => {
        console.log(`${i + 1}. [${r.shortenedLen}자] "${r.shortened}"`);
        console.log(`   원본: ${r.original}`);
    });
}

console.log('\n=== 축약 예시 30개 ===');
results.slice(0, 30).forEach((r, i) => {
    console.log(`${i + 1}. "${r.original}" → "${r.shortened}"`);
});
