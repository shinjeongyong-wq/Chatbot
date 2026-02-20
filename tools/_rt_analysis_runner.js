/**
 * RT(관련 주제) 커트라인 분석 러너
 * - 21개 질문으로 검색만 실행 (답변 생성 없음)
 * - Primary / RT 문서 스코어 분포 + 갭 분석
 */

const BASE_URL = 'http://localhost:3003';
const fs = require('fs');

// ========== 21개 질문 ==========
const QUESTIONS = [
    '개원 절차가 어떻게 되나요?',
    '인테리어 업체 추천해주세요',
    '개원 비용이 대략 얼마나 드나요?',
    '강남 명동 홍대의 외국인 마케팅',
    '미용 의료기기는 뭐가 필요한가요?',
    '간판 업체 추천해주세요',
    '보톡스 필러 장비 어떤 걸 써야 하나요?',
    '세무사는 언제 정해야 되나요?',
    '레이저 장비 추천해주세요',
    '인테리어 비용이 얼마나 드나요?',
    'EMR 시스템 추천해주세요',
    '직원 채용은 어떻게 하나요?',
    '소방 검사는 어떻게 준비하나요?',
    '냉난방기 인수하는 게 유리한가요?',
    '홈페이지 제작 비용은 얼마인가요?',
    '간호사들 연봉은 어떻게 정하나요?',
    // Edge Cases
    '의료 폐기물 처리 업체 추천해주세요',
    '병원 주차장 설계 기준이 어떻게 되나요?',
    '의료사고 배상책임보험 가입은 어떻게 하나요?',
    '개원 후 폐업 절차가 궁금합니다',
    '원내 약국 개설 절차와 비용이 궁금합니다',
];

// ========== Query Plan 생성 ==========
async function getQueryPlan(userQuery) {
    const res = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userQuery: userQuery,
            mode: 'plan'
        })
    });
    const data = await res.json();
    if (!data.success || !data.plan) throw new Error('QueryPlan 실패: ' + JSON.stringify(data).substring(0, 200));
    return data.plan;
}

// ========== 검색 실행 ==========
async function smartSearch(queryPlan) {
    // queryPlan을 그대로 전달 (search.js가 배열 필드를 직접 사용함)
    const res = await fetch(`${BASE_URL}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', queryPlan: queryPlan, maxResults: 30, userSpecialty: '미용' })
    });
    const data = await res.json();
    return data;
}

// ========== 메인 ==========
async function main() {
    const lines = [];
    const log = (msg) => { console.log(msg); lines.push(msg); };

    log('='.repeat(100));
    log('  📊 RT 커트라인 분석 (검색만 실행, 답변 생성 없음)');
    log('='.repeat(100));
    log('');

    const summary = [];

    for (let i = 0; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        const qNum = String(i + 1).padStart(2, '0');
        log(`── Q${qNum}: ${q}`);

        try {
            // 1. Query Plan
            const queryPlan = await getQueryPlan(q);

            // requiresSearch가 false면 검색 스킵
            if (!queryPlan.requiresSearch && queryPlan.directAnswer) {
                log(`  ⏭️  requiresSearch=false → 검색 스킵`);
                log('');
                summary.push({ q: qNum, primary: 0, rt: 0, gap: '-', skip: true });
                continue;
            }

            // 2. Search
            const searchData = await smartSearch(queryPlan);

            if (searchData.error) {
                log(`  ❌ 검색 에러: ${searchData.error}`);
                log('');
                summary.push({ q: qNum, primary: 0, rt: 0, gap: '-', error: true });
                continue;
            }

            const results = searchData.results || [];
            const rtResults = searchData.rtResults || [];
            const filterInfo = searchData.filterInfo || {};

            const primaryCount = results.length;
            const rtCount = rtResults.length;

            // Primary 스코어 범위
            const pScores = results.map(r => r.score);
            const pMin = pScores.length ? Math.min(...pScores).toFixed(4) : '-';
            const pMax = pScores.length ? Math.max(...pScores).toFixed(4) : '-';

            // RT 스코어 범위
            const rtScores = rtResults.map(r => r.score);
            const rtMin = rtScores.length ? Math.min(...rtScores).toFixed(4) : '-';
            const rtMax = rtScores.length ? Math.max(...rtScores).toFixed(4) : '-';

            // 갭: Primary 최하점 vs RT 최고점
            const gap = (pScores.length && rtScores.length)
                ? (Math.min(...pScores) - Math.max(...rtScores)).toFixed(4)
                : '-';

            log(`  커트라인: Primary=${filterInfo.primaryCutoff || '-'}, Secondary=${filterInfo.secondaryCutoff || '-'}`);
            log(`  수식: P=${filterInfo.primaryFormula || '-'}`);
            log(`        S=${filterInfo.secondaryFormula || '-'}`);
            log(`  통계: top=${filterInfo.topScore || '-'}, mean=${filterInfo.mean || '-'}, σ=${filterInfo.stdDev || '-'}`);
            log(`  Primary: ${primaryCount}개 (${pMax} ~ ${pMin})`);
            log(`  RT:      ${rtCount}개 (${rtMax} ~ ${rtMin})`);
            log(`  갭:      Primary최하 ${pMin} → RT최고 ${rtMax} (차이: ${gap})`);

            // RT 문서 상세
            if (rtResults.length > 0) {
                log(`  RT 문서:`);
                rtResults.forEach((doc, j) => {
                    const title = (doc.question || doc.title || '').substring(0, 70);
                    const cat = doc.category || '-';
                    const sub = doc.subCategory || '-';
                    log(`    [${j + 1}] ${doc.score.toFixed(4)} | ${cat}/${sub} | ${title}`);
                });
            }

            // Primary 하위 5개도 출력 (갭 분석용)
            if (results.length > 0) {
                const bottomPrimary = results.slice(-Math.min(3, results.length));
                log(`  Primary 하위 ${bottomPrimary.length}개:`);
                bottomPrimary.forEach((doc, j) => {
                    const title = (doc.question || doc.title || '').substring(0, 70);
                    log(`    [P-${results.length - bottomPrimary.length + j + 1}] ${doc.score.toFixed(4)} | ${title}`);
                });
            }

            summary.push({ q: qNum, primary: primaryCount, rt: rtCount, gap, skip: false });

        } catch (err) {
            log(`  ❌ 에러: ${err.message}`);
            summary.push({ q: qNum, primary: 0, rt: 0, gap: '-', skip: false, error: true });
        }

        log('');
    }

    // ===== 요약 테이블 =====
    log('='.repeat(100));
    log('  📋 요약');
    log('='.repeat(100));
    log('  Q  | Primary | RT | 갭         | 비고');
    log('  ---|---------|----|-----------|---------');
    for (const s of summary) {
        const gapStr = s.gap === '-' ? '    -     ' : s.gap.padStart(10);
        const flag = s.skip ? 'SKIP' : s.error ? 'ERR' : '';
        log(`  Q${s.q} | ${String(s.primary).padStart(7)} | ${String(s.rt).padStart(2)} | ${gapStr} | ${flag}`);
    }

    const rtTotal = summary.filter(s => s.rt > 0).length;
    const basicOnly = summary.slice(0, 16);
    const rtBasic = basicOnly.filter(s => s.rt > 0).length;
    log('');
    log(`  전체 RT 추출: ${rtTotal}/${QUESTIONS.length} (${(rtTotal / QUESTIONS.length * 100).toFixed(0)}%)`);
    log(`  기본 Q1-Q16 RT 추출: ${rtBasic}/16 (${(rtBasic / 16 * 100).toFixed(0)}%)`);

    // 파일 저장
    const filename = '_rt_analysis_result.txt';
    fs.writeFileSync(filename, lines.join('\n'), 'utf-8');
    log(`\n  📁 결과 저장: ${filename}`);
}

main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
