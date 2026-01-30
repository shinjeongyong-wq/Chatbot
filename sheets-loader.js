// sheets-loader.js
// Hybrid Loader: LocalStorage(우선) > 로컬파일 > Google API(최초 1회)

// API 설정 (최초 1회 다운로드용)
// API 설정 (Vercel 프록시 사용으로 인해 키는 서버측 환경변수로 관리됨)
const SHEETS_CONFIG = {
    RANGES: { QA: 'Q&A!A:M', FAQ: '생성형 FAQ!A:F' },
    QA_COLUMNS: { QUESTION: 2, ANSWER: 3, FIELD: 7, CATEGORY: 8 },
    faq_columns: { TOPIC_PATH: 1, QUESTION: 2, ANSWER: 3 }
};

class GoogleSheetsLoader {
    constructor() {
        this.cache = null;
        this.faqHierarchy = null;
    }

    async loadData() {
        // 1. 브라우저 내부 사본(LocalStorage) 확인
        const savedData = localStorage.getItem('CRYSTAL_HORIZON_DB_V1');
        if (savedData) {
            console.log('📦 로컬 사본(LocalStorage)에서 데이터를 불러옵니다.');
            this.cache = JSON.parse(savedData);

            // ⭐ 항상 Notion 폴더에서 최신 데이터 병합
            this.cache = await this.mergeNotionData(this.cache);

            this.initData();
            return this.cache;
        }

        // 2. 로컬 파일(qaData.js) 확인 - 100개 이상일 때만 사용
        if (typeof QA_DATA !== 'undefined' && QA_DATA.length > 100) {
            console.log('📂 로컬 파일(qaData.js)에서 데이터를 불러옵니다.');
            this.cache = QA_DATA;

            // ⭐ Notion 폴더에서 데이터 병합
            this.cache = await this.mergeNotionData(this.cache);

            localStorage.setItem('CRYSTAL_HORIZON_DB_V1', JSON.stringify(this.cache));
            this.initData();
            return this.cache;
        }

        // 3. 없으면 API로 최초 1회 다운로드
        console.log('🌐 사본이 없습니다. Google Sheets에서 전체 데이터를 내려받아 사본을 생성합니다...');
        try {
            await this.fetchAndSaveAllData();
            console.log('✅ 사본 생성 완료!');
            return this.cache;
        } catch (e) {
            console.error('데이터 다운로드 실패:', e);
            return [];
        }
    }

    // ⭐ Notion 데이터 병합 메서드 - 폴더 구조에서 로드
    async mergeNotionData(existingData) {
        try {
            const notionData = await this.loadNotionData();

            if (!notionData || notionData.length === 0) {
                console.log('⚠️ Notion 폴더 데이터 없음');
                return existingData;
            }

            // 기존 데이터에서 Notion 데이터 제거 (중복 방지)
            const nonNotionData = existingData.filter(item => item.source !== 'notion');

            // 새 Notion 데이터 병합
            const mergedData = [...nonNotionData, ...notionData];

            console.log(`📘 Notion 데이터 병합: ${notionData.length}개 추가 (총 ${mergedData.length}개)`);

            return mergedData;
        } catch (e) {
            console.warn('⚠️ Notion 폴더 로드 실패:', e.message);
            return existingData;
        }
    }

    initData() {
        const faqData = this.cache.filter(item => item.source === 'faq');
        this.buildFAQHierarchy(faqData);
    }

    async fetchAndSaveAllData() {
        const qaRows = await this.fetchRange(SHEETS_CONFIG.RANGES.QA);
        const faqRows = await this.fetchRange(SHEETS_CONFIG.RANGES.FAQ);

        const parsedQA = this.parseQAData(qaRows);
        const parsedFAQ = this.parseFAQData(faqRows);

        // 📘 Notion 데이터 로드 (오직 폴더 구조에서만)
        let notionData = [];
        try {
            notionData = await this.loadNotionData();
            console.log(`📘 Notion 폴더에서 로드: ${notionData.length}개 항목`);
        } catch (e) {
            console.warn('⚠️ Notion 폴더 로드 실패:', e.message);
        }

        this.cache = [...parsedQA, ...parsedFAQ, ...notionData];

        localStorage.setItem('CRYSTAL_HORIZON_DB_V1', JSON.stringify(this.cache));
        this.initData();
    }

    // 📂 Notion 폴더 구조에서 데이터 로드
    async loadNotionData() {
        const BASE_PATH = 'data/notion';
        const notionItems = [];

        // 인덱스 파일 로드
        const indexRes = await fetch(`${BASE_PATH}/index.json`);
        if (!indexRes.ok) throw new Error('index.json 로드 실패');

        const index = await indexRes.json();
        const categories = Object.keys(index.categories);

        console.log(`📂 ${categories.length}개 카테고리 로드 중...`);

        // 각 카테고리 JSON 파일 로드
        for (const categoryPath of categories) {
            try {
                const filePath = `${BASE_PATH}/${categoryPath}.json`;
                const res = await fetch(filePath);
                if (!res.ok) continue;

                const data = await res.json();

                // 각 항목 추가 (기존 구조 유지 + 카테고리 메타데이터 보강)
                for (const item of data.items || []) {
                    notionItems.push({
                        ...item,
                        metadata: {
                            ...item.metadata,
                            field: this.getCategoryField(categoryPath),
                            topic: this.getCategoryTopic(categoryPath),
                            categoryPath: categoryPath
                        }
                    });
                }
            } catch (e) {
                console.warn(`  ⚠️ ${categoryPath} 로드 실패:`, e.message);
            }
        }

        return notionItems;
    }

    // 카테고리 경로에서 필드(대분류) 추출
    getCategoryField(categoryPath) {
        const parts = categoryPath.split('/');
        const fieldMap = {
            'partners': '파트너사',
            'hospital-basics': '개원 시 필요 영역 [기본편]',
            'advanced': '심화 콘텐츠',
            'checklist': '체크리스트',
            'uncategorized': '기타'
        };
        return fieldMap[parts[0]] || parts[0];
    }

    // 카테고리 경로에서 토픽(중분류+소분류) 추출
    getCategoryTopic(categoryPath) {
        const parts = categoryPath.split('/');
        const topicMap = {
            // 중분류
            'pre-construction': '착공 이전',
            'post-construction': '착공 이후',
            'during-construction': '시공 중',
            'post-opening': '개설신고 이후',
            'post-registration': '개설신고 이후',
            // 소분류 - 파트너사
            'interior': '인테리어',
            'signage': '간판',
            'furniture': '가구',
            'bank': '은행',
            'homepage': '홈페이지',
            'pc-network': 'PC&네트워크',
            'late-process': '중후반 프로세스',
            'emr-crm': 'EMR/CRM',
            'marketing': '마케팅',
            'admin-checklist': '행정업무 체크리스트',
            'fire-checklist': '소방점검',
            'real-estate': '부동산',
            // 소분류 - 기본편
            'tax': '세무',
            'loan': '대출',
            'tax-loan': '세무/대출',
            'medical-device': '의료기기',
            'demolition': '철거 및 운영 필수 설비',
            'infrastructure': '운영 지원 인프라',
            'textiles': '병원용 섬유류',
            'waste': '의료폐기물',
            'admin': '행정 업무',
            'insurance': '보험',
            'pharmacy': '원내 의약품',
            'management': '관리 관련 업체',
            // 소분류 - 심화편
            'medical-device-beauty': '의료기기 미용편',
            'medical-device-pain': '의료기기 통증편',
            'medical-device-internal': '의료기기 내과편',
            'medical-device-dental': '의료기기 치과편',
            'medical-beauty': '의료기기 미용편',
            'medical-pain': '의료기기 통증편',
            'medical-internal': '의료기기 내과편',
            'medical-dental': '의료기기 치과편',
            // 기타
            'facilities': '시설',
            'construction': '공사',
            'regulations': '규정',
            'general': '일반'
        };

        // 마지막 부분 번역
        const lastPart = parts[parts.length - 1];
        return topicMap[lastPart] || lastPart;
    }

    async fetchRange(range) {
        // 보안을 위해 직접 호출(구글 서버) 대신 Vercel 프록시 서버를 거쳐서 호출합니다.
        // 이를 통해 API KEY와 시트 ID가 브라우저에 노출되지 않습니다.
        const url = `/api/sheets-proxy?range=${encodeURIComponent(range)}`;
        const response = await fetch(url);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `API Error ${response.status}`);
        }

        const data = await response.json();
        return data.values || [];
    }

    parseQAData(rows) {
        if (!rows || rows.length < 2) return [];
        rows.shift();
        return rows.map((row, idx) => ({
            source: 'qa', id: `qa-${idx}`,
            question: row[SHEETS_CONFIG.QA_COLUMNS.QUESTION] || '',
            answer: row[SHEETS_CONFIG.QA_COLUMNS.ANSWER] || '',
            metadata: { field: row[SHEETS_CONFIG.QA_COLUMNS.FIELD] || '기타', category: row[SHEETS_CONFIG.QA_COLUMNS.CATEGORY] || '일반' }
        })).filter(i => i.question);
    }

    parseFAQData(rows) {
        if (!rows || rows.length < 2) return [];
        rows.shift();
        return rows.map((row, idx) => ({
            source: 'faq', id: `faq-${idx}`,
            question: row[SHEETS_CONFIG.faq_columns.QUESTION] || '',
            answer: row[SHEETS_CONFIG.faq_columns.ANSWER] || '',
            metadata: { path: row[SHEETS_CONFIG.faq_columns.TOPIC_PATH] || '', field: (row[SHEETS_CONFIG.faq_columns.TOPIC_PATH] || '').split('>')[0] || '기타' }
        })).filter(i => i.question);
    }

    buildFAQHierarchy(faqData) {
        this.faqHierarchy = {};
        faqData.forEach(item => {
            const path = item.metadata.path;
            if (!path) return;
            const parts = path.split('>');
            const field = parts[0]?.trim() || '기타';
            const topic = parts[1]?.trim() || '일반';
            if (!this.faqHierarchy[field]) this.faqHierarchy[field] = new Set();
            this.faqHierarchy[field].add(topic);
        });
        Object.keys(this.faqHierarchy).forEach(k => this.faqHierarchy[k] = Array.from(this.faqHierarchy[k]).sort());
    }

    getFields() { return this.faqHierarchy ? Object.keys(this.faqHierarchy).sort() : []; }
    getTopics(field) { return this.faqHierarchy && this.faqHierarchy[field] ? this.faqHierarchy[field] : []; }
    getFAQList(field, topic) {
        if (!this.cache) return [];
        return this.cache.filter(item => item.source === 'faq' && item.metadata.path.includes(`${field}>${topic}`));
    }
    // [동의어 사전] - 유사한 의미의 단어들을 그룹화
    synonyms = {
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

    // [한국어 조사 제거] - "밤에" → "밤", "진료를" → "진료"
    normalizeWord(word) {
        // 주요 조사 및 어미 제거 (단어 끝에 붙은 경우만)
        // 은, 는, 이, 가, 을, 를, 에, 에서, 으로, 로, 의, 와, 과, 도, 만, ?, !, .
        return word.replace(/(은|는|이|가|을|를|에|에서|으로|로|의|와|과|도|만|\?|!|\.)$/, '').trim();
    }

    // [쿼리 확장] - 조사 제거 + 동의어 + 부분 매칭
    expandQueryWithSynonyms(query) {
        let expandedWords = [];
        const words = query.split(/\s+/);

        words.forEach(word => {
            // 원본 단어 추가
            expandedWords.push(word);

            // 조사 제거한 단어도 추가
            const cleanWord = this.normalizeWord(word);
            if (cleanWord.length >= 2) {
                expandedWords.push(cleanWord);
            }

            // 동의어 찾기 (정확히 일치하거나 포함하는 경우)
            Object.keys(this.synonyms).forEach(key => {
                // "밤에"가 "밤"을 포함하는지, 또는 클린 단어가 키와 일치하는지
                if (word.includes(key) || cleanWord === key) {
                    expandedWords = expandedWords.concat(this.synonyms[key]);
                    expandedWords.push(key); // 원래 키도 추가
                }
            });
        });

        return [...new Set(expandedWords)].filter(w => w.length >= 2);
    }

    // [RAG 검색 엔진] - 강화된 검색
    async searchRelatedContext(query, maxResults = 10) {
        if (!this.cache) await this.loadData();

        // 동의어 확장된 키워드 추출
        const expandedWords = this.expandQueryWithSynonyms(query);
        const keywords = expandedWords.filter(w => w.length >= 2);

        console.log('🔍 검색 키워드 (강화):', keywords);

        // 전수조사 후 관련도 순 정렬
        const results = this.cache.map(item => {
            const score = this.calculateSimilarity(query, keywords, item.question, item.answer, item.metadata.field);
            return { ...item, score };
        })
            .filter(r => r.score > 0.4)  // 유사도 임계값
            .sort((a, b) => b.score - a.score);

        return results.slice(0, maxResults);
    }

    calculateSimilarity(query, keywords, question, answer, field) {
        if (!question) return 0;

        const queryLower = query.toLowerCase();
        const questionLower = question.toLowerCase();
        const answerLower = (answer || '').toLowerCase();
        const target = questionLower + ' ' + answerLower;

        // 원본 쿼리 단어 (조사 제거)
        const originalWords = query.split(/\s+/).map(w => this.normalizeWord(w)).filter(w => w.length >= 2);

        let score = 0;

        // ★ 0. 업체명/제목 부분 매칭 보너스 (가장 우선 - 0.6점) ★
        // "무아" → "무아디자인", "플랜" → "플랜디자인" 등 부분 매칭 지원
        for (const word of originalWords) {
            if (word.length >= 2 && questionLower.includes(word.toLowerCase())) {
                score += 0.6;
                console.log(`      🎯 업체명 부분매칭: "${word}" in "${question}" → +0.6점`);
                break; // 한 번만 적용
            }
        }

        // 1. 원본 단어 매칭 (가장 중요 - 각 0.4점)
        let originalHits = 0;
        originalWords.forEach(word => {
            if (target.includes(word.toLowerCase())) originalHits++;
        });
        score += originalWords.length ? (originalHits / originalWords.length) * 0.5 : 0;

        // 2. 동의어 매칭 보너스 (추가 점수 - 최대 0.3점)
        let synonymHits = 0;
        keywords.forEach(kw => {
            // 원본 단어가 아닌 동의어가 매칭되면 보너스
            if (!originalWords.includes(kw) && target.includes(kw.toLowerCase())) {
                synonymHits++;
            }
        });
        score += Math.min(synonymHits * 0.1, 0.3);  // 최대 0.3점

        // 3. 필드(분야) 매칭 보너스 (20%)
        if (field && query.toLowerCase().includes(field.toLowerCase())) {
            score += 0.2;
        }

        return score;
    }

    // [Smart Search] - Query Plan 기반 지능형 검색
    async smartSearch(queryPlan, maxResults = 10, userSpecialty = null) {
        if (!this.cache) await this.loadData();

        const { coreKeywords, expandedKeywords, excludeKeywords, searchStrategy, topic, targetCategory, targetSubCategory, specialtyRelevant } = queryPlan;
        const allKeywords = [...(coreKeywords || []), ...(expandedKeywords || [])];

        // ★ AI 지능형 필터링(Context Expansion)을 위해 검색 범위 조정 ★
        // 기존 50개 → 10~30개로 하향 조정하여 속도 향상
        const finalMaxResults = maxResults || 30;

        console.log('🧠 Smart Search 시작 (Broad Mode)');
        console.log('   핵심 키워드:', coreKeywords);
        console.log('   확장 키워드:', expandedKeywords);
        console.log('   제외 키워드:', excludeKeywords);
        console.log('   검색 전략:', searchStrategy);
        console.log('   타겟 카테고리:', targetCategory);
        console.log('   타겟 세부 카테고리:', targetSubCategory);
        console.log('   👤 사용자 진료과:', userSpecialty ? userSpecialty.label : '미선택');
        console.log('   🎯 진료과 특화 질문:', specialtyRelevant ? '예 (다른 진료과 제외)' : '아니오 (공통 질문)');
        console.log('   📏 최대 결과 수:', finalMaxResults);

        // 0. 전체 검색 대상 (Q&A, FAQ, Notion 모두 포함)
        // 방어 코드: 데이터 로드 실패 시 빈 배열로 초기화하여 filter 에러 방지
        let candidates = this.cache || [];

        if (candidates.length === 0) {
            console.warn('⚠️ 검색 가능한 데이터가 없습니다 (구글 시트 로드 실패 등)');
            return [];
        }

        // 소스별 현황 로그
        const qaCount = candidates.filter(i => i.source === 'qa').length;
        const faqCount = candidates.filter(i => i.source === 'faq').length;
        const notionCount = candidates.filter(i => i.source === 'notion').length;
        console.log(`   📊 데이터 소스: Q&A ${qaCount}개, FAQ ${faqCount}개, Notion ${notionCount}개 (총 ${candidates.length}개)`);

        // 1. 제외 키워드 필터링 (질문 필드에만 적용, 너무 공격적이지 않게)
        candidates = candidates.filter(item => {
            if (!excludeKeywords || excludeKeywords.length === 0) return true;

            // 질문 필드에만 적용 (답변 전체에 적용하면 너무 많이 제외됨)
            const questionText = (item.question || '').toLowerCase();
            for (const excludeWord of excludeKeywords) {
                // 2글자 이상 & 질문에 포함된 경우만 제외
                if (excludeWord && excludeWord.length >= 2 && questionText.includes(excludeWord.toLowerCase())) {
                    return false;
                }
            }
            return true;
        });

        console.log(`   제외 필터링 후: ${candidates.length}개`);

        // 2. 검색 전략에 따른 스코어링 (모든 소스 대상)
        let results = candidates.map(item => {
            let score = this.calculateSmartScore(item, coreKeywords, expandedKeywords, topic, searchStrategy);

            // 📘 Notion 데이터: 질문 주제(topic) 및 타겟 카테고리 매칭 시 강력한 보너스
            const itemTopic = item.metadata?.topic || item.metadata?.category || '';
            const itemField = (item.metadata?.field || '').toLowerCase();
            const itemPath = item.metadata?.categoryPath || '';
            const itemSubPath = item.metadata?.structuredSubCategory || '';

            if (topic && topic !== '기타') {
                const searchTopic = topic.toLowerCase();

                // 1. 노션 데이터의 상세 토픽 매칭
                if (item.source === 'notion' && (itemTopic.includes(searchTopic) || itemPath.includes(searchTopic))) {
                    score = score + 1.2; // 보너스 수치 하향 (2.0 -> 1.2)
                }
                // 2. Q&A, FAQ의 필드 매칭
                else if ((item.source === 'qa' || item.source === 'faq') && itemField.includes(searchTopic)) {
                    score = score + 1.0; // 보너스 수치 하향 (1.5 -> 1.0)
                }
                // 3. 주제가 명확한데 다른 주제인 경우 (인테리어 질문에 간판 데이터 등) -> 페널티 대폭 완화
                else if (topic === '인테리어' && (itemTopic.includes('간판') || itemPath.includes('signage') || itemField.includes('간판'))) {
                    score = score * 0.6; // 극단적 감점 제거 (0.1 -> 0.6)
                }
                else if (topic === '간판' && (itemTopic.includes('인테리어') || itemPath.includes('interior') || itemField.includes('인테리어'))) {
                    score = score * 0.6; // 극단적 감점 제거 (0.1 -> 0.6)
                }
            }

            // ★ 세부 카테고리(targetSubCategory) 매칭 시 완만한 보너스 ★
            if (targetSubCategory && targetSubCategory !== 'all' && item.source === 'notion') {
                if (itemSubPath.includes(targetSubCategory)) {
                    score = score + 1.0; // 보너스 수치 하향 (3.0 -> 1.0)
                } else if (targetSubCategory === 'interior' && itemSubPath.includes('signage')) {
                    score = score * 0.5; // 감점 완화 (0.01 -> 0.5)
                }
            }

            // 🎯 의도(Intent) 기반 완만한 가중치 부여 (정보 요청 vs 업체 추천)
            const isHowToIntent = queryPlan.intent === '정보요청' || queryPlan.intent === '절차안내';
            const isPartnerIntent = queryPlan.intent === '파트너사목록';

            if (isHowToIntent) {
                // 방법/노하우 질문이면 지식성 데이터(advanced, basics, qa) 선호
                if (itemPath.startsWith('advanced') || itemPath.startsWith('hospital-basics') || item.source === 'qa' || item.source === 'faq') {
                    score = score + 0.8; // 보너스 하향 (2.5 -> 0.8)
                }
                if (itemPath.startsWith('partners')) {
                    score = score * 0.7; // 감점 완화 (0.3 -> 0.7)
                }
            } else if (isPartnerIntent) {
                // 업체 추천 의도면 파트너사 데이터 선호
                if (itemPath.startsWith('partners')) {
                    score = score + 1.0; // 보너스 하향 (2.0 -> 1.0)
                }
                if (itemPath.startsWith('advanced')) {
                    score = score * 0.8; // 감점 완화 (0.5 -> 0.8)
                }
            }

            // 구 모델 호환성 유지: 타겟 카테고리 매칭 보너스
            if (targetCategory && targetCategory !== 'all' && item.source === 'notion') {
                if (itemPath.startsWith(targetCategory)) {
                    score = score * 1.5;
                }
            }

            // ★ 사용자 진료과 기반 보너스 점수 ★
            if (userSpecialty && userSpecialty.keywords) {
                const specialtyBonus = this.calculateSpecialtyBonus(item, userSpecialty);
                if (specialtyBonus > 0) {
                    score = score + specialtyBonus;
                }
            }

            return { ...item, score };
        })
            .filter(r => r.score > 0.05)  // ★ Broad Search: 임계값 0.25 -> 0.05 대폭 완화
            .sort((a, b) => b.score - a.score);

        // ★ 진료과 필터링: specialtyRelevant에 따라 전략 분기 ★
        if (userSpecialty && userSpecialty.code) {
            const userSpecCode = userSpecialty.code.toLowerCase();

            // 1. 사용자 진료과 태그가 있는 문서
            const matchingDocs = results.filter(item => {
                const specs = item.metadata?.specialties || [];
                return specs.some(s => s.toLowerCase() === userSpecCode);
            });

            // 2. 태그가 없는 문서 (일반 정보)
            const noTagDocs = results.filter(item => {
                const specs = item.metadata?.specialties || [];
                return specs.length === 0;
            });

            // 3. 다른 진료과 태그만 있는 문서 (사용자 진료과 아님)
            const otherSpecDocs = results.filter(item => {
                const specs = item.metadata?.specialties || [];
                return specs.length > 0 && !specs.some(s => s.toLowerCase() === userSpecCode);
            });

            if (specialtyRelevant) {
                // ★ 진료과 특화 질문: 다른 진료과 문서도 포함하되 우선순위 낮춤 ★
                // (파트너사 이름 직접 언급 시에도 정보 제공 가능하게)
                results = [...matchingDocs, ...noTagDocs, ...otherSpecDocs];
                console.log(`   🎯 진료과 특화 모드 적용 (다른 진료과도 포함)`);
                console.log(`   ✅ 사용자 진료과 문서: ${matchingDocs.length}개 (우선)`);
                console.log(`   📄 태그없는 문서: ${noTagDocs.length}개`);
                console.log(`   📄 다른 진료과 문서: ${otherSpecDocs.length}개 (후순위)`);
            } else {
                // ★ 공통 질문: 우선순위만 부여 (제외 안함) ★
                results = [...matchingDocs, ...noTagDocs, ...otherSpecDocs];
                console.log(`   📋 공통 질문 모드 (우선순위만 적용)`);
                console.log(`   ✅ 사용자 진료과 문서: ${matchingDocs.length}개 (우선)`);
                console.log(`   📄 태그없는 문서: ${noTagDocs.length}개`);
                console.log(`   📄 다른 진료과 문서: ${otherSpecDocs.length}개`);
            }
        }

        // 결과 소스별 현황
        const resultQa = results.filter(i => i.source === 'qa').length;
        const resultFaq = results.filter(i => i.source === 'faq').length;
        const resultNotion = results.filter(i => i.source === 'notion').length;
        console.log(`   📚 결과 소스: Q&A ${resultQa}개, FAQ ${resultFaq}개, Notion ${resultNotion}개`);
        console.log(`   최종 결과: ${Math.min(results.length, finalMaxResults)}개`);

        return results.slice(0, finalMaxResults);
    }

    // [진료과 보너스 점수 계산]
    calculateSpecialtyBonus(item, userSpecialty) {
        if (!userSpecialty || !userSpecialty.keywords) return 0;

        const question = (item.question || '').toLowerCase();
        const answer = (item.answer || '').toLowerCase();
        const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
        const features = (item.metadata?.features || []).join(' ').toLowerCase();

        // 모든 텍스트 합치기
        const text = question + ' ' + answer + ' ' + specialties + ' ' + features;
        const textNoSpace = text.replace(/\s/g, '');

        let bonus = 0;
        let matchCount = 0;

        for (const keyword of userSpecialty.keywords) {
            const kw = keyword.toLowerCase();
            const kwNoSpace = kw.replace(/\s/g, '');

            // 일반 매칭 또는 띄어쓰기 무시 매칭
            if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) {
                matchCount++;
            }
        }

        // ★ Phase 1: 보너스 점수 대폭 상향 ★
        // specialties 필드에 사용자 진료과가 직접 매칭되면 압도적 보너스
        if (specialties && specialties.includes(userSpecialty.code.toLowerCase())) {
            bonus += 2.0;  // 기존 0.4 → 2.0으로 상향
        } else if (matchCount > 0) {
            // 키워드 매칭 횟수에 따른 보너스 (최대 0.8)
            bonus += Math.min(matchCount * 0.2, 0.8);  // 기존 0.3 → 0.8로 상향
        }

        return bonus;
    }

    // Smart Score 계산 - Plan 기반
    calculateSmartScore(item, coreKeywords, expandedKeywords, topic, strategy) {
        const question = (item.question || '').toLowerCase();
        const answer = (item.answer || '').toLowerCase();
        const field = (item.metadata?.field || '').toLowerCase();

        // 새로 추가: specialties와 features도 검색 대상에 포함
        const specialties = (item.metadata?.specialties || []).join(' ').toLowerCase();
        const features = (item.metadata?.features || []).join(' ').toLowerCase();
        const website = (item.metadata?.website || '').toLowerCase();

        // 전체 검색 대상 텍스트 (띄어쓰기 제거 버전도 준비)
        const text = question + ' ' + answer + ' ' + field + ' ' + specialties + ' ' + features;
        const textNoSpace = text.replace(/\s/g, ''); // 띄어쓰기 제거 버전

        let score = 0;

        // 진료과/특화 관련 질문인지 감지
        const isSpecialtyQuestion = coreKeywords?.some(kw =>
            kw && (kw.includes('진료과') || kw.includes('특화') || kw.includes('전문'))
        ) || expandedKeywords?.some(kw =>
            kw && (kw.includes('진료과') || kw.includes('특화') || kw.includes('전문'))
        );

        // 1. 핵심 키워드 매칭 (가장 중요 - 최대 0.6점)
        if (coreKeywords && coreKeywords.length > 0) {
            let coreHits = 0;
            for (const keyword of coreKeywords) {
                if (!keyword) continue;
                const kw = keyword.toLowerCase();
                const kwNoSpace = kw.replace(/\s/g, '');

                // 일반 매칭 또는 띄어쓰기 무시 매칭
                if (text.includes(kw) || textNoSpace.includes(kwNoSpace)) {
                    coreHits++;
                    // 질문/제목에 있으면 추가 보너스
                    if (question.includes(kw) || question.replace(/\s/g, '').includes(kwNoSpace)) {
                        coreHits += 0.5;
                    }
                }
            }
            score += Math.min((coreHits / coreKeywords.length) * 0.6, 0.6);
        }

        // 2. 확장 키워드 매칭 (보조 - 최대 0.25점)
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

        // 3. 토픽 매칭 기초 보너스 (중복 검색 방지 위해 소폭 유지)
        if (topic && topic !== '기타') {
            const searchTopic = topic.toLowerCase();
            if (field.includes(searchTopic) || question.includes(searchTopic)) {
                score += 0.1;
            }
        }

        // 4. 진료과/특화 질문일 때 specialties 매칭 보너스 (최대 0.35점)
        if (isSpecialtyQuestion && specialties) {
            // specialties 필드에 데이터가 있으면 관련성 높음
            score += 0.2;

            // 핵심 키워드가 specialties에 직접 매칭되면 추가 보너스
            for (const keyword of (coreKeywords || [])) {
                if (keyword && specialties.includes(keyword.toLowerCase())) {
                    score += 0.15;
                    break;
                }
            }
        }

        // 5. 검색 전략별 조정
        if (strategy === 'exact') {
            // exact 전략: 핵심 키워드 미매칭시 점수 대폭 감소
            if (coreKeywords && coreKeywords.length > 0) {
                let hasCoreMatch = coreKeywords.some(kw => {
                    if (!kw) return false;
                    const kwLower = kw.toLowerCase();
                    const kwNoSpace = kwLower.replace(/\s/g, '');
                    return text.includes(kwLower) || textNoSpace.includes(kwNoSpace);
                });
                if (!hasCoreMatch) {
                    score *= 0.3;
                }
            }
        }

        // 6. 파트너사 검색 패턴 보너스 (의도가 파트너사 목록일 때)
        const isPartnerSearch = coreKeywords?.some(kw => kw && (kw.includes('파트너') || kw.includes('업체')));
        if (isPartnerSearch) {
            // "회사 소개", "예상 가격", "포트폴리오" 등 파트너사 상세 페이지 패턴
            if (answer.includes('회사 소개') || answer.includes('예상 가격') || answer.includes('포트폴리오')) {
                score += 0.3; // 파트너사 상세 페이지 보너스
            }
            // 업체명 페이지 (의료폐기물, 청소, 가구 등 실제 업체)
            if (answer.includes('년차') || answer.includes('설립') || answer.includes('진행 가능')) {
                score += 0.2;
            }
        }

        // 7. features(특징) 보너스 - 특징이 있는 파트너사는 정보가 풍부함
        if (features && features.length > 0) {
            score += 0.05;
        }

        return score;
    }
}
