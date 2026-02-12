// Vercel Serverless Function - 검색 API (보안 로직)
// 프론트엔드에서 노출되던 검색 알고리즘을 서버로 이동

const fs = require('fs');
const path = require('path');

// ========== 데이터 캐싱 ==========
let cachedData = null;
let dataLoadedTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

// ========== 재귀적 JSON 파일 로드 ==========
function loadJsonFilesRecursively(dirPath, allData = []) {
    if (!fs.existsSync(dirPath)) return allData;

    const items = fs.readdirSync(dirPath);

    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // 폴더면 재귀 호출
            loadJsonFilesRecursively(fullPath, allData);
        } else if (item.endsWith('.json') && item !== 'index.json' && item !== 'topics.json') {
            // JSON 파일 로드 (index.json, topics.json 제외)
            try {
                const content = fs.readFileSync(fullPath, 'utf-8');
                const data = JSON.parse(content);

                // items 배열이 있는 경우
                if (data.items && Array.isArray(data.items)) {
                    allData.push(...data.items);
                }
                // 단일 문서 형식 (id와 question이 있는 경우)
                else if (data.id || data.question) {
                    allData.push(data);
                }
            } catch (e) {
                console.warn(`⚠️ ${fullPath} 파싱 실패:`, e.message);
            }
        }
    }

    return allData;
}

// ========== 서버에서 데이터 로드 ==========
function loadServerData() {
    // 캐시가 유효하면 재사용
    if (cachedData && dataLoadedTime && (Date.now() - dataLoadedTime < CACHE_DURATION)) {
        return cachedData;
    }

    try {
        let allData = [];

        // data 폴더의 모든 JSON 파일 로드 (notion, qa 등 하위 폴더 전체)
        const dataPath = path.join(process.cwd(), 'data');
        if (fs.existsSync(dataPath)) {
            loadJsonFilesRecursively(dataPath, allData);
            console.log(`📂 data 폴더 로드: ${allData.length}개`);
        }


        cachedData = allData;
        dataLoadedTime = Date.now();
        console.log(`✅ 서버 데이터 로드 완료: 총 ${allData.length}개`);

        return allData;
    } catch (error) {
        console.error('❌ 서버 데이터 로드 오류:', error);
        return [];
    }
}



// ========== 동의어 사전 ==========
const synonyms = {
    // 시간 관련
    '밤': ['야간', '심야', '저녁'],
    '야간': ['밤', '심야', '저녁'],
    '낮': ['주간', '오전', '오후'],
    '주간': ['낮', '오전', '오후'],
    // 비용 관련
    '비용': ['가격', '요금', '금액', '돈', '예산'],
    '가격': ['비용', '요금', '금액'],
    '예산': ['비용', '가격', '금액'],
    // 장소/시설 관련
    '의원': ['병원', '클리닉', '진료소'],
    '병원': ['의원', '클리닉', '진료소'],
    // 인테리어 관련
    '벽': ['벽면', '벽체', '내벽'],
    '바닥': ['바닥재', '플로어'],
    '마감재': ['마감', '자재', '소재'],
    '인테리어': ['실내', '내부'],
    // 기타
    '개원': ['오픈', '창업', '개업'],
    '간판': ['사인', '싸인', '현판'],
    '환자': ['고객', '내원객'],
    '진료': ['치료', '시술'],
};

// ========== 한국어 조사 제거 ==========
function normalizeWord(word) {
    return word.replace(/(은|는|이|가|을|를|에|에서|으로|로|의|와|과|도|만|\?|!|\.)$/, '').trim();
}

// ========== 쿼리 확장 ==========
function expandQueryWithSynonyms(query) {
    let expandedWords = [];
    const words = query.split(/\s+/);

    words.forEach(word => {
        expandedWords.push(word);
        const cleanWord = normalizeWord(word);
        if (cleanWord.length >= 2) {
            expandedWords.push(cleanWord);
        }
        Object.keys(synonyms).forEach(key => {
            if (word.includes(key) || cleanWord === key) {
                expandedWords = expandedWords.concat(synonyms[key]);
                expandedWords.push(key);
            }
        });
    });

    return [...new Set(expandedWords)].filter(w => w.length >= 2);
}

// ========== Smart Score 계산 (단순화 v2.3.1) ==========
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
                    break; // 하나만 매칭되면 OK
                }
            }
        }
    }

    return score;
}


// ========== 진료과 보너스 계산 ==========
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

// ========== Smart Search ==========
function smartSearch(data, queryPlan, maxResults = 10, userSpecialty = null) {
    const { coreKeywords, expandedKeywords, excludeKeywords, searchStrategy, topic, targetCategory, targetSubCategory, specialtyRelevant, intent } = queryPlan;
    const finalMaxResults = maxResults || 30;

    let candidates = data || [];

    if (candidates.length === 0) {
        return [];
    }

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
        const itemPath = item.metadata?.structuredCategory || '';

        // 토픽 매칭 보너스 - 배열 지원
        if (topic) {
            const topics = Array.isArray(topic) ? topic : [topic];
            for (const t of topics) {
                if (t && t !== '기타') {
                    const searchTopic = t.toLowerCase();
                    if (itemTopic.toLowerCase().includes(searchTopic) || itemField.includes(searchTopic)) {
                        score = score + 0.5;
                        break;
                    }
                }
            }
        }

        // ★ 파트너사 가중치: subIntent에 '파트너사목록'이 포함될 때 적용 ★
        const subIntents = Array.isArray(queryPlan.subIntent) ? queryPlan.subIntent : [queryPlan.subIntent];
        const isPartnerIntent = subIntents.includes('파트너사목록');
        if (isPartnerIntent && itemPath.startsWith('partners')) {
            score = score + 2.0;
        }

        // 진료과 보너스
        if (userSpecialty && userSpecialty.keywords) {
            const specialtyBonus = calculateSpecialtyBonus(item, userSpecialty);
            if (specialtyBonus > 0) {
                score = score + specialtyBonus;
            }
        }

        // ★ 고유명사 부스트: 코어 키워드가 문서 제목(question)과 정확 매칭 시 큰 보너스 ★
        if (coreKeywords && coreKeywords.length > 0) {
            const questionTrimmed = (item.question || '').trim();
            const questionNoSpace = questionTrimmed.toLowerCase().replace(/\s/g, '');
            for (const kw of coreKeywords) {
                if (!kw || kw.length < 2) continue;
                const kwNoSpace = kw.toLowerCase().replace(/\s/g, '');
                // 문서 제목이 키워드와 정확히 일치하거나, 제목에 키워드가 포함
                if (questionNoSpace === kwNoSpace || questionTrimmed.toLowerCase() === kw.toLowerCase()) {
                    score += 1.0; // 고유명사 정확 매칭 부스트
                    item._entityBoosted = true;
                    break;
                }
            }
        }

        return { ...item, score };
    })
        .filter(r => r.score > 0.05)
        .sort((a, b) => b.score - a.score);

    // 진료과 민감 카테고리 페널티 제거됨 (파트너사 추천 방해 방지)

    // ★ 동적 커트라인 R24: min(top×0.75, mean+2σ) + cap10 ★
    const filterInfo = { originalCount: data.length, scoredCount: results.length };
    if (results.length > 0) {
        const scores = results.map(r => r.score);
        const topScore = scores[0];
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const stdDev = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);

        const baseCutoff = Math.min(topScore * 0.75, mean + 2.0 * stdDev);
        const maxDocs = 10;
        const cutoffThreshold = scores.length > maxDocs
            ? Math.max(baseCutoff, scores[maxDocs - 1])
            : baseCutoff;

        filterInfo.cutoff = cutoffThreshold.toFixed(4);
        filterInfo.topScore = topScore.toFixed(4);
        filterInfo.mean = mean.toFixed(4);
        filterInfo.stdDev = stdDev.toFixed(4);

        results = results.filter(r => r.score >= cutoffThreshold);
    }

    filterInfo.passedCount = results.length;
    console.log(`[Search] 커트라인: ${filterInfo.cutoff} (top=${filterInfo.topScore}, mean=${filterInfo.mean}, σ=${filterInfo.stdDev}) → ${filterInfo.passedCount}개 통과 / ${filterInfo.scoredCount - filterInfo.passedCount}개 제외`);
    console.log(`[Search] 통과 문서:`);
    results.forEach((doc, i) => {
        console.log(`  [${i + 1}] ${doc.score.toFixed(4)} | ${(doc.question || '').substring(0, 60)}`);
    });

    const finalResults = results.slice(0, finalMaxResults);
    finalResults._filterInfo = filterInfo;
    return finalResults;
}

// ========== API Handler ==========
module.exports = async (req, res) => {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { action, queryPlan, maxResults, userSpecialty } = req.body;

        if (action === 'search') {
            if (!queryPlan) {
                return res.status(400).json({ error: 'Query plan is required' });
            }

            // ★ 서버에서 직접 데이터 로드 (클라이언트 전송 불필요)
            const serverData = loadServerData();

            if (!serverData || serverData.length === 0) {
                return res.status(500).json({ error: 'Failed to load server data' });
            }

            const results = smartSearch(serverData, queryPlan, maxResults || 30, userSpecialty);

            return res.status(200).json({
                success: true,
                results: results,
                count: results.length,
                dataSource: 'server',
                filterInfo: results._filterInfo || null  // T+C+K 필터링 정보
            });
        }

        return res.status(400).json({ error: 'Invalid action' });

    } catch (error) {
        console.error('Search API Error:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
