/**
 * Feedback Auto Test Script (v3)
 * Phase A: 검색 파이프라인 테스트 (쿼리 플래너 + 검색)
 * Phase B: AI 응답 품질 테스트 (실제 streaming → 10개 검증 항목)
 *
 * Usage:
 *   node _feedback_test.js              # Phase A + B 모두 실행
 *   node _feedback_test.js --phase-a    # Phase A만
 *   node _feedback_test.js --phase-b    # Phase B만
 */

const STAGING_URL = 'http://localhost:3003';
const fs = require('fs');

// ================================================================
// 질문 풀 구성
// ================================================================

// 피드백 질문 (배치마다 _feedback_data.json에서 로드)
function loadFeedbackQuestions() {
    try {
        const data = JSON.parse(fs.readFileSync('_feedback_data.json', 'utf8'));
        return data.map(fb => ({
            q: fb.question || '',
            category: fb.type === 'Bad' ? 'feedback-bad' : 'feedback-good',
            specialty: fb.specialty ? { code: fb.specialty, label: fb.specialty, keywords: [fb.specialty] } : null,
            expect: fb.type === 'Bad' ? `Bad 피드백: ${(fb.content || '').substring(0, 40)}` : 'Good 피드백 회귀',
            feedbackId: fb.id,
            feedbackContent: fb.content,
        })).filter(q => q.q.length > 0).slice(0, 10);
    } catch (e) {
        console.log('⚠️ _feedback_data.json 없음, 빈 배열 사용');
        return [];
    }
}

// AI 생성 질문 (카테고리 골고루)
const AI_GENERATED_QUESTIONS = [
    // 파트너사 추천 2개
    { q: '인테리어 파트너사 추천해주세요', category: 'partner-tier', specialty: { code: 'derma', label: '미용', keywords: ['미용'] }, expect: 'tier:1 파트너사 추천', expectTag: null },
    { q: '간판 업체 추천해줘', category: 'partner-tier', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: 'tier:1 간판 파트너사 추천', expectTag: null },
    // 일반 정보 2개
    { q: '개원 절차가 어떻게 되나요?', category: 'general', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '개원 절차 안내', expectTag: null },
    { q: '개원 비용은 얼마나 드나요?', category: 'cost', specialty: { code: 'derma', label: '미용', keywords: ['미용'] }, expect: '비용 정보', expectTag: null },
    // 의료기기 1개
    { q: '의료기기 구매 방법은?', category: 'equipment', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '의료기기 구매 안내', expectTag: null },
    // 채용/노무 1개
    { q: '간호사 채용은 어떻게 하나요?', category: 'hr', specialty: { code: 'internal', label: '내과', keywords: ['내과'] }, expect: '채용 정보', expectTag: null },
    // 마케팅 1개
    { q: '병원 마케팅은 어떻게 하나요?', category: 'marketing', specialty: { code: 'derma', label: '미용', keywords: ['미용'] }, expect: '마케팅 정보', expectTag: null },
    // 플래너 연결 1개
    { q: '플래너에게 연결 해줘', category: 'planner-connect', specialty: { code: 'derma', label: '미용', keywords: ['미용'] }, expect: '[NO_DATA] + 플래너 버튼', expectTag: 'NO_DATA' },
    // OFF_TOPIC 1개
    { q: '오늘 날씨 어때?', category: 'off-topic', specialty: null, expect: '[OFF_TOPIC] 응답', expectTag: 'OFF_TOPIC' },
    // GREETING 1개
    { q: '안녕하세요', category: 'greeting', specialty: null, expect: '인사 응답', expectTag: 'GREETING' },
];

// ================================================================
// API 호출
// ================================================================

async function callAPI(path, body) {
    const res = await fetch(`${STAGING_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
    });
    return res;
}

async function getQueryPlan(question, specialty) {
    try {
        const res = await callAPI('/api/chat', { userQuery: question, mode: 'plan', userSpecialty: specialty });
        const result = await res.json();
        return result.plan || result;
    } catch (e) {
        return { error: e.message };
    }
}

async function searchDocs(queryPlan, specialty) {
    try {
        const res = await callAPI('/api/search', { action: 'search', queryPlan, maxResults: 15, userSpecialty: specialty });
        const result = await res.json();
        return result;
    } catch (e) {
        return { error: e.message };
    }
}

async function getAIResponse(question, specialty) {
    try {
        const body = {
            messages: [{ role: 'user', content: question }],
            userSpecialty: specialty,
        };
        const res = await callAPI('/api/chat', body);
        if (!res.ok) return { error: `HTTP ${res.status}` };

        // streaming 응답 → 전체 텍스트 수집
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullText += decoder.decode(value, { stream: true });
        }
        return { success: true, text: fullText };
    } catch (e) {
        return { error: e.message };
    }
}

// ================================================================
// Phase B 검증 함수들
// ================================================================

function verifyPhaseB(text, test) {
    const results = {};

    // 태그/버튼 제거한 본문
    const cleanText = text
        .replace(/\[RELATED_TOPICS\].*?\[\/RELATED_TOPICS\]/gs, '')
        .replace(/\[NO_DATA\]/g, '')
        .replace(/\[OFF_TOPIC\]/g, '')
        .replace(/\[TOPIC:.*?\]/g, '')
        .trim();

    // === 형식 검증 ===
    // F1: 볼드체 개수 ≤ 10
    const boldMatches = cleanText.match(/\*\*[^*]+\*\*/g) || [];
    results.F1 = { name: '볼드체 ≤10', pass: boldMatches.length <= 10, value: boldMatches.length };

    // F2: 답변 길이 ≤ 25줄
    const lines = cleanText.split('\n').filter(l => l.trim().length > 0);
    results.F2 = { name: '길이 ≤25줄', pass: lines.length <= 25, value: lines.length };

    // F3: 마침표 종결
    const lastLine = cleanText.replace(/\n+$/g, '').trim();
    const endsWithPeriod = /\.\s*$/.test(lastLine);
    results.F3 = { name: '마침표 종결', pass: endsWithPeriod, value: lastLine.slice(-5) };

    // F4: 4단계+ 헤딩 금지
    const deepHeadings = (text.match(/^#{4,}\s/gm) || []);
    results.F4 = { name: '####+ 금지', pass: deepHeadings.length === 0, value: deepHeadings.length };

    // F5: [RELATED_TOPICS] 존재 (일반 답변만)
    const hasRT = /\[RELATED_TOPICS\]/.test(text);
    const isSpecial = test.category === 'off-topic' || test.category === 'greeting';
    results.F5 = { name: 'RELATED_TOPICS', pass: isSpecial || hasRT, value: hasRT ? '있음' : '없음' };

    // === 정보 보안 검증 ===
    // S1: tier 노출 금지
    const tierExposed = /tier[\s:]?\d|Tier\s?\d|\[tier/i.test(cleanText);
    results.S1 = { name: 'tier 비노출', pass: !tierExposed, value: tierExposed ? '노출됨' : 'OK' };

    // S2: 참고문서 번호 노출 금지
    const refExposed = /\[\d+\]|참고문서|\[ID:/i.test(cleanText);
    results.S2 = { name: '참고문서 비노출', pass: !refExposed, value: refExposed ? '노출됨' : 'OK' };

    // === 기능 검증 ===
    // L1: [NO_DATA] 적절성
    const hasNoData = /\[NO_DATA\]/.test(text);
    if (test.expectTag === 'NO_DATA') {
        results.L1 = { name: 'NO_DATA 태그', pass: hasNoData, value: hasNoData ? '있음' : '없음' };
    } else {
        results.L1 = { name: 'NO_DATA 태그', pass: true, value: 'N/A' };
    }

    // L2: [OFF_TOPIC] 적절성
    const hasOffTopic = /\[OFF_TOPIC\]/.test(text);
    if (test.category === 'off-topic') {
        results.L2 = { name: 'OFF_TOPIC 태그', pass: hasOffTopic, value: hasOffTopic ? '있음' : '없음' };
    } else {
        results.L2 = { name: 'OFF_TOPIC 태그', pass: true, value: 'N/A' };
    }

    // === 시스템 검증 ===
    // SY1: 응답 존재
    results.SY1 = { name: 'API 응답 존재', pass: text.length > 10, value: `${text.length}자` };

    return results;
}

// ================================================================
// 메인 테스트 러너
// ================================================================

async function runTests(mode) {
    const feedbackQs = loadFeedbackQuestions();
    const allQuestions = [...feedbackQs, ...AI_GENERATED_QUESTIONS].slice(0, 20);

    const report = { phaseA: [], phaseB: [] };
    const startTime = Date.now();

    console.log('═'.repeat(60));
    console.log('  🧪 Feedback Auto Test v3');
    console.log(`  URL: ${STAGING_URL}`);
    console.log(`  Mode: ${mode}`);
    console.log(`  질문: ${allQuestions.length}개 (피드백 ${feedbackQs.length} + AI ${allQuestions.length - feedbackQs.length})`);
    console.log(`  시작: ${new Date().toLocaleString('ko-KR')}`);
    console.log('═'.repeat(60) + '\n');

    for (let i = 0; i < allQuestions.length; i++) {
        const test = allQuestions[i];
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`  [${i + 1}/${allQuestions.length}] ${test.category}`);
        console.log(`  Q: "${test.q}"`);
        console.log(`  기대: ${test.expect}`);
        console.log('─'.repeat(60));

        // ============ Phase A ============
        if (mode === 'all' || mode === 'phase-a') {
            const entryA = { num: i + 1, question: test.q, category: test.category, issues: [], verdict: '' };

            console.log('  🅰️ Phase A: 검색...');
            const plan = await getQueryPlan(test.q, test.specialty);

            if (plan.error) {
                entryA.issues.push(`❌ Plan 오류: ${plan.error}`);
                entryA.verdict = '❌ FAIL';
                report.phaseA.push(entryA);
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }

            entryA.plan = { intent: plan.intent, requiresSearch: plan.requiresSearch, subIntent: plan.subIntent };
            console.log(`     intent: ${plan.intent}, search: ${plan.requiresSearch}`);

            if (plan.requiresSearch !== false) {
                const searchResult = await searchDocs(plan, test.specialty);
                if (searchResult.error || !searchResult.success) {
                    entryA.issues.push(`❌ 검색 오류`);
                } else {
                    const results = searchResult.results || [];
                    console.log(`     검색 결과: ${results.length}개`);
                    results.slice(0, 5).forEach((doc, idx) => {
                        console.log(`     [${idx + 1}] ${(doc.score || 0).toFixed(4)} | T${doc.metadata?.tier || '-'} | ${(doc.question || '').substring(0, 40)}`);
                    });

                    if (results.length === 0) entryA.issues.push('⚠️ 검색 결과 0개');
                    if (test.category === 'partner-tier') {
                        const t1 = results.filter(r => r.metadata?.tier === 1);
                        if (t1.length === 0) entryA.issues.push('⚠️ tier:1 문서 없음');
                    }
                }
            }

            entryA.verdict = entryA.issues.length === 0 ? '✅ PASS' :
                entryA.issues.some(i => i.startsWith('❌')) ? '❌ FAIL' : '⚠️ WARN';
            console.log(`     A: ${entryA.verdict}`);
            report.phaseA.push(entryA);
        }

        // ============ Phase B ============
        if (mode === 'all' || mode === 'phase-b') {
            const entryB = { num: i + 1, question: test.q, category: test.category, checks: {}, failCount: 0, verdict: '' };

            console.log('  🅱️ Phase B: AI 응답...');
            const response = await getAIResponse(test.q, test.specialty);

            if (response.error) {
                entryB.checks = { SY1: { name: 'API 응답', pass: false, value: response.error } };
                entryB.failCount = 1;
                entryB.verdict = '❌ FAIL';
            } else {
                const text = response.text;
                console.log(`     응답 길이: ${text.length}자`);
                entryB.checks = verifyPhaseB(text, test);
                entryB.failCount = Object.values(entryB.checks).filter(c => !c.pass).length;
                entryB.verdict = entryB.failCount === 0 ? '✅ PASS' : entryB.failCount >= 2 ? '❌ FAIL' : '⚠️ WARN';

                // FAIL 항목만 출력
                Object.entries(entryB.checks).forEach(([code, check]) => {
                    if (!check.pass) console.log(`     ❌ ${code} ${check.name}: ${check.value}`);
                });
            }

            console.log(`     B: ${entryB.verdict} (${entryB.failCount}개 FAIL)`);
            report.phaseB.push(entryB);
        }

        await new Promise(r => setTimeout(r, 2500));
    }

    // ============ 최종 리포트 ============
    console.log('\n\n' + '═'.repeat(60));
    console.log('  📋 최종 리포트');
    console.log('═'.repeat(60));

    if (report.phaseA.length > 0) {
        const aPass = report.phaseA.filter(r => r.verdict.includes('PASS')).length;
        const aWarn = report.phaseA.filter(r => r.verdict.includes('WARN')).length;
        const aFail = report.phaseA.filter(r => r.verdict.includes('FAIL')).length;
        console.log(`\n  🅰️ Phase A: PASS ${aPass} | WARN ${aWarn} | FAIL ${aFail}`);
    }

    if (report.phaseB.length > 0) {
        const bPass = report.phaseB.filter(r => r.verdict.includes('PASS')).length;
        const bWarn = report.phaseB.filter(r => r.verdict.includes('WARN')).length;
        const bFail = report.phaseB.filter(r => r.verdict.includes('FAIL')).length;
        console.log(`  🅱️ Phase B: PASS ${bPass} | WARN ${bWarn} | FAIL ${bFail}`);

        // 검증 항목별 집계
        const checkSummary = {};
        report.phaseB.forEach(entry => {
            Object.entries(entry.checks).forEach(([code, check]) => {
                if (!checkSummary[code]) checkSummary[code] = { name: check.name, pass: 0, fail: 0 };
                check.pass ? checkSummary[code].pass++ : checkSummary[code].fail++;
            });
        });

        console.log('\n  Phase B 검증 항목별:');
        Object.entries(checkSummary).forEach(([code, s]) => {
            const icon = s.fail > 0 ? '❌' : '✅';
            console.log(`    ${icon} ${code} ${s.name}: PASS ${s.pass} / FAIL ${s.fail}`);
        });
    }

    console.log(`\n  ⏱️ ${((Date.now() - startTime) / 1000).toFixed(1)}초`);

    // 파일 저장
    const lines = [
        `# Feedback Auto Test Report v3`,
        `날짜: ${new Date().toLocaleString('ko-KR')}`,
        `모드: ${mode}`,
        `질문: ${allQuestions.length}개`,
        '',
    ];

    if (report.phaseA.length > 0) {
        const aP = report.phaseA.filter(r => r.verdict.includes('PASS')).length;
        const aW = report.phaseA.filter(r => r.verdict.includes('WARN')).length;
        const aF = report.phaseA.filter(r => r.verdict.includes('FAIL')).length;
        lines.push(`## Phase A: PASS ${aP} | WARN ${aW} | FAIL ${aF}`);
        report.phaseA.forEach(e => {
            lines.push(`### [${e.num}] ${e.verdict} ${e.question}`);
            if (e.plan) lines.push(`Plan: intent=${e.plan.intent}, search=${e.plan.requiresSearch}`);
            if (e.issues.length > 0) lines.push(`이슈: ${e.issues.join(' | ')}`);
            lines.push('');
        });
    }

    if (report.phaseB.length > 0) {
        const bP = report.phaseB.filter(r => r.verdict.includes('PASS')).length;
        const bW = report.phaseB.filter(r => r.verdict.includes('WARN')).length;
        const bF = report.phaseB.filter(r => r.verdict.includes('FAIL')).length;
        lines.push(`## Phase B: PASS ${bP} | WARN ${bW} | FAIL ${bF}`);
        report.phaseB.forEach(e => {
            lines.push(`### [${e.num}] ${e.verdict} ${e.question} (FAIL: ${e.failCount})`);
            Object.entries(e.checks).forEach(([code, check]) => {
                const icon = check.pass ? '✅' : '❌';
                lines.push(`  ${icon} ${code} ${check.name}: ${check.value}`);
            });
            lines.push('');
        });
    }

    fs.writeFileSync('_feedback_test_report.md', lines.join('\n'), 'utf8');
    console.log(`\n  📁 _feedback_test_report.md 저장 완료`);
}

// ================================================================
// 엔트리포인트
// ================================================================

const args = process.argv.slice(2);
let mode = 'all';
if (args.includes('--phase-a')) mode = 'phase-a';
if (args.includes('--phase-b')) mode = 'phase-b';

runTests(mode).catch(e => console.error('Fatal:', e));
