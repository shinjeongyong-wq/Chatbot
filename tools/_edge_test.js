/**
 * Edge Case Test Script for Staging Chatbot
 * - Gemini 쿼리 플래너 사용 (staging /api/chat mode=plan)  
 * - staging /api/search 호출
 * - 실제 챗봇과 완전히 동일한 흐름
 */

const STAGING_URL = 'http://localhost:3003';
const fs = require('fs');

// 테스트 질문 목록 (개원 원장 시점)
const TEST_QUESTIONS = [
    // ===== 파트너사 추천 (tier 테스트) =====
    { q: '인테리어 파트너사 추천해주세요', category: 'partner-tier', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과', '미용', '레이저'] }, expect: 'tier:1 인테리어 파트너사 다수 추천' },
    { q: '간판 업체 추천해줘', category: 'partner-tier', specialty: { code: 'internal', label: '내과', keywords: ['내과', '소화기', '내시경'] }, expect: 'tier:1 간판 파트너사 추천' },
    { q: '의료기기 업체 알려줘', category: 'partner-tier', specialty: { code: 'ortho', label: '정형외과', keywords: ['정형', '정형외과', '관절', '척추'] }, expect: 'tier:1 의료기기 파트너사 추천' },
    { q: '세무사 추천해줄 수 있어?', category: 'partner-tier', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과'] }, expect: '세무사 파트너사 추천 또는 관련 정보' },
    { q: '병원 홈페이지 만들어주는 업체 있어?', category: 'partner-tier', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '홈페이지/마케팅 파트너사 추천' },

    // ===== 일반 개원 정보 =====
    { q: '개원 절차가 어떻게 되나요?', category: 'general', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '개원 절차/로드맵 안내' },
    { q: '병원 인테리어 비용이 어느 정도 드나요?', category: 'cost', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과'] }, expect: '인테리어 비용 정보 (평당가 등)' },
    { q: '의료기기 리스 vs 구매 뭐가 유리해?', category: 'equipment', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '리스/구매 장단점 비교' },
    { q: '개원할 때 대출은 어떻게 받아?', category: 'finance', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과'] }, expect: '개원 대출 정보' },
    { q: '사업자등록은 어떻게 하나요?', category: 'admin', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '사업자등록 절차 안내' },

    // ===== 진료과 특화 =====
    { q: '피부과 개원 시 필수 장비가 뭐야?', category: 'specialty', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과', '미용', '레이저'] }, expect: '피부과 장비 리스트' },
    { q: '정형외과 인테리어 주의사항', category: 'specialty', specialty: { code: 'ortho', label: '정형외과', keywords: ['정형', '정형외과', '관절'] }, expect: '정형외과 특화 인테리어 정보' },
    { q: '내과 개원 비용 총정리', category: 'specialty', specialty: { code: 'internal', label: '내과', keywords: ['내과', '소화기'] }, expect: '내과 개원 비용 정보' },

    // ===== 엣지 케이스 =====
    { q: '오늘 날씨 어때?', category: 'off-topic', specialty: null, expect: 'OUT_OF_SCOPE 또는 [OFF_TOPIC] 응답' },
    { q: '안녕하세요', category: 'greeting', specialty: null, expect: 'GREETING 응답 (검색 불필요)' },
    { q: '건설업등록증이 뭐야?', category: 'general-info', specialty: null, expect: '건설업등록증 설명' },
    { q: '인테리어 평당가가 얼마야?', category: 'cost-detail', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과'] }, expect: '평당가 정보 (일반 정보, 파트너사 아님)' },
    { q: '개원 1차파동이 뭐야?', category: 'specific', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '1차파동 관련 정보' },
    { q: '병원 마케팅 어떻게 해?', category: 'marketing', specialty: { code: 'derma', label: '피부과', keywords: ['피부', '피부과'] }, expect: '병원 마케팅 관련 정보' },
    { q: '직원 채용은 언제부터 해야 해?', category: 'hr', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '직원 채용 시기/방법 정보' },
];

async function callAPI(path, body) {
    const res = await fetch(`${STAGING_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    return await res.json();
}

async function getQueryPlan(question, specialty) {
    try {
        const result = await callAPI('/api/chat', {
            userQuery: question,
            mode: 'plan',
            userSpecialty: specialty,
        });
        return result.plan || result;
    } catch (e) {
        return { error: e.message };
    }
}

async function searchDocs(queryPlan, specialty) {
    try {
        const result = await callAPI('/api/search', {
            action: 'search',
            queryPlan,
            maxResults: 15,
            userSpecialty: specialty,
        });
        return result;
    } catch (e) {
        return { error: e.message };
    }
}

async function runTests() {
    const report = [];
    const startTime = Date.now();

    console.log('═══════════════════════════════════════════════════════');
    console.log('  🧪 Edge Case Test - Staging Chatbot (Gemini Planner)');
    console.log(`  URL: ${STAGING_URL}`);
    console.log(`  시작: ${new Date().toLocaleString('ko-KR')}`);
    console.log(`  총 질문 수: ${TEST_QUESTIONS.length}개`);
    console.log('═══════════════════════════════════════════════════════\n');

    for (let i = 0; i < TEST_QUESTIONS.length; i++) {
        const test = TEST_QUESTIONS[i];
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  [${i + 1}/${TEST_QUESTIONS.length}] 카테고리: ${test.category}`);
        console.log(`  Q: "${test.q}"`);
        console.log(`  진료과: ${test.specialty?.label || '미선택'}`);
        console.log(`  기대: ${test.expect}`);
        console.log('─'.repeat(60));

        const entry = {
            num: i + 1,
            question: test.q,
            category: test.category,
            specialty: test.specialty?.label || '미선택',
            expect: test.expect,
            plan: null,
            searchResults: [],
            filterInfo: null,
            issues: [],
            verdict: '',
        };

        // ===== Step 1: Query Plan (Gemini) =====
        console.log('  📋 Step 1: Query Plan 생성 (Gemini)...');
        const plan = await getQueryPlan(test.q, test.specialty);

        if (plan.error) {
            console.log(`  ❌ Plan 오류: ${plan.error}`);
            entry.issues.push(`Plan 오류: ${plan.error}`);
            entry.verdict = '❌ FAIL';
            report.push(entry);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        entry.plan = {
            intent: plan.intent,
            requiresSearch: plan.requiresSearch,
            topic: plan.topic,
            subIntent: plan.subIntent,
            targetCategory: plan.targetCategory,
            coreKeywords: plan.coreKeywords,
            expandedKeywords: plan.expandedKeywords,
            directAnswer: plan.directAnswer ? plan.directAnswer.substring(0, 100) + '...' : null,
        };

        console.log(`     intent: ${plan.intent}`);
        console.log(`     requiresSearch: ${plan.requiresSearch}`);
        console.log(`     topic: ${JSON.stringify(plan.topic)}`);
        console.log(`     subIntent: ${JSON.stringify(plan.subIntent)}`);
        console.log(`     targetCategory: ${JSON.stringify(plan.targetCategory)}`);
        console.log(`     coreKeywords: ${plan.coreKeywords?.join(', ')}`);

        // 검색 불필요한 경우 (GREETING, OUT_OF_SCOPE 등)
        if (plan.requiresSearch === false) {
            console.log(`  ⏩ 검색 스킵 (intent: ${plan.intent})`);
            if (plan.directAnswer) {
                console.log(`     directAnswer: "${plan.directAnswer.substring(0, 80)}..."`);
            }

            // off-topic 검증
            if (test.category === 'off-topic' && (plan.intent === 'OUT_OF_SCOPE' || plan.intent === 'off_topic')) {
                entry.verdict = '✅ PASS';
            } else if (test.category === 'greeting' && plan.intent === 'GREETING') {
                entry.verdict = '✅ PASS';
            } else if (plan.requiresSearch === false) {
                entry.verdict = '⚠️ 검색 스킵됨 (확인 필요)';
            }

            console.log(`  ${entry.verdict}`);
            report.push(entry);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        // ===== Step 2: Search =====
        console.log('  🔎 Step 2: 검색 실행...');
        const searchResult = await searchDocs(plan, test.specialty);

        if (searchResult.error || !searchResult.success) {
            console.log(`  ❌ 검색 오류: ${searchResult.error || '결과 없음'}`);
            entry.issues.push(`검색 오류: ${searchResult.error || '결과 없음'}`);
            entry.verdict = '❌ FAIL';
            report.push(entry);
            await new Promise(r => setTimeout(r, 2000));
            continue;
        }

        const results = searchResult.results || [];

        if (searchResult.filterInfo) {
            const fi = searchResult.filterInfo;
            entry.filterInfo = fi;
            console.log(`     커트라인: ${fi.cutoff} (top=${fi.topScore}, mean=${fi.mean}, σ=${fi.stdDev})`);
            console.log(`     ${fi.passedCount}개 통과 / ${fi.scoredCount - fi.passedCount}개 제외`);
        }

        console.log(`     검색 결과: ${results.length}개`);

        // 결과 상세
        results.forEach((doc, idx) => {
            const tier = doc.metadata?.tier || '-';
            const field = doc.metadata?.field || '-';
            const cat = doc.metadata?.structuredCategory || '-';
            const short = (doc.question || '').substring(0, 45);
            const line = `     [${String(idx + 1).padStart(2)}] ${(doc.score || 0).toFixed(4)} | tier:${tier} | ${cat.padEnd(10)} | ${short}`;
            console.log(line);
            entry.searchResults.push({
                rank: idx + 1,
                score: (doc.score || 0).toFixed(4),
                tier,
                field,
                category: cat,
                question: short,
            });
        });

        // ===== 분석 =====
        const partnerDocs = results.filter(r => r.metadata?.structuredCategory === 'partners');
        const nonPartnerDocs = results.filter(r => r.metadata?.structuredCategory !== 'partners');
        const tier1Docs = results.filter(r => r.metadata?.tier === 1);
        const tier2Docs = results.filter(r => r.metadata?.tier === 2);
        const tier3Docs = results.filter(r => r.metadata?.tier === 3);

        console.log(`     📊 파트너: ${partnerDocs.length}개 (T1:${tier1Docs.length} T2:${tier2Docs.length} T3:${tier3Docs.length}) | 비파트너: ${nonPartnerDocs.length}개`);

        // 카테고리별 검증
        if (test.category === 'partner-tier') {
            if (partnerDocs.length === 0) {
                entry.issues.push('❌ 파트너사 문서 0개');
            }
            if (tier1Docs.length === 0 && partnerDocs.length > 0) {
                entry.issues.push('⚠️ tier:1 문서 없음');
            }
            if (nonPartnerDocs.length > partnerDocs.length) {
                entry.issues.push('⚠️ 비파트너 문서가 파트너보다 많음');
            }
            // subIntent 체크
            const subIntents = Array.isArray(plan.subIntent) ? plan.subIntent : [plan.subIntent];
            if (!subIntents.includes('파트너사목록')) {
                entry.issues.push('⚠️ subIntent에 파트너사목록 없음 — 부스트 미작동');
            }
        }

        if (test.category === 'off-topic') {
            entry.issues.push('⚠️ off-topic인데 검색이 실행됨');
        }

        if (results.length === 0) {
            entry.issues.push('⚠️ 검색 결과 0개');
        } else if (results.length < 3 && test.category !== 'off-topic' && test.category !== 'greeting') {
            entry.issues.push('⚠️ 검색 결과 너무 적음 (3개 미만)');
        }

        // 최종 판정
        if (entry.issues.length === 0) {
            entry.verdict = '✅ PASS';
        } else if (entry.issues.some(i => i.startsWith('❌'))) {
            entry.verdict = '❌ FAIL';
        } else {
            entry.verdict = '⚠️ WARN';
        }

        console.log(`  ${entry.verdict}${entry.issues.length > 0 ? ' → ' + entry.issues.join(' | ') : ''}`);

        report.push(entry);

        // rate limit 방지
        await new Promise(r => setTimeout(r, 2500));
    }

    // ===== 최종 리포트 =====
    console.log('\n\n' + '═'.repeat(60));
    console.log('  📋 최종 리포트');
    console.log('═'.repeat(60));

    const pass = report.filter(r => r.verdict.includes('PASS'));
    const warn = report.filter(r => r.verdict.includes('WARN'));
    const fail = report.filter(r => r.verdict.includes('FAIL'));

    console.log(`\n  ✅ PASS: ${pass.length}개`);
    console.log(`  ⚠️ WARN: ${warn.length}개`);
    console.log(`  ❌ FAIL: ${fail.length}개`);
    console.log(`  ⏱️ 소요시간: ${((Date.now() - startTime) / 1000).toFixed(1)}초\n`);

    if (warn.length > 0 || fail.length > 0) {
        console.log('  ──── 이슈 상세 ────');
        [...fail, ...warn].forEach(entry => {
            console.log(`\n  [${entry.num}] ${entry.verdict} Q: "${entry.question}"`);
            if (entry.plan) {
                console.log(`      plan: intent=${entry.plan.intent}, subIntent=${JSON.stringify(entry.plan.subIntent)}`);
            }
            entry.issues.forEach(issue => console.log(`      ${issue}`));
        });
    }

    // 파일로 저장
    const reportLines = [];
    reportLines.push(`# Edge Case Test Report (Staging)`);
    reportLines.push(`날짜: ${new Date().toLocaleString('ko-KR')}`);
    reportLines.push(`URL: ${STAGING_URL}`);
    reportLines.push(`PASS: ${pass.length} | WARN: ${warn.length} | FAIL: ${fail.length}`);
    reportLines.push(`소요시간: ${((Date.now() - startTime) / 1000).toFixed(1)}초`);
    reportLines.push(`\n${'═'.repeat(50)}\n`);

    report.forEach(entry => {
        reportLines.push(`## [${entry.num}] ${entry.verdict} ${entry.question}`);
        reportLines.push(`카테고리: ${entry.category} | 진료과: ${entry.specialty}`);
        reportLines.push(`기대: ${entry.expect}`);
        if (entry.plan) {
            reportLines.push(`Plan: intent=${entry.plan.intent}, requiresSearch=${entry.plan.requiresSearch}`);
            reportLines.push(`  topic: ${JSON.stringify(entry.plan.topic)}`);
            reportLines.push(`  subIntent: ${JSON.stringify(entry.plan.subIntent)}`);
            reportLines.push(`  coreKeywords: ${entry.plan.coreKeywords?.join(', ')}`);
        }
        if (entry.filterInfo) {
            reportLines.push(`커트라인: ${entry.filterInfo.cutoff} (top=${entry.filterInfo.topScore})`);
        }
        if (entry.searchResults.length > 0) {
            reportLines.push(`검색 결과 ${entry.searchResults.length}개:`);
            entry.searchResults.forEach(r => {
                reportLines.push(`  [${r.rank}] score=${r.score} tier:${r.tier} cat:${r.category} | ${r.question}`);
            });
        }
        if (entry.issues.length > 0) {
            reportLines.push(`이슈: ${entry.issues.join(' | ')}`);
        }
        reportLines.push('');
        reportLines.push('─'.repeat(50));
        reportLines.push('');
    });

    fs.writeFileSync('_edge_test_report.md', reportLines.join('\n'), 'utf8');
    console.log(`\n  📁 리포트 저장: _edge_test_report.md`);
}

runTests().catch(e => console.error('Fatal:', e));
