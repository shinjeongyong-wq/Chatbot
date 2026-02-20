// Vercel Serverless Function - 검색 API (보안 로직)
// v26: 코어히트 0 필터에서 진료과보너스 제외 (쿼리 주제 무관 문서 통과 방지)

const fs = require('fs');
const path = require('path');

// ========== 데이터 캐싱 ==========
let cachedData = null;
let dataLoadedTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5분

// ========== TF-IDF 엔진 ==========
let idfCache = null; // { term: idf_value }
let docVectorCache = null; // Map<docIndex, { terms: Map<term, tfidf>, norm: number }>

// 한국어 토크나이저 (2글자 이상 단어 추출)
function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[^가-힣a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2);
}

// IDF 계산 (전체 문서 기반, 데이터 로드 시 1회 실행)
function buildIDF(documents) {
    const docCount = documents.length;
    const df = {}; // document frequency

    documents.forEach(doc => {
        const text = ((doc.question || '') + ' ' + (doc.answer || '')).toLowerCase();
        const terms = new Set(tokenize(text));
        terms.forEach(term => {
            df[term] = (df[term] || 0) + 1;
        });
    });

    const idf = {};
    Object.keys(df).forEach(term => {
        idf[term] = Math.log((docCount + 1) / (df[term] + 1)) + 1; // smoothed IDF
    });

    return idf;
}

// 문서의 TF-IDF 벡터 생성
function buildDocVector(doc, idf) {
    const text = ((doc.question || '') + ' ' + (doc.answer || '')).toLowerCase();
    const tokens = tokenize(text);
    if (tokens.length === 0) return { terms: new Map(), norm: 0 };

    // TF 계산
    const tf = {};
    tokens.forEach(t => { tf[t] = (tf[t] || 0) + 1; });

    // TF-IDF 벡터
    const terms = new Map();
    let normSq = 0;
    Object.keys(tf).forEach(term => {
        const tfidf = (tf[term] / tokens.length) * (idf[term] || 1);
        terms.set(term, tfidf);
        normSq += tfidf * tfidf;
    });

    return { terms, norm: Math.sqrt(normSq) };
}

// 쿼리 벡터 생성
function buildQueryVector(queryTerms, idf) {
    if (queryTerms.length === 0) return { terms: new Map(), norm: 0 };

    const tf = {};
    queryTerms.forEach(t => { tf[t] = (tf[t] || 0) + 1; });

    const terms = new Map();
    let normSq = 0;
    Object.keys(tf).forEach(term => {
        const tfidf = (tf[term] / queryTerms.length) * (idf[term] || 1);
        terms.set(term, tfidf);
        normSq += tfidf * tfidf;
    });

    return { terms, norm: Math.sqrt(normSq) };
}

// 코사인 유사도
function cosineSimilarity(vecA, vecB) {
    if (vecA.norm === 0 || vecB.norm === 0) return 0;

    let dotProduct = 0;
    // 작은 쪽을 순회하여 성능 최적화
    const [smaller, larger] = vecA.terms.size <= vecB.terms.size
        ? [vecA, vecB] : [vecB, vecA];

    for (const [term, val] of smaller.terms) {
        const otherVal = larger.terms.get(term);
        if (otherVal) dotProduct += val * otherVal;
    }

    return dotProduct / (vecA.norm * vecB.norm);
}

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

        // notion_split 폴더만 로드 (notion 폴더 제외 - 중복 방지)
        const splitPath = path.join(process.cwd(), 'data', 'notion_split');
        if (fs.existsSync(splitPath)) {
            loadJsonFilesRecursively(splitPath, allData);
            console.log(`📂 notion_split 로드: ${allData.length}개`);
        }

        // qa 폴더 로드
        const qaPath = path.join(process.cwd(), 'data', 'qa');
        if (fs.existsSync(qaPath)) {
            loadJsonFilesRecursively(qaPath, allData);
            console.log(`📂 qa 로드: ${allData.length}개`);
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
    'EMR': ['전자차트', 'CRM', '차트', '진료기록'],
    '전자차트': ['EMR', 'CRM', '차트', '진료기록'],
    'CRM': ['EMR', '전자차트', '고객관리'],
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

// ========== Smart Score 계산 (v27 — split tuning v6) ==========
// 도메인 불용어: 거의 모든 문서에 포함되어 변별력 없는 단어
const DOMAIN_STOPWORDS = new Set([
    '병원', '개원', '의료', '클리닉', '진료', '의원', '비용', '절차', '방법', '추천',
    '어떻게', '얼마', '정도', '필요', '무엇', '어떤', '하나요', '되나요', '인가요',
    '가입', '보험', '확인', '관련', '기준', '준비', '사항'
]);

function calculateSmartScore(item, coreKeywords, expandedKeywords, topic, strategy) {
    const question = (item.question || '').toLowerCase();
    const answer = (item.answer || '').toLowerCase();
    const field = (item.metadata?.field || '').toLowerCase();
    const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();

    const text = question + ' ' + answer + ' ' + field + ' ' + specialties;
    const textNoSpace = text.replace(/\s/g, '');

    let score = 0;
    let coreHitCount = 0;
    let questionMatchCount = 0;

    // 1. 핵심 키워드 매칭 (최대 +0.8)
    if (coreKeywords && coreKeywords.length > 0) {
        let coreHits = 0;
        for (const keyword of coreKeywords) {
            if (!keyword) continue;
            const kw = keyword.toLowerCase();
            const kwNoSpace = kw.replace(/\s/g, '');

            if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) {
                coreHits++;
                if (!DOMAIN_STOPWORDS.has(kw)) {
                    coreHitCount++;
                }
                // question에 있으면 카운트 (별도 보너스용)
                if (question.includes(kw) || question.replace(/\s/g, '').includes(kwNoSpace)) {
                    questionMatchCount++;
                }
            }
        }
        score += Math.min((coreHits / coreKeywords.length) * 0.8, 0.8);
    }

    // ★ Q_DIRECT_BONUS: 캡에 안 걸리는 별도 가산 (최대 +0.3)
    if (coreKeywords && coreKeywords.length > 0 && questionMatchCount > 0) {
        score += (questionMatchCount / coreKeywords.length) * 0.3;
    }

    // ★ SUBSECTION_BONUS: 스플릿 문서(> 포함)의 서브섹션에 핵심 키워드 매칭 시 가산 (최대 +0.5)
    if (question.includes('>') && coreKeywords && coreKeywords.length > 0) {
        const subsection = question.split('>').pop().trim().toLowerCase();
        const nonStopKws = coreKeywords.filter(k => k && !DOMAIN_STOPWORDS.has(k.toLowerCase()));
        if (nonStopKws.length > 0) {
            const subHits = nonStopKws.filter(k => subsection.includes(k.toLowerCase())).length;
            score += (subHits / nonStopKws.length) * 0.5;
        }
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

    return { score, coreHitCount, questionMatchCount };
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

    // 2. 코사인 유사도 쿼리 벡터 준비
    const allQueryTerms = [
        ...(coreKeywords || []).flatMap(kw => tokenize(kw || '')),
        ...(expandedKeywords || []).flatMap(kw => tokenize(kw || '')),
    ];
    const queryVector = idfCache ? buildQueryVector(allQueryTerms, idfCache) : null;

    // ★ 총 non-stopword 코어키워드 수 (스코어링용 — DOMAIN_STOPWORDS만)
    const totalNonStopCoreKws = (coreKeywords || []).filter(k => k && !DOMAIN_STOPWORDS.has(k.toLowerCase())).length;

    // ★ 동적 stopword (필터링 전용): 진료과 키워드 추가
    const dynamicStopwords = new Set(DOMAIN_STOPWORDS);
    if (userSpecialty && userSpecialty.keywords) {
        for (const kw of userSpecialty.keywords) {
            if (kw) dynamicStopwords.add(kw.toLowerCase());
        }
    }
    const totalDynNonStopCoreKws = (coreKeywords || []).filter(k => k && !dynamicStopwords.has(k.toLowerCase())).length;

    // 3. 스코어링
    let results = candidates.map((item, idx) => {
        const smartResult = calculateSmartScore(item, coreKeywords, expandedKeywords, topic, searchStrategy);
        let score = smartResult.score;
        const coreHitCount = smartResult.coreHitCount;

        // ★ TF-IDF 코사인 유사도 (0~1) → 가중치 0.4 (v27) ★
        let cosine = 0;
        if (queryVector && idfCache) {
            const docVec = buildDocVector(item, idfCache);
            cosine = cosineSimilarity(queryVector, docVec);
            score += cosine * 0.4;
        }

        // 스플릿 문서는 metadata가 없을 수 있음 → question에서 토픽 추론 (v27)
        let itemTopic = item.metadata?.topic || item.metadata?.category || '';
        let itemField = (item.metadata?.field || '').toLowerCase();
        const itemPath = item.metadata?.structuredCategory || '';

        // ★ fallback: question 제목에서 토픽 추론 (스플릿 노션 문서용)
        if (!itemTopic && item.question) {
            const q = item.question;
            const topicPatterns = [
                { re: /인테리어/i, topic: '인테리어 (기본편)', field: '인테리어' },
                { re: /의료기기/i, topic: '의료기기 (기본편)', field: '의료기기' },
                { re: /의료폐기물/i, topic: '의료폐기물 관리', field: '의료폐기물' },
                { re: /세무/i, topic: '세무', field: '세무·대출' },
                { re: /행정/i, topic: '행정 업무', field: '행정' },
                { re: /간판/i, topic: '간판 (기본편)', field: '간판' },
                { re: /로드맵/i, topic: '병의원 개업의 전반적 로드맵', field: '개원로드맵' },
                { re: /마케팅/i, topic: '마케팅 통합 가이드', field: '마케팅' },
                { re: /EMR|CRM/i, topic: 'EMR & CRM', field: 'EMR·CRM' },
                { re: /홈페이지/i, topic: '홈페이지', field: '홈페이지' },
                { re: /가구/i, topic: '가구', field: '가구' },
                { re: /체크리스트/i, topic: '체크리스트', field: '체크리스트' },
                { re: /관리.*업체/i, topic: '관리 관련 업체', field: '관리업체' },
            ];
            for (const p of topicPatterns) {
                if (p.re.test(q)) {
                    itemTopic = p.topic;
                    if (!itemField) itemField = p.field.toLowerCase();
                    break;
                }
            }
        }

        let hasTopicBonus = false;
        // 토픽 매칭 보너스 - 배열 지원
        if (topic) {
            const topics = Array.isArray(topic) ? topic : [topic];
            for (const t of topics) {
                if (t && t !== '기타') {
                    const searchTopic = t.toLowerCase();
                    if (itemTopic.toLowerCase().includes(searchTopic) || itemField.includes(searchTopic)) {
                        score = score + 0.5;
                        hasTopicBonus = true;
                        break;
                    }
                }
            }
        }

        // ★ 파트너사 가중치: subIntent에 '파트너사목록'이 포함될 때 적용 ★
        const subIntents = Array.isArray(queryPlan.subIntent) ? queryPlan.subIntent : [queryPlan.subIntent];
        const isPartnerIntent = subIntents.includes('파트너사목록');
        let hasPartnerBonus = false;
        if (isPartnerIntent && itemPath.startsWith('partners')) {
            score = score + 2.0;
            hasPartnerBonus = true;
        }
        // ★ 연관 파트너 보너스 (v27): 정보요청이지만 확장키워드가 파트너 문서와 매칭될 때
        if (!hasPartnerBonus && itemPath.startsWith('partners') && expandedKeywords && expandedKeywords.length > 0) {
            const partnerQ = (item.question || '').toLowerCase();
            const expandMatch = expandedKeywords.some(ek => ek && partnerQ.includes(ek.toLowerCase()));
            if (expandMatch) {
                score += 0.8;
                hasPartnerBonus = true;
            }
        }

        // 진료과 보너스
        let hasSpecialtyBonus = false;
        if (userSpecialty && userSpecialty.keywords) {
            const specialtyBonus = calculateSpecialtyBonus(item, userSpecialty);
            if (specialtyBonus > 0) {
                score = score + specialtyBonus;
                hasSpecialtyBonus = true;
            }
        }

        // ★ 고유명사 부스트: 코어 키워드가 문서 제목(question)과 정확 매칭 시 큰 보너스 ★
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

        // ★ 동적 stopword 기준 코어 히트 수 (필터링 전용, 스코어에 영향 없음)
        let dynCoreHitCount = 0;
        if (coreKeywords && coreKeywords.length > 0) {
            const question_lc = (item.question || '').toLowerCase();
            const answer_lc = (item.answer || '').toLowerCase();
            const text_all = question_lc + ' ' + answer_lc;
            for (const keyword of coreKeywords) {
                if (!keyword) continue;
                const kw = keyword.toLowerCase();
                if (dynamicStopwords.has(kw)) continue; // 진료과 키워드 스킵
                if (text_all.includes(kw) || text_all.replace(/\s/g, '').includes(kw.replace(/\s/g, ''))) {
                    dynCoreHitCount++;
                }
            }
        }

        return { ...item, score, _cosine: cosine, _coreHitCount: coreHitCount, _dynCoreHitCount: dynCoreHitCount, _totalNonStopCoreKws: totalNonStopCoreKws, _hasTopicBonus: hasTopicBonus, _hasPartnerBonus: hasPartnerBonus, _hasSpecialtyBonus: hasSpecialtyBonus };
    })
        .filter(r => r.score > 0.05)
        .sort((a, b) => b.score - a.score);

    // 진료과 민감 카테고리 페널티 제거됨 (파트너사 추천 방해 방지)

    // ★ 듀얼 커트라인: Primary(답변용) + Secondary(RT용) ★
    const filterInfo = { originalCount: data.length, scoredCount: results.length };
    let rtResults = []; // Related Topics 후보 문서
    if (results.length > 0) {
        const scores = results.map(r => r.score);
        const topScore = scores[0];
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        const stdDev = Math.sqrt(scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length);

        // Primary Cutoff: 답변 생성용 (α=0.65 — Final 1.0 베이스라인)
        const primaryBase = Math.min(topScore * 0.65, mean + 2.0 * stdDev);
        const maxDocs = 15;
        const primaryCutoff = scores.length > maxDocs
            ? Math.max(primaryBase, scores[maxDocs - 1])
            : primaryBase;

        // Secondary Cutoff: RT용 (β=0.40, σ계수=1.0 — R2 튜닝)
        const secondaryBase = Math.min(topScore * 0.40, mean + 1.0 * stdDev);
        const secondaryCutoff = secondaryBase; // RT용은 클램핑 없음
        const rtMaxDocs = 5; // RT 후보 상한

        filterInfo.primaryCutoff = primaryCutoff.toFixed(4);
        filterInfo.secondaryCutoff = secondaryCutoff.toFixed(4);
        filterInfo.cutoff = primaryCutoff.toFixed(4); // 호환성
        filterInfo.topScore = topScore.toFixed(4);
        filterInfo.mean = mean.toFixed(4);
        filterInfo.stdDev = stdDev.toFixed(4);
        // 수식 분해 정보
        filterInfo.primaryFormula = `min(top×0.65=${(topScore * 0.65).toFixed(4)}, μ+2σ=${(mean + 2.0 * stdDev).toFixed(4)})`;
        filterInfo.secondaryFormula = `min(top×0.40=${(topScore * 0.40).toFixed(4)}, μ+1.0σ=${(mean + 1.0 * stdDev).toFixed(4)})`;

        // Primary Zone: 답변에 사용
        const primaryResults = results.filter(r => r.score >= primaryCutoff);
        // Secondary Zone: Primary 아래 ~ Secondary 이상 (최대 rtMaxDocs개)
        rtResults = results.filter(r => r.score < primaryCutoff && r.score >= secondaryCutoff).slice(0, rtMaxDocs);

        results = primaryResults;
    }

    // ★ v21+: 코어키워드 히트율 기반 필터 (FALSE_POSITIVE 방지 강화) ★
    const coreFilter = (r) => {
        // 토픽 보너스나 고유명사 부스트는 항상 유지
        if (r._hasTopicBonus) return true;
        if (r._entityBoosted) return true;
        // 코어키워드 0히트 → 제외
        if (r._coreHitCount === 0) return false;
        // ★ 히트율 체크: non-stopword 코어키워드가 2개 이상인데 히트가 1개뿐이면 제외
        if (r._totalNonStopCoreKws >= 2 && r._coreHitCount <= 1) {
            console.log(`[Search] 히트율 필터 제외: coreHit=${r._coreHitCount}/${r._totalNonStopCoreKws} | ${(r.question || '').substring(0, 60)}`);
            return false;
        }
        return true;
    };
    const beforeCoreFilter = results.length;
    results = results.filter(coreFilter);
    // RT 문서에도 코어 필터 적용
    rtResults = rtResults.filter(coreFilter);
    if (beforeCoreFilter !== results.length) {
        console.log(`[Search] 코어키워드 0히트 필터: ${beforeCoreFilter}개 → ${results.length}개 (${beforeCoreFilter - results.length}개 제외)`);
    }

    filterInfo.passedCount = results.length;
    filterInfo.rtCount = rtResults.length;
    console.log(`[Search] 커트라인: Primary=${filterInfo.primaryCutoff || filterInfo.cutoff}, Secondary=${filterInfo.secondaryCutoff || 'N/A'} (top=${filterInfo.topScore}, mean=${filterInfo.mean}, σ=${filterInfo.stdDev})`);
    console.log(`[Search] → 답변용 ${filterInfo.passedCount}개 / RT용 ${filterInfo.rtCount}개 / 제외 ${filterInfo.scoredCount - filterInfo.passedCount - filterInfo.rtCount}개`);
    console.log(`[Search] 통과 문서:`);
    results.forEach((doc, i) => {
        console.log(`  [${i + 1}] ${doc.score.toFixed(4)} | ${(doc.question || '').substring(0, 60)}`);
    });

    const finalResults = results.slice(0, finalMaxResults);
    finalResults._filterInfo = filterInfo;
    finalResults._rtResults = rtResults;
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

            // TF-IDF 캐시 구축 (최초 1회)
            if (!idfCache) {
                console.log('[TF-IDF] IDF 캐시 구축 중...');
                idfCache = buildIDF(serverData);
                console.log(`[TF-IDF] IDF 구축 완료: ${Object.keys(idfCache).length}개 용어`);
            }

            const results = smartSearch(serverData, queryPlan, maxResults || 30, userSpecialty);

            return res.status(200).json({
                success: true,
                results: results,
                rtResults: results._rtResults || [],  // RT용 문서
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
