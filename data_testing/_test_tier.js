/**
 * 파트너사 Tier 시스템 A/B 테스트 스크립트
 * 
 * 사용법: $env:GEMINI_API_KEY='키값'; node data_testing/_test_tier.js [A|B]
 *   A = 메타데이터 태깅 방식
 *   B = 파일 분리 방식
 */

const path = require('path');
const fs = require('fs');

// ========== 출력 헬퍼 (파일 + 콘솔 동시 출력) ==========
let outputLines = [];

// ========== Gemini API 호출 ==========
async function callGeminiAPI(prompt, systemPrompt, model = 'gemini-2.5-flash') {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
        })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error: ${response.status} → ${errText.substring(0, 300)}`);
    }
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// ========== 데이터 로드 ==========
function loadJsonFilesRecursively(dirPath, allData = []) {
    if (!fs.existsSync(dirPath)) return allData;
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            // backup 폴더 제외
            if (item === 'partners_backup' || item === 'backup' || item.endsWith('_backup')) continue;
            loadJsonFilesRecursively(fullPath, allData);
        } else if (item.endsWith('.json') && item !== 'index.json' && item !== 'topics.json' && item !== 'topics_shortened.json') {
            try {
                const raw = fs.readFileSync(fullPath, 'utf-8');
                const data = JSON.parse(raw);
                if (data.items && Array.isArray(data.items)) {
                    for (const dataItem of data.items) {
                        allData.push({ ...dataItem, source: dataItem.source || 'notion' });
                    }
                }
            } catch (e) { /* skip */ }
        }
    }
    return allData;
}

function loadServerData() {
    const projectRoot = path.resolve(__dirname, '..');
    const allData = [];
    const dataPath = path.join(projectRoot, 'data');
    if (fs.existsSync(dataPath)) loadJsonFilesRecursively(dataPath, allData);
    return allData;
}

// ========== 스코어링 (api/search.js 동일 + 고유명사 부스트 + entityBoosted 면제) ==========
function calculateSmartScore(item, coreKeywords, expandedKeywords, topic, strategy) {
    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const field = (item.metadata?.field || '').toLowerCase();
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
    const text = question + ' ' + answer + ' ' + field + ' ' + specialties;
    const textNoSpace = text.replace(/\s/g, '');
    let score = 0;

    if (coreKeywords && coreKeywords.length > 0) {
        let coreHits = 0;
        for (const keyword of coreKeywords) {
            if (!keyword) continue;
            const kw = keyword.toLowerCase();
            const kwNoSpace = kw.replace(/\s/g, '');
            if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) {
                coreHits++;
                if (question.includes(kw) || question.replace(/\s/g, '').includes(kwNoSpace)) coreHits += 0.5;
            }
        }
        score += Math.min((coreHits / coreKeywords.length) * 0.6, 0.6);
    }

    if (expandedKeywords && expandedKeywords.length > 0) {
        let expandHits = 0;
        for (const keyword of expandedKeywords) {
            if (!keyword) continue;
            const kw = keyword.toLowerCase();
            if (text.includes(kw) || textNoSpace.includes(kw.replace(/\s/g, ''))) expandHits++;
        }
        score += Math.min((expandHits / expandedKeywords.length) * 0.25, 0.25);
    }

    if (topic) {
        const topics = Array.isArray(topic) ? topic : [topic];
        for (const t of topics) {
            if (t && t !== '기타') {
                const st = t.toLowerCase();
                if (field.includes(st) || question.includes(st)) { score += 0.1; break; }
            }
        }
    }

    return score;
}

function calculateSpecialtyBonus(item, userSpecialty) {
    if (!userSpecialty || !userSpecialty.keywords) return 0;
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
    const text = (item.question || '').toLowerCase() + ' ' + (item.answer || '').toLowerCase() + ' ' + specialties;
    let matchCount = 0;
    for (const kw of userSpecialty.keywords) { if (text.includes(kw.toLowerCase())) matchCount++; }
    if (specialties.includes(userSpecialty.code.toLowerCase())) return 0.2;
    else if (matchCount > 0) return Math.min(matchCount * 0.05, 0.15);
    return 0;
}

function smartSearchRaw(allData, queryPlan, userSpecialty) {
    const { coreKeywords, expandedKeywords, excludeKeywords, searchStrategy, topic, targetCategory, subIntent } = queryPlan;
    let candidates = allData || [];

    candidates = candidates.filter(item => {
        if (!excludeKeywords || excludeKeywords.length === 0) return true;
        const q = (item.question || '').toLowerCase();
        for (const ex of excludeKeywords) { if (ex && ex.length >= 2 && q.includes(ex.toLowerCase())) return false; }
        return true;
    });

    let results = candidates.map(item => {
        let score = calculateSmartScore(item, coreKeywords, expandedKeywords, topic, searchStrategy);
        const itemTopic = item.metadata?.topic || item.metadata?.category || '';
        const itemField = (item.metadata?.field || '').toLowerCase();
        const itemPath = item.metadata?.structuredCategory || item.metadata?.categoryPath || '';

        if (topic) {
            const topicsArr = Array.isArray(topic) ? topic : [topic];
            for (const t of topicsArr) {
                if (t && t !== '기타') {
                    const st = t.toLowerCase();
                    if (itemTopic.toLowerCase().includes(st) || itemField.includes(st)) { score += 0.5; break; }
                }
            }
        }

        const subIntents = Array.isArray(subIntent) ? subIntent : [subIntent];
        const isPartnerIntent = subIntents.includes('파트너사목록');
        const isPartnerItem = itemPath === 'partners' || itemPath.startsWith('partners');
        if (isPartnerIntent && isPartnerItem) score += 0.2;

        // ★ 고유명사 부스트
        if (coreKeywords && coreKeywords.length > 0) {
            const questionTrimmed = (item.question || '').trim();
            const questionNoSpace = questionTrimmed.toLowerCase().replace(/\s/g, '');
            for (const kw of coreKeywords) {
                if (!kw || kw.length < 2) continue;
                const kwNoSpace = kw.toLowerCase().replace(/\s/g, '');
                if (questionNoSpace === kwNoSpace || questionTrimmed.toLowerCase() === kw.toLowerCase()) {
                    score += 1.0;
                    item._entityBoosted = true;
                    break;
                }
            }
        }

        // 진료과 보너스/페널티 제거됨 (파트너사 추천 방해 방지)

        return { ...item, score };
    })
        .filter(r => r.score > 0.05)
        .sort((a, b) => b.score - a.score);

    return results;
}

// ========== 통계 ==========
function calcStats(scores) {
    const n = scores.length;
    if (n === 0) return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0 };
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return { mean, stdDev: Math.sqrt(variance), min: Math.min(...scores), max: Math.max(...scores), count: n };
}

// R24 커트라인
function getCutoff(scores, stats) {
    const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
    const maxDocs = 10;
    const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
    return { value: cappedVal, name: `min(top×0.75,mean+2σ)+cap10` };
}

// ========== 문서 포맷 (tier 표시 포함) ==========
function formatDocForAI(item, idx) {
    let prefix = `[${idx + 1}]`;
    const tier = item.metadata?.tier;
    if (tier === 1) prefix += ' ⭐최우선';
    else if (tier === 2) prefix += ' 🔸우선';
    // tier 3은 표시 없음

    if (item.metadata?.specialties && item.metadata.specialties.length > 0) {
        prefix += ` [${item.metadata.specialties.join(',')}]`;
    } else {
        prefix += ' (공통)';
    }

    const truncatedAnswer = item.answer.length > 15000
        ? item.answer.substring(0, 15000) + '...(이하 생략)'
        : item.answer;
    return `${prefix} | Q: ${item.question}\nA: ${truncatedAnswer}`;
}

function buildSystemPrompt(contextText, isFollowUp = false) {
    const tierRule = `
# 파트너사 추천 규칙 (Tier 시스템)
- ⭐최우선(tier 1) 파트너사를 가장 먼저 추천하세요.
- 🔸우선(tier 2) 파트너사는 사용자가 "더 없어?", "다른 업체는?" 등 추가 요청 시에만 추천하세요.
- tier 표시 없는 파트너사(tier 3)는 tier 1, 2가 모두 소개된 후에만 추천하세요.
- 각 추천 시 "더 많은 업체가 궁금하시면 말씀해주세요."로 마무리하세요.
- 왜 이 순서인지(tier, winning rate 등)는 절대 언급하지 마세요.`;

    const followUpRule = isFollowUp ? `
# 후속 질문 처리
- 이전 대화에서 이미 추천한 파트너사를 반복하지 마세요.
- 이번에는 🔸우선(tier 2) 또는 tier 표시 없는 파트너사를 추천하세요.` : '';

    return `당신은 병원 개원 전문 AI 컨설턴트입니다. 친절하고 전문적인 어조로 답변하세요.

# 사용자 진료과
사용자는 **미용(피부과/성형외과)** 개원을 준비 중입니다.

# [Visual Formatting Protocol] 🎨
1. 첫 줄은 핵심 결론을 한 문장으로. 라벨 금지.
2. 주제 전환 시 \`### 소제목\`. #### 이하 금지. 업체명은 **볼드**.
3. 한 단락 최대 3줄.
4. 마침표로 끝.
${tierRule}
${followUpRule}

# 참고문서
${contextText || '(관련 데이터 없음)'}

# 핵심 규칙
1. 질문에 직접 답하는 내용만 포함.
2. 참고문서 기반 답변 (할루시네이션 금지).
3. 인용 표시([1] 등) 금지.
4. [RELATED_TOPICS] 블록 출력 불필요.`;
}

// ========== 테스트 설정 ==========
const USER_SPECIALTY = {
    code: '미용', label: '미용(피부과/성형외과)',
    keywords: ['미용', '피부과', '성형외과', '피부', '성형', '레이저', '보톡스', '필러', '리프팅', '울쎄라', '써마지']
};

const TEST_CASES = [
    // 테스트 1+2: 연속 질문
    {
        question: '인테리어 파트너사 추천해줘',
        isFollowUp: false,
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['파트너사목록'], topic: ['인테리어'],
            targetCategory: ['partners', 'hospital-basics'],
            specialtyRelevant: true,
            coreKeywords: ['인테리어', '파트너사', '추천', '업체'],
            expandedKeywords: ['미용', '피부과', '성형외과', '디자인', '시공'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '더 없어?',
        isFollowUp: true,
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['파트너사목록'], topic: ['인테리어'],
            targetCategory: ['partners', 'hospital-basics'],
            specialtyRelevant: true,
            coreKeywords: ['인테리어', '파트너사', '추천', '업체'],
            expandedKeywords: ['미용', '피부과', '성형외과', '디자인', '시공'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    // 테스트 3: 개별 (특정 업체)
    {
        question: '톤앤무드에 대해 알려줘',
        isFollowUp: false,
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['인테리어'],
            targetCategory: ['partners'],
            specialtyRelevant: true,
            coreKeywords: ['톤앤무드', '인테리어'],
            expandedKeywords: ['미용', '피부과', '성형외과', '디자인', '비용', '견적'],
            excludeKeywords: [], searchStrategy: 'exact'
        }
    },
    // 테스트 4: 개별 (다른 카테고리)
    {
        question: '간판 파트너사 추천해줘',
        isFollowUp: false,
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['파트너사목록'], topic: ['간판'],
            targetCategory: ['partners', 'hospital-basics'],
            specialtyRelevant: false,
            coreKeywords: ['간판', '파트너사', '추천', '업체'],
            expandedKeywords: ['사인물', '시인성', '가시성', '네온', '조명'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    }
];

// ========== 메인 ==========
outputLines = [];
function log(msg) {
    console.log(msg);
    outputLines.push(msg);
}

async function runTest(method) {
    outputLines = [];
    log('');
    log('═'.repeat(80));
    log(`  🧪 파트너사 Tier 테스트 — 방법 ${method}`);
    log(`  📋 방식: ${method === 'A' ? '메타데이터 태깅 (tier 필드)' : '파일 분리 (tier별 JSON)'}`);
    log(`  👤 사용자: 테스트 / 미용`);
    log(`  🕐 시간: ${new Date().toLocaleString('ko-KR')}`);
    log('═'.repeat(80));

    log('\n  📂 데이터 로드 중...');
    const allData = loadServerData();
    log(`  ✅ 총 ${allData.length}개 문서 로드 완료`);

    // tier 분포 확인
    const tierCounts = { 1: 0, 2: 0, 3: 0, none: 0 };
    allData.forEach(d => {
        if (d.metadata?.category === 'DB 레코드') {
            const t = d.metadata?.tier;
            if (t) tierCounts[t]++;
            else tierCounts.none++;
        }
    });
    log(`  📊 Tier 분포: T1=${tierCounts[1]} | T2=${tierCounts[2]} | T3=${tierCounts[3]} | 없음=${tierCounts.none}\n`);

    let prevAnswer = ''; // 연속 질문 컨텍스트

    for (let i = 0; i < TEST_CASES.length; i++) {
        const tc = TEST_CASES[i];
        log('═'.repeat(80));
        log(`  [테스트 ${i + 1}/${TEST_CASES.length}] "${tc.question}"${tc.isFollowUp ? ' (후속 질문)' : ''}`);
        log('═'.repeat(80));

        const allResults = smartSearchRaw(allData, tc.queryPlan, USER_SPECIALTY);
        const scores = allResults.map(r => r.score);
        const stats = calcStats(scores);
        const cutoff = getCutoff(scores, stats);
        const passedDocs = allResults.filter(r => r.score >= cutoff.value);

        log(`  📊 검색: ${allResults.length}개 매칭 | 최고=${stats.max.toFixed(4)} 평균=${stats.mean.toFixed(4)} σ=${stats.stdDev.toFixed(4)}`);
        log(`  ✂️  커트라인: ${cutoff.value.toFixed(4)} → ${passedDocs.length}개 통과 / ${allResults.length - passedDocs.length}개 제외`);

        // Tier별 통과 문서 수
        const passedTiers = { 1: 0, 2: 0, 3: 0, none: 0 };
        passedDocs.forEach(d => {
            const t = d.metadata?.tier;
            if (t) passedTiers[t]++;
            else passedTiers.none++;
        });
        log(`  🏷️  통과 문서 tier: T1=${passedTiers[1]} | T2=${passedTiers[2]} | T3=${passedTiers[3]} | 없음=${passedTiers.none}`);

        // context 길이 제한 (40000자)
        let contextText = passedDocs.map((doc, idx) => formatDocForAI(doc, idx)).join('\n\n');
        // context 길이 제한 없음 (_cutoff_test.js와 동일)

        // 후속 질문: 이전 답변 포함
        let userPrompt = `질문: ${tc.question}`;
        if (tc.isFollowUp && prevAnswer) {
            userPrompt = `[이전 대화]\nAI: ${prevAnswer.substring(0, 3000)}\n\n사용자: ${tc.question}`;
        }

        const systemPrompt = buildSystemPrompt(contextText, tc.isFollowUp);

        log(`\n  🤖 AI 답변 생성 중... (${passedDocs.length}개 문서 참고)`);
        try {
            const aiAnswer = await callGeminiAPI(userPrompt, systemPrompt);
            prevAnswer = aiAnswer; // 다음 연속 질문을 위해 저장

            log(`\n  💬 답변:`);
            log('  ' + '─'.repeat(70));
            for (const line of aiAnswer.split('\n')) {
                log(`  ${line}`);
            }
            log('  ' + '─'.repeat(70));
        } catch (error) {
            log(`  ❌ AI 호출 실패: ${error.message}`);
            prevAnswer = '';
        }

        log(`\n  📚 참고 문서 (${passedDocs.length}개):`);
        for (let j = 0; j < passedDocs.length; j++) {
            const doc = passedDocs[j];
            const score = doc.score.toFixed(4);
            const tier = doc.metadata?.tier ? ` T${doc.metadata.tier}` : '';
            const specs = doc.metadata?.specialties?.length > 0 ? ` [${doc.metadata.specialties.join(',')}]` : '';
            const q = (doc.question || '').substring(0, 60);
            log(`     [${j + 1}] ${score}${tier}${specs} ${q}`);
        }

        log('');
        await new Promise(r => setTimeout(r, 3000)); // API rate limit
    }

    log('═'.repeat(80));
    log('  테스트 완료');
    log('═'.repeat(80));

    // 결과 파일 저장 (UTF-8 BOM)
    const outFile = path.resolve(__dirname, `_result_tier${method}.txt`);
    const bom = '\ufeff';
    fs.writeFileSync(outFile, bom + outputLines.join('\n'), 'utf-8');
    console.log(`\n📁 결과 저장: ${outFile}`);
}

const method = (process.argv[2] || 'A').toUpperCase();
runTest(method).catch(err => console.error('테스트 실패:', err.message));
