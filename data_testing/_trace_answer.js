/**
 * 답변 생성 파이프라인 추적 테스트 v2
 * 고유명사 부스트 + 강제포함 제거 후 테스트
 * 
 * 사용법: $env:GEMINI_API_KEY='키값'; node data_testing/_trace_answer.js
 * API 키 없으면 검색 파이프라인만 추적 (AI 답변 생략)
 */

const path = require('path');
const fs = require('fs');

// ========== 데이터 로드 ==========
function loadJsonFilesRecursively(dirPath, allData = []) {
    if (!fs.existsSync(dirPath)) return allData;
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
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
    loadJsonFilesRecursively(path.join(projectRoot, 'data'), allData);
    return allData;
}

// ========== 스코어링 (api/search.js 동일) ==========
function calculateSmartScore(item, coreKeywords, expandedKeywords, topic, strategy) {
    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const field = (item.metadata?.field || '').toLowerCase();
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
    const features = (item.metadata?.features || []).join(' ').toLowerCase();
    const text = question + ' ' + answer + ' ' + field + ' ' + specialties + ' ' + features;
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
                if (question.includes(kw) || question.replace(/\s/g, '').includes(kwNoSpace)) {
                    coreHits += 0.5;
                }
            }
        }
        score += Math.min((coreHits / coreKeywords.length) * 0.6, 0.6);
    }

    if (expandedKeywords && expandedKeywords.length > 0) {
        let expandHits = 0;
        for (const keyword of expandedKeywords) {
            if (!keyword) continue;
            const kw = keyword.toLowerCase();
            const kwNoSpace = kw.replace(/\s/g, '');
            if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) expandHits++;
        }
        score += Math.min((expandHits / expandedKeywords.length) * 0.25, 0.25);
    }

    if (topic && topic !== '기타') {
        const topics = Array.isArray(topic) ? topic : [topic];
        for (const t of topics) {
            const searchTopic = t.toLowerCase();
            if (field.includes(searchTopic) || question.includes(searchTopic)) { score += 0.1; break; }
        }
    }

    if (strategy === 'exact') {
        if (coreKeywords && coreKeywords.length > 0) {
            let hasCoreMatch = coreKeywords.some(kw => {
                if (!kw) return false;
                const kwLower = kw.toLowerCase();
                return text.includes(kwLower) || textNoSpace.includes(kwLower.replace(/\s/g, ''));
            });
            if (!hasCoreMatch) score *= 0.3;
        }
    }
    return score;
}

function calculateSpecialtyBonus(item, userSpecialty) {
    if (!userSpecialty || !userSpecialty.keywords) return 0;
    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
    const features = (item.metadata?.features || []).join(' ').toLowerCase();
    const text = question + ' ' + answer + ' ' + specialties + ' ' + features;
    const textNoSpace = text.replace(/\s/g, '');
    let bonus = 0, matchCount = 0;
    for (const keyword of userSpecialty.keywords) {
        const kw = keyword.toLowerCase();
        const kwNoSpace = kw.replace(/\s/g, '');
        if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) matchCount++;
    }
    if (specialties && specialties.includes(userSpecialty.code.toLowerCase())) {
        bonus += 0.2;
    } else if (matchCount > 0) {
        bonus += Math.min(matchCount * 0.05, 0.15);
    }
    return bonus;
}

// ========== 검색 (R24 커트라인 + 고유명사 부스트) ==========
function smartSearchWithBoost(allData, queryPlan, userSpecialty) {
    const { coreKeywords, expandedKeywords, excludeKeywords, searchStrategy, topic, targetCategory, subIntent } = queryPlan;

    let candidates = allData || [];

    candidates = candidates.filter(item => {
        if (!excludeKeywords || excludeKeywords.length === 0) return true;
        const questionText = (item.question || '').toLowerCase();
        for (const excludeWord of excludeKeywords) {
            if (excludeWord && excludeWord.length >= 2 && questionText.includes(excludeWord.toLowerCase())) return false;
        }
        return true;
    });

    let results = candidates.map(item => {
        let score = calculateSmartScore(item, coreKeywords, expandedKeywords, topic, searchStrategy);
        const itemTopic = item.metadata?.topic || item.metadata?.category || '';
        const itemField = (item.metadata?.field || '').toLowerCase();
        const itemPath = item.metadata?.categoryPath || '';

        if (topic) {
            const topics = Array.isArray(topic) ? topic : [topic];
            for (const t of topics) {
                if (t && t !== '기타') {
                    const st = t.toLowerCase();
                    if (itemTopic.toLowerCase().includes(st) || itemField.includes(st)) { score += 0.5; break; }
                }
            }
        }

        const subIntents = Array.isArray(subIntent) ? subIntent : [subIntent];
        if (subIntents.includes('파트너사목록') && itemPath.startsWith('partners')) score += 0.2;
        if (item.metadata?.priority === 1 && itemPath.startsWith('partners')) score += 0.15;
        else if (item.metadata?.priority === 2 && itemPath.startsWith('partners')) score += 0.05;

        if (userSpecialty && userSpecialty.keywords) {
            const sb = calculateSpecialtyBonus(item, userSpecialty);
            if (sb > 0) score += sb;
        }

        // ★★★ 고유명사 부스트 (NEW) ★★★
        // 코어 키워드가 문서 제목(question)과 정확히 일치하면 +0.5 부스트
        if (coreKeywords && coreKeywords.length > 0) {
            const questionTrimmed = (item.question || '').trim();
            const questionNoSpace = questionTrimmed.toLowerCase().replace(/\s/g, '');
            for (const kw of coreKeywords) {
                if (!kw || kw.length < 2) continue;
                const kwNoSpace = kw.toLowerCase().replace(/\s/g, '');
                if (questionNoSpace === kwNoSpace || questionTrimmed.toLowerCase() === kw.toLowerCase()) {
                    score += 1.0;
                    item._entityBoosted = true; // 디버그용 마커
                    break;
                }
            }
        }

        // 디버그: 무아디자인 문서 추적
        if ((item.question || '').includes('무아디자인')) {
            console.log(`  🔍 [DEBUG] "${item.question}" score=${score.toFixed(4)} boosted=${item._entityBoosted || false}`);
        }

        return { ...item, score };
    })
        .filter(r => r.score > 0.05)
        .sort((a, b) => b.score - a.score);

    // 진료과 민감 페널티
    const specialtySensitiveCategories = ['partners', 'medical_device'];
    const targetCategories = Array.isArray(targetCategory) ? targetCategory : [targetCategory];
    const isSpecialtySensitive = targetCategories.some(cat => specialtySensitiveCategories.includes(cat));

    if (userSpecialty && userSpecialty.code) {
        const userSpecCode = userSpecialty.code.toLowerCase();
        results = results.map(item => {
            const itemSpecs = item.metadata?.specialties || [];
            const hasSpecTag = itemSpecs.length > 0;
            const matchesUserSpec = itemSpecs.some(s => s.toLowerCase() === userSpecCode);
            let finalScore = item.score;
            if (isSpecialtySensitive && hasSpecTag && !matchesUserSpec && !item._entityBoosted) finalScore = item.score * 0.6;
            return { ...item, score: finalScore };
        });
        results.sort((a, b) => b.score - a.score);
    }

    // ★ R24 커트라인: min(top×0.75, mean+2σ) + cap10 ★
    if (results.length > 0) {
        const scores = results.map(r => r.score);
        const topScore = scores[0];
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const stdDev = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);
        const baseCutoff = Math.min(topScore * 0.75, mean + 2.0 * stdDev);
        const maxDocs = 10;
        const cutoffThreshold = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;

        console.log(`  📊 커트라인: ${cutoffThreshold.toFixed(4)} (top=${topScore.toFixed(4)}, mean=${mean.toFixed(4)}, σ=${stdDev.toFixed(4)})`);
        console.log(`  ✂️  통과: ${results.filter(r => r.score >= cutoffThreshold).length}개 / 제외: ${results.filter(r => r.score < cutoffThreshold).length}개`);
        results = results.filter(r => r.score >= cutoffThreshold);
    }

    return results;
}

// ========== 설정 ==========
const USER_SPECIALTY = {
    code: '미용', label: '미용',
    keywords: ['미용', '피부과', '성형외과', '피부', '성형', '레이저', '보톡스', '필러', '리프팅', '울쎄라', '써마지']
};

const TEST_CASES = [
    {
        question: '무아디자인 평당가',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['인테리어'],
            targetCategory: ['partners', 'hospital-basics', 'qa'],
            specialtyRelevant: true,
            coreKeywords: ['무아디자인', '평당가', '비용', '견적'],
            expandedKeywords: ['인테리어', '미용', '피부과', '성형외과', '클리닉', '개원비용'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '인테리어 업체 추천해줘',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['파트너사목록'], topic: ['인테리어'],
            targetCategory: ['partners', 'hospital-basics'],
            specialtyRelevant: true,
            coreKeywords: ['인테리어', '업체', '추천'],
            expandedKeywords: ['미용', '피부과', '성형외과', '디자인', '시공'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '무아디자인 말고 다른 업체 추천',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['파트너사목록'], topic: ['인테리어'],
            targetCategory: ['partners', 'hospital-basics'],
            specialtyRelevant: true,
            coreKeywords: ['인테리어', '업체', '추천', '무아디자인'],
            expandedKeywords: ['미용', '피부과', '성형외과', '디자인', '시공', '파트너사'],
            excludeKeywords: ['무아디자인'], searchStrategy: 'semantic'
        }
    },
    // ★ 일반 질문 (부스트 영향 없어야 함) ★
    {
        question: '개원 절차가 어떻게 되나요?',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['개원준비'],
            targetCategory: ['hospital-basics'],
            specialtyRelevant: false,
            coreKeywords: ['개원', '절차', '과정', '단계'],
            expandedKeywords: ['병원', '의원', '준비', '일정'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '의료기기 리스 비용이 궁금합니다',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['의료장비'],
            targetCategory: ['medical_device', 'hospital-basics'],
            specialtyRelevant: true,
            coreKeywords: ['의료기기', '리스', '비용', '렌탈'],
            expandedKeywords: ['장비', '구매', '할부', '미용', '피부과'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '세무사 추천해주세요',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['파트너사목록'], topic: ['세무'],
            targetCategory: ['partners', 'hospital-basics'],
            specialtyRelevant: false,
            coreKeywords: ['세무사', '세무', '추천'],
            expandedKeywords: ['세금', '회계', '파트너사', '개원'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    }
];

// ========== 메인 ==========
async function runTrace() {
    console.log('');
    console.log('═'.repeat(80));
    console.log('  🔬 답변 생성 파이프라인 추적 v2 (고유명사 부스트)');
    console.log('═'.repeat(80));

    console.log('\n  📂 데이터 로드 중...');
    const allData = loadServerData();
    console.log(`  ✅ 총 ${allData.length}개 문서 로드 완료`);

    for (let t = 0; t < TEST_CASES.length; t++) {
        const tc = TEST_CASES[t];
        console.log('\n' + '═'.repeat(80));
        console.log(`  [테스트 ${t + 1}/${TEST_CASES.length}] "${tc.question}"`);
        console.log('═'.repeat(80));
        console.log(`  핵심: ${tc.queryPlan.coreKeywords.join(', ')}`);
        console.log(`  확장: ${tc.queryPlan.expandedKeywords.join(', ')}`);
        if (tc.queryPlan.excludeKeywords.length > 0) {
            console.log(`  제외: ${tc.queryPlan.excludeKeywords.join(', ')}`);
        }

        const searchResults = smartSearchWithBoost(allData, tc.queryPlan, USER_SPECIALTY);

        console.log(`\n  📋 통과 문서 목록:`);
        searchResults.forEach((doc, i) => {
            const q = (doc.question || '').substring(0, 65);
            const src = doc.source || 'etc';
            const boosted = doc._entityBoosted ? ' 🎯부스트' : '';
            const ansLen = (doc.answer || '').length;
            console.log(`     [${i + 1}] ${doc.score.toFixed(4)} (${src})${boosted} ${q} (${ansLen}자)`);
        });

        // 컨텍스트 비율 분석
        const totalContextLen = searchResults.reduce((sum, d) => sum + (d.answer || '').length, 0);
        const entityDocs = searchResults.filter(d => d._entityBoosted);
        const entityLen = entityDocs.reduce((sum, d) => sum + (d.answer || '').length, 0);
        if (entityDocs.length > 0) {
            console.log(`\n  📊 컨텍스트 비율: 고유명사 문서 ${entityLen}자 (${(entityLen / totalContextLen * 100).toFixed(1)}%) / 전체 ${totalContextLen}자`);
        }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('  추적 완료');
    console.log('═'.repeat(80));
}

runTrace().catch(err => console.error('테스트 실패:', err.message));
