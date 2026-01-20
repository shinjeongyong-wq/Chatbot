// sheets-loader.js
// Hybrid Loader: LocalStorage(우선) > 로컬파일 > Google API(최초 1회)

// API 설정 (최초 1회 다운로드용)
const SHEETS_CONFIG = {
    SPREADSHEET_ID: '1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4',
    API_KEY: 'AIzaSyACzOZzF6Wb2ZUYGEf_7GDa96dJKJSZdP4',
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
        // 1. 브라우저 내부 사본(LocalStorage) 확인 - 네트워크 통신 0
        const savedData = localStorage.getItem('CRYSTAL_HORIZON_DB_V1');
        if (savedData) {
            console.log('📦 로컬 사본(LocalStorage)에서 데이터를 불러옵니다. (통신 X)');
            this.cache = JSON.parse(savedData);
            this.initData();
            return this.cache;
        }

        // 2. 로컬 파일(qaData.js) 확인 - 100개 이상일 때만 사용 (샘플 데이터 무시)
        if (typeof QA_DATA !== 'undefined' && QA_DATA.length > 100) {
            console.log('📂 로컬 파일(qaData.js)에서 데이터를 불러옵니다.');
            this.cache = QA_DATA;
            localStorage.setItem('CRYSTAL_HORIZON_DB_V1', JSON.stringify(this.cache));
            this.initData();
            return this.cache;
        }

        // 3. 없으면 API로 최초 1회 다운로드 (사본 생성 과정)
        console.log('🌐 사본이 없습니다. Google Sheets에서 전체 데이터를 내려받아 사본을 생성합니다...');
        try {
            await this.fetchAndSaveAllData();
            console.log('✅ 사본 생성 완료! 이제부터는 통신 없이 이 사본을 사용합니다.');
            return this.cache;
        } catch (e) {
            console.error('데이터 다운로드 실패:', e);
            return [];
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

        // 📘 Notion 데이터 로드
        let notionData = [];

        // 우선: notionData.js 직접 사용 (안정적)
        if (typeof NOTION_DATA !== 'undefined' && Array.isArray(NOTION_DATA) && NOTION_DATA.length > 0) {
            console.log(`📘 notionData.js에서 로드: ${NOTION_DATA.length}개 항목`);
            notionData = NOTION_DATA;
        } else {
            // 폴백: 폴더 구조에서 로드 시도
            try {
                notionData = await this.loadNotionData();
                console.log(`📘 폴더 구조에서 로드: ${notionData.length}개 항목`);
            } catch (e) {
                console.error('❌ Notion 데이터 로드 실패:', e.message);
            }
        }

        this.cache = [...parsedQA, ...parsedFAQ, ...notionData];

        // **핵심**: 내려받은 데이터를 로컬 사본으로 영구 저장
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

                // 각 항목을 검색용 포맷으로 변환
                for (const item of data.items || []) {
                    notionItems.push({
                        id: `notion-${item.id.replace(/-/g, '').slice(0, 12)}`,
                        source: 'notion',
                        question: item.title,
                        answer: item.content,
                        metadata: {
                            field: this.getCategoryField(categoryPath),
                            topic: this.getCategoryTopic(categoryPath),
                            category: categoryPath,
                            icon: item.icon,
                            notionUrl: item.notionUrl,
                            lastUpdated: item.lastUpdated
                        }
                    });
                }
            } catch (e) {
                console.warn(`  ⚠️ ${categoryPath} 로드 실패`);
            }
        }

        return notionItems;
    }

    // 카테고리 경로에서 필드(대분류) 추출
    getCategoryField(categoryPath) {
        const parts = categoryPath.split('/');
        const fieldMap = {
            'partners': '파트너사',
            'process': '개원 프로세스',
            'advanced': '심화 콘텐츠',
            'checklists': '체크리스트',
            'db-records': '파트너사 상세',
            'uncategorized': '기타'
        };
        return fieldMap[parts[0]] || parts[0];
    }

    // 카테고리 경로에서 토픽(소분류) 추출
    getCategoryTopic(categoryPath) {
        const parts = categoryPath.split('/');
        const topicMap = {
            'pre-construction': '착공 이전',
            'during-construction': '시공 중',
            'post-registration': '개설신고 이후',
            'interior': '인테리어',
            'signage': '간판',
            'furniture': '가구',
            'bank': '은행',
            'website': '홈페이지',
            'it': 'IT/네트워크',
            'tax': '세무',
            'loan': '대출',
            'medical-device': '의료기기',
            'marketing': '마케팅',
            'admin': '행정',
            'insurance': '보험',
            'emr-crm': 'EMR/CRM'
        };

        // 마지막 부분 번역
        const lastPart = parts[parts.length - 1];
        return topicMap[lastPart] || lastPart;
    }

    async fetchRange(range) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SPREADSHEET_ID}/values/${range}?key=${SHEETS_CONFIG.API_KEY}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`API Error ${response.status}`);
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
        // 주요 조사 및 어미 제거
        return word.replace(/[은는이가을를에에서으로로의와과도만?!\.]/g, '').trim();
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

        const questionLower = question.toLowerCase();
        const answerLower = (answer || '').toLowerCase();
        const target = questionLower + ' ' + answerLower;

        // 원본 쿼리 단어 (조사 제거)
        const originalWords = query.split(/\s+/).map(w => this.normalizeWord(w)).filter(w => w.length >= 2);

        let score = 0;

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
    async smartSearch(queryPlan, maxResults = 10) {
        if (!this.cache) await this.loadData();

        const { coreKeywords, expandedKeywords, excludeKeywords, searchStrategy, topic, targetCategory } = queryPlan;
        const allKeywords = [...(coreKeywords || []), ...(expandedKeywords || [])];

        console.log('🧠 Smart Search 시작');
        console.log('   핵심 키워드:', coreKeywords);
        console.log('   확장 키워드:', expandedKeywords);
        console.log('   제외 키워드:', excludeKeywords);
        console.log('   검색 전략:', searchStrategy);
        console.log('   타겟 카테고리:', targetCategory);

        // 0. 카테고리 필터링 (임시 비활성화 - 폴더 구조 미완성으로 Notion 데이터 제외됨)
        // TODO: 폴더 구조 완성 시 활성화
        let candidates = this.cache;
        /*
        if (targetCategory && targetCategory !== 'all') {
            const beforeCount = candidates.length;
            candidates = candidates.filter(item => {
                // Notion 데이터가 아니면 통과 (Google Sheets 데이터는 유지)
                if (item.source !== 'notion') return true;

                // Notion 데이터는 카테고리 매칭
                const itemCategory = item.metadata?.category || '';
                return itemCategory.startsWith(targetCategory);
            });
            console.log(`   ✅ 카테고리 필터링: ${candidates.length}개 (${beforeCount}개 중 ${targetCategory} 대상)`);
        }
        */

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

        console.log(`   제외 필터링 후: ${candidates.length}개 (원본 ${this.cache.length}개)`);

        // 2. 검색 전략에 따른 스코어링
        const results = candidates.map(item => {
            const score = this.calculateSmartScore(item, coreKeywords, expandedKeywords, topic, searchStrategy);

            // 타겟 카테고리 매칭 시 보너스 점수
            if (targetCategory && item.source === 'notion' && item.metadata?.category?.startsWith(targetCategory)) {
                return { ...item, score: score * 1.5 }; // 50% 보너스
            }

            return { ...item, score };
        })
            .filter(r => r.score > 0.15)  // 임계값 낮춤 - 더 많은 관련 문서 포함
            .sort((a, b) => b.score - a.score);

        console.log(`   최종 결과: ${Math.min(results.length, maxResults)}개`);

        return results.slice(0, maxResults);
    }

    // Smart Score 계산 - Plan 기반
    calculateSmartScore(item, coreKeywords, expandedKeywords, topic, strategy) {
        const question = (item.question || '').toLowerCase();
        const answer = (item.answer || '').toLowerCase();
        const field = (item.metadata?.field || '').toLowerCase();
        const text = question + ' ' + answer + ' ' + field;

        let score = 0;

        // 1. 핵심 키워드 매칭 (가장 중요 - 최대 0.6점)
        if (coreKeywords && coreKeywords.length > 0) {
            let coreHits = 0;
            for (const keyword of coreKeywords) {
                if (keyword && text.includes(keyword.toLowerCase())) {
                    coreHits++;
                    // 질문/제목에 있으면 추가 보너스
                    if (question.includes(keyword.toLowerCase())) {
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
                if (keyword && text.includes(keyword.toLowerCase())) {
                    expandHits++;
                }
            }
            score += Math.min((expandHits / expandedKeywords.length) * 0.25, 0.25);
        }

        // 3. 토픽 매칭 보너스 (최대 0.15점)
        if (topic && topic !== '기타') {
            if (field.includes(topic.toLowerCase()) || question.includes(topic.toLowerCase())) {
                score += 0.15;
            }
        }

        // 4. 검색 전략별 조정
        if (strategy === 'exact') {
            // exact 전략: 핵심 키워드 미매칭시 점수 대폭 감소
            if (coreKeywords && coreKeywords.length > 0) {
                let hasCorMatch = coreKeywords.some(kw => kw && text.includes(kw.toLowerCase()));
                if (!hasCorMatch) {
                    score *= 0.3;
                }
            }
        }

        return score;
    }
}
