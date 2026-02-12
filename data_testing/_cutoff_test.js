/**
 * 커트라인 공식 테스트 스크립트 v5
 * 로컬 검색 → 커트라인 적용 → Gemini API로 AI 답변 생성 → 출력
 * 
 * 사용법: $env:GEMINI_API_KEY='키값'; node data_testing/_cutoff_test.js [round]
 * API 키는 환경변수로만 전달 (코드에 하드코딩 금지)
 */

const path = require('path');
const fs = require('fs');

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
    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
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

// ========== 스코어링 (search.js 동일) ==========
// ========== 운영코드(api/search.js) 동일 - Smart Score 계산 (단순화 v2.3.1) ==========
function calculateSmartScore(item, coreKeywords, expandedKeywords, topic, strategy) {
    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const field = (item.metadata?.field || '').toLowerCase();
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();

    const text = question + ' ' + answer + ' ' + field + ' ' + specialties;
    const textNoSpace = text.replace(/\s/g, '');

    let score = 0;

    // 1. 핵심 키워드 매칭 (최대 +0.6)
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

    // 2. 확장 키워드 매칭 (최대 +0.25)
    if (expandedKeywords && expandedKeywords.length > 0) {
        let expandHits = 0;
        for (const keyword of expandedKeywords) {
            if (!keyword) continue;
            const kw = keyword.toLowerCase();
            const kwNoSpace = kw.replace(/\s/g, '');

            if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) {
                expandHits++;
            }
        }
        score += Math.min((expandHits / expandedKeywords.length) * 0.25, 0.25);
    }

    // 3. 토픽 매칭 (+0.1) - 배열 지원
    if (topic) {
        const topics = Array.isArray(topic) ? topic : [topic];
        for (const t of topics) {
            if (t && t !== '기타') {
                const searchTopic = t.toLowerCase();
                if (field.includes(searchTopic) || question.includes(searchTopic)) {
                    score += 0.1;
                    break;
                }
            }
        }
    }

    return score;
}

// ========== 운영코드(api/search.js) 동일 - 진료과 보너스 계산 ==========
function calculateSpecialtyBonus(item, userSpecialty) {
    if (!userSpecialty || !userSpecialty.keywords) return 0;

    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
    const features = (item.metadata?.features || []).join(' ').toLowerCase();

    const text = question + ' ' + answer + ' ' + specialties + ' ' + features;
    const textNoSpace = text.replace(/\s/g, '');

    let bonus = 0;
    let matchCount = 0;

    for (const keyword of userSpecialty.keywords) {
        const kw = keyword.toLowerCase();
        const kwNoSpace = kw.replace(/\s/g, '');

        if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) {
            matchCount++;
        }
    }

    // 진료과 보너스 단순화 (최대 +0.2)
    if (specialties && specialties.includes(userSpecialty.code.toLowerCase())) {
        bonus += 0.2;
    } else if (matchCount > 0) {
        bonus += Math.min(matchCount * 0.05, 0.15);
    }

    return bonus;
}

// ========== 운영코드(api/search.js) 동일 - Smart Search ==========
function smartSearchRaw(allData, queryPlan, userSpecialty) {
    const { coreKeywords, expandedKeywords, excludeKeywords, searchStrategy, topic, targetCategory, subIntent } = queryPlan;

    let candidates = allData || [];

    // 1. 제외 키워드 필터링
    candidates = candidates.filter(item => {
        if (!excludeKeywords || excludeKeywords.length === 0) return true;
        const questionText = (item.question || '').toLowerCase();
        for (const excludeWord of excludeKeywords) {
            if (excludeWord && excludeWord.length >= 2 && questionText.includes(excludeWord.toLowerCase())) {
                return false;
            }
        }
        return true;
    });

    // 2. 스코어링
    let results = candidates.map(item => {
        let score = calculateSmartScore(item, coreKeywords, expandedKeywords, topic, searchStrategy);

        const itemTopic = item.metadata?.topic || item.metadata?.category || '';
        const itemField = (item.metadata?.field || '').toLowerCase();
        const itemPath = item.metadata?.structuredCategory || item.metadata?.categoryPath || '';

        // 토픽 매칭 보너스 - 배열 지원
        if (topic) {
            const topicsArr = Array.isArray(topic) ? topic : [topic];
            for (const t of topicsArr) {
                if (t && t !== '기타') {
                    const searchTopic = t.toLowerCase();
                    if (itemTopic.toLowerCase().includes(searchTopic) || itemField.includes(searchTopic)) {
                        score = score + 0.5;
                        break;
                    }
                }
            }
        }

        // ★ 파트너사 가중치
        const subIntents = Array.isArray(subIntent) ? subIntent : [subIntent];
        const isPartnerIntent = subIntents.includes('파트너사목록');
        const isPartnerItem = itemPath === 'partners' || itemPath.startsWith('partners');
        if (isPartnerIntent && isPartnerItem) {
            score = score + 0.2;
        }

        // ★ Priority 보너스
        if (isPartnerItem && item.metadata?.priority) {
            if (item.metadata.priority === 1) {
                score = score + 0.15;
            } else if (item.metadata.priority === 2) {
                score = score + 0.05;
            }
        }

        // 진료과 보너스
        if (userSpecialty && userSpecialty.keywords) {
            const specialtyBonus = calculateSpecialtyBonus(item, userSpecialty);
            if (specialtyBonus > 0) {
                score = score + specialtyBonus;
            }
        }

        return { ...item, score };
    })
        .filter(r => r.score > 0.05)
        .sort((a, b) => b.score - a.score);

    // 진료과 민감 카테고리 페널티 - 배열 지원
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

            if (!isSpecialtySensitive || !hasSpecTag || matchesUserSpec) {
                finalScore = item.score * 1.0;
            } else if (isSpecialtySensitive && hasSpecTag && !matchesUserSpec) {
                finalScore = item.score * 0.6;
            }

            return { ...item, score: finalScore };
        });

        results.sort((a, b) => b.score - a.score);
    }

    return results;
}

// ========== 통계 및 갭탐지 ==========
function calcStats(scores) {
    const n = scores.length;
    if (n === 0) return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0 };
    const mean = scores.reduce((a, b) => a + b, 0) / n;
    const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    return { mean, stdDev: Math.sqrt(variance), min: Math.min(...scores), max: Math.max(...scores), count: n };
}

function findMaxGapCutoff(scores) {
    if (scores.length < 2) return { cutoff: 0, gapSize: 0, gapPosition: 0 };
    let maxGap = 0, cutoffIdx = scores.length - 1;
    for (let i = 0; i < scores.length - 1; i++) {
        const gap = scores[i] - scores[i + 1];
        if (gap > maxGap) { maxGap = gap; cutoffIdx = i; }
    }
    return { cutoff: scores[cutoffIdx + 1], gapSize: maxGap, gapPosition: cutoffIdx + 1 };
}

// ========== 커트라인 수식 (반복 분석 후 하나씩 추가) ==========
function getCutoff(scores, stats, round) {
    switch (round) {
        case 0: return { value: stats.max * 0.25, name: 'topScore × 0.25 (현재)' };
        case 1: return { value: stats.max * 0.5, name: 'topScore × 0.5' };
        case 2: return { value: stats.max * 0.45, name: 'topScore × 0.45' };
        case 3: return { value: stats.mean + 0.5 * stats.stdDev, name: `평균+0.5σ = ${(stats.mean + 0.5 * stats.stdDev).toFixed(4)}` };
        case 4: {
            const a = stats.max * 0.5;
            const b = stats.mean + 1.0 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.5, mean+1σ) = ${val.toFixed(4)}` };
        }
        case 5: {
            const a = stats.max * 0.5;
            const b = stats.mean + 1.5 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.5, mean+1.5σ) = ${val.toFixed(4)}` };
        }
        case 6: {
            const a = stats.max * 0.55;
            const b = stats.mean + 1.0 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.55, mean+1σ) = ${val.toFixed(4)}` };
        }
        case 7: {
            const a = stats.max * 0.6;
            const b = stats.mean + 1.0 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.6, mean+1σ) = ${val.toFixed(4)}` };
        }
        case 8: {
            const g = findMaxGapCutoff(scores);
            const safeFloor = stats.max * 0.4;
            const val = Math.min(g.cutoff, safeFloor);
            return { value: val, name: `min(갭탐지, top×0.4) = ${val.toFixed(4)} (갭=${g.gapSize.toFixed(4)}, pos=${g.gapPosition})` };
        }
        case 9: {
            // R6 + 최소 하한: 0.45 미만 문서는 무조건 제외
            const a = stats.max * 0.55;
            const b = stats.mean + 1.0 * stats.stdDev;
            const hybrid = Math.min(a, b);
            const val = Math.max(hybrid, 0.45);
            return { value: val, name: `max(min(top×0.55, mean+1σ), 0.45) = ${val.toFixed(4)}` };
        }
        case 10: {
            const a = stats.max * 0.55;
            const b = stats.mean + 1.0 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.55, mean+1σ) = ${val.toFixed(4)}` };
        }
        case 11: {
            const a = stats.max * 0.55;
            const b = stats.mean + 1.2 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.55, mean+1.2σ) = ${val.toFixed(4)}` };
        }
        case 12: {
            const a = stats.max * 0.6;
            const b = stats.mean + 1.2 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.6, mean+1.2σ) = ${val.toFixed(4)}` };
        }
        case 13: {
            const a = stats.max * 0.7;
            const b = stats.mean + 2.0 * stats.stdDev;
            const val = Math.min(a, b);
            return { value: val, name: `min(top×0.7, mean+2σ) = ${val.toFixed(4)}` };
        }
        case 14: {
            // R13 + 최대 20개 cap: 커트라인 통과 문서가 20개 넘으면 20번째 점수로 올림
            const baseCutoff = Math.min(stats.max * 0.7, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 20;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.7,mean+2σ)+cap20 = ${cappedVal.toFixed(4)}` };
        }
        case 15: {
            // 상위 5% 백분위수 커트라인
            const pIdx = Math.max(0, Math.floor(scores.length * 0.05) - 1);
            const val = scores[pIdx] || stats.max * 0.5;
            return { value: val, name: `percentile_95 = ${val.toFixed(4)}` };
        }
        case 16: {
            // 단순 공격적 비율
            const val = stats.max * 0.8;
            return { value: val, name: `top×0.8 = ${val.toFixed(4)}` };
        }
        case 17: {
            // 중앙값 기반: median + 1.5σ
            const sorted = [...scores];
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            const val = median + 1.5 * stats.stdDev;
            return { value: val, name: `median+1.5σ = ${val.toFixed(4)}` };
        }
        case 18: {
            // max(top×0.65, median+1σ): 두 방향 중 높은 쪽 사용
            const sorted = [...scores];
            const mid = Math.floor(sorted.length / 2);
            const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            const a = stats.max * 0.65;
            const b = median + 1.0 * stats.stdDev;
            const val = Math.max(a, b);
            return { value: val, name: `max(top×0.65, median+1σ) = ${val.toFixed(4)}` };
        }
        case 19: {
            // R14 개선: cap 15 + min(top×0.75, mean+2σ)
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 15;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.75,mean+2σ)+cap15 = ${cappedVal.toFixed(4)}` };
        }
        case 20: {
            // R14 변형: cap 20 + min(top×0.75, mean+2.5σ)
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.5 * stats.stdDev);
            const maxDocs = 20;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.75,mean+2.5σ)+cap20 = ${cappedVal.toFixed(4)}` };
        }
        case 21: {
            // R19 변형: top×0.7 (R19에서 top 비율만 낮춤)
            const baseCutoff = Math.min(stats.max * 0.7, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 15;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.7,mean+2σ)+cap15 = ${cappedVal.toFixed(4)}` };
        }
        case 22: {
            // R19 변형: σ 계수 1.8 (R19에서 σ만 줄임)
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 1.8 * stats.stdDev);
            const maxDocs = 15;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.75,mean+1.8σ)+cap15 = ${cappedVal.toFixed(4)}` };
        }
        case 23: {
            // R19 변형: cap 12 (R19에서 cap만 줄임)
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 12;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.75,mean+2σ)+cap12 = ${cappedVal.toFixed(4)}` };
        }
        case 24: {
            // R19 변형: cap 10
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 10;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.75,mean+2σ)+cap10 = ${cappedVal.toFixed(4)}` };
        }
        case 25: {
            // R19 변형: cap 8
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 8;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.75,mean+2σ)+cap8 = ${cappedVal.toFixed(4)}` };
        }
        case 26: {
            // 갭탐지 + cap15: 큰 점수 갭 기준으로 자르되 cap 적용
            const g = findMaxGapCutoff(scores);
            const baseCutoff = Math.max(g.cutoff, stats.mean + 1.5 * stats.stdDev);
            const maxDocs = 15;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `max(gap,mean+1.5σ)+cap15 = ${cappedVal.toFixed(4)}` };
        }
        case 27: {
            // R24 + 하한선 0.3: 아무리 낮아도 0.3 이상
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 10;
            const withFloor = Math.max(baseCutoff, 0.3);
            const cappedVal = scores.length > maxDocs ? Math.max(withFloor, scores[maxDocs - 1]) : withFloor;
            return { value: cappedVal, name: `min(top×0.75,mean+2σ)+floor0.3+cap10 = ${cappedVal.toFixed(4)}` };
        }
        case 28: {
            // 적응형 cap: 매칭 50개 미만이면 cap5, 50~200이면 cap10, 200+ 이면 cap15
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const totalMatched = scores.length;
            const maxDocs = totalMatched < 50 ? 5 : totalMatched < 200 ? 10 : 15;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `adaptive_cap(${maxDocs}) = ${cappedVal.toFixed(4)}` };
        }
        case 29: {
            // R24 변형: top×0.8 + mean+2σ + cap10 (base 커트라인만 올림)
            const baseCutoff = Math.min(stats.max * 0.8, stats.mean + 2.0 * stats.stdDev);
            const maxDocs = 10;
            const cappedVal = scores.length > maxDocs ? Math.max(baseCutoff, scores[maxDocs - 1]) : baseCutoff;
            return { value: cappedVal, name: `min(top×0.8,mean+2σ)+cap10 = ${cappedVal.toFixed(4)}` };
        }
        case 30: {
            // 하이브리드: min(top×0.75, mean+2σ) + cap10 + floor(top×0.3)
            const baseCutoff = Math.min(stats.max * 0.75, stats.mean + 2.0 * stats.stdDev);
            const floor = stats.max * 0.3;
            const withFloor = Math.max(baseCutoff, floor);
            const maxDocs = 10;
            const cappedVal = scores.length > maxDocs ? Math.max(withFloor, scores[maxDocs - 1]) : withFloor;
            return { value: cappedVal, name: `min(top×0.75,mean+2σ)+floor(top×0.3)+cap10 = ${cappedVal.toFixed(4)}` };
        }
        default: return { value: stats.max * 0.25, name: 'default' };
    }
}

// ========== 문서 포맷 ==========
function formatDocForAI(item, idx) {
    let prefix = `[${idx + 1}]`;
    if (item.metadata?.priority === 1) prefix += ' ⭐추천';
    if (item.metadata?.specialties && item.metadata.specialties.length > 0) {
        const tags = item.metadata.specialties.join(' ');
        prefix += ` ${tags} |`;
    } else {
        prefix += ' (공통) |';
    }
    const truncatedAnswer = item.answer.length > 15000
        ? item.answer.substring(0, 15000) + '...(이하 생략)'
        : item.answer;
    return `${prefix} Q: ${item.question}\nA: ${truncatedAnswer}`;
}

function buildSystemPrompt(contextText) {
    return `당신은 병원 개원 전문 AI 컨설턴트입니다. 친절하고 전문적인 어조로 답변하되, **잘 구조화된 보고서 형식**으로 출력하세요.

# 사용자 진료과
사용자는 **미용(피부과/성형외과)** 개원을 준비 중입니다.

# [Visual Formatting Protocol] 🎨
1. 첫 줄은 핵심 결론을 한 문장으로. 라벨 금지.
2. 주제 전환 시 \`### 소제목\`. #### 이하 금지. 업체명은 **볼드**.
3. 한 단락 최대 3줄.
4. ⭐추천 파트너사를 먼저 소개. 추천 이유는 비공개.
5. 마침표로 끝.

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
    {
        question: '울쎄라에 대해 알려줘',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['의료기기'],
            targetCategory: ['advanced', 'qa'], specialtyRelevant: true,
            coreKeywords: ['울쎄라', '의료기기', 'HIFU', '리프팅'],
            expandedKeywords: ['울쎄라 장비', '초음파', '피부', '미용', '시술'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '대출은 보통 얼마까지 나와?',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['비용', '정보요청'], topic: ['세무·대출'],
            targetCategory: ['hospital-basics', 'qa'], specialtyRelevant: false,
            coreKeywords: ['대출', '금액', '한도', '은행'],
            expandedKeywords: ['대출 한도', '대출금', '개원 대출', '금리', '담보'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '마케팅 할 때 가장 중요한 포인트는 뭐야?',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['마케팅'],
            targetCategory: ['partners', 'hospital-basics', 'qa'],
            specialtyRelevant: true,
            coreKeywords: ['마케팅', '중요', '포인트', '핵심'],
            expandedKeywords: ['마케팅 전략', '광고', 'SNS', '블로그', '미용', '피부과'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '톤앤무드 평당가 얼마야?',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['비용', '파트너사목록'], topic: ['인테리어'],
            targetCategory: ['partners'], specialtyRelevant: true,
            coreKeywords: ['톤앤무드', '평당가', '비용', '견적'],
            expandedKeywords: ['톤앤무드', '인테리어', '가격', '평당', '미용'],
            excludeKeywords: [], searchStrategy: 'exact'
        }
    },
    {
        question: '개원 시 전체 프로세스는 뭔가요?',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['개원절차'],
            targetCategory: ['hospital-basics', 'qa'], specialtyRelevant: false,
            coreKeywords: ['개원', '프로세스', '절차', '순서', '전체'],
            expandedKeywords: ['개원 과정', '병원 오픈', '준비', '단계', '로드맵'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    },
    {
        question: '간판 설치할 때 주의사항이나 중요한 포인트가 있나요?',
        queryPlan: {
            intent: 'SPECIFIC', requiresSearch: true,
            subIntent: ['정보요청'], topic: ['간판'],
            targetCategory: ['hospital-basics', 'partners', 'qa'], specialtyRelevant: false,
            coreKeywords: ['간판', '설치', '주의사항', '포인트'],
            expandedKeywords: ['간판 업체', '사인물', '시인성', '가시성', '조명', '네온'],
            excludeKeywords: [], searchStrategy: 'semantic'
        }
    }
];

// ========== 메인 ==========
async function runTest(roundNumber) {
    const cutoffPreview = getCutoff([1], { mean: 1, stdDev: 0, max: 1, min: 1, count: 1 }, roundNumber);

    console.log('');
    console.log('═'.repeat(80));
    console.log(`  🧪 테스트 R${roundNumber}`);
    console.log(`  📐 수식: ${cutoffPreview.name}`);
    console.log(`  👤 사용자: 테스트 / 미용`);
    console.log(`  🕐 시간: ${new Date().toLocaleString('ko-KR')}`);
    console.log('═'.repeat(80));

    console.log('\n  📂 데이터 로드 중...');
    const allData = loadServerData();
    console.log(`  ✅ 총 ${allData.length}개 문서 로드 완료\n`);

    for (let i = 0; i < TEST_CASES.length; i++) {
        const tc = TEST_CASES[i];
        console.log('═'.repeat(80));
        console.log(`  [사이클 ${i + 1}/5]`);
        console.log('═'.repeat(80));

        const allResults = smartSearchRaw(allData, tc.queryPlan, USER_SPECIALTY);
        const scores = allResults.map(r => r.score);
        const stats = calcStats(scores);
        const cutoff = getCutoff(scores, stats, roundNumber);
        const passedDocs = allResults.filter(r => r.score >= cutoff.value);

        console.log(`  질문: ${tc.question}`);
        console.log(`  📊 검색: ${allResults.length}개 매칭 | 최고=${stats.max.toFixed(4)} 평균=${stats.mean.toFixed(4)} σ=${stats.stdDev.toFixed(4)}`);
        console.log(`  ✂️  커트라인: ${cutoff.value.toFixed(4)} (${cutoff.name}) → ${passedDocs.length}개 통과 / ${allResults.length - passedDocs.length}개 제외`);

        const contextText = passedDocs.map((doc, idx) => formatDocForAI(doc, idx)).join('\n\n');
        const systemPrompt = buildSystemPrompt(contextText);

        console.log(`\n  🤖 AI 답변 생성 중... (${passedDocs.length}개 문서 참고)`);
        try {
            const aiAnswer = await callGeminiAPI(`질문: ${tc.question}`, systemPrompt);
            console.log(`\n  💬 답변:`);
            console.log('  ' + '─'.repeat(70));
            for (const line of aiAnswer.split('\n')) {
                console.log(`  ${line}`);
            }
            console.log('  ' + '─'.repeat(70));
        } catch (error) {
            console.log(`  ❌ AI 호출 실패: ${error.message}`);
        }

        console.log(`\n  📚 참고 문서 (${passedDocs.length}개):`);
        for (let j = 0; j < passedDocs.length; j++) {
            const doc = passedDocs[j];
            const score = doc.score.toFixed(4);
            const priority = doc.metadata?.priority ? ` P${doc.metadata.priority}` : '';
            const specs = doc.metadata?.specialties?.length > 0 ? ` [${doc.metadata.specialties.join(',')}]` : '';
            const q = (doc.question || '').substring(0, 60);
            console.log(`     [${j + 1}] ${score}${priority}${specs} ${q}`);
        }

        console.log('');
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log('═'.repeat(80));
    console.log('  테스트 완료');
    console.log('═'.repeat(80));
}

const round = parseInt(process.argv[2] || '0');
runTest(round).catch(err => console.error('테스트 실패:', err.message));
