// Vercel Serverless Function - Google Gemini API Proxy
// API 키가 환경변수에 저장되어 노출되지 않음

export default async function handler(req, res) {
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

    const { userQuery, systemPrompt, mode } = req.body;

    // ★ 캐시 모드 - Query Plan 기반 캐시 조회/저장 ★
    if (mode === 'cache-check') {
        return await handleCacheCheck(req, res);
    }
    if (mode === 'cache-save') {
        return await handleCacheSave(req, res);
    }

    if (!userQuery) {
        return res.status(400).json({ error: 'userQuery is required' });
    }

    // Query Planner 모드 - Gemini Flash로 쿼리 분석
    if (mode === 'plan') {
        return await handleQueryPlanning(req, res, userQuery);
    }

    // Context Summary 모드 - Gemini Flash로 대화 요약 (봇 3)
    if (mode === 'summary') {
        const { contextHistory } = req.body;
        return await handleContextSummary(req, res, contextHistory);
    }

    // 일반 답변 모드
    return await handleAnswerGeneration(req, res, userQuery, systemPrompt);
}

// Gemini API 호출 함수 (finishReason 체크 + 자동 재시도)
async function callGeminiAPI(prompt, systemPrompt = '', model = 'gemini-1.5-flash', maxRetries = 2) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error('GEMINI_API_KEY is not set');
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Gemini API 요청 형식
    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }]
            }
        ],
        generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
        }
    };

    let lastError = null;

    // 재시도 로직 (최대 maxRetries 번)
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'No error body');
                throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();

            // finishReason 확인
            const finishReason = data.candidates?.[0]?.finishReason;
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (!text) {
                throw new Error('No content in Gemini response');
            }

            // 정상 완료(STOP)가 아닌 경우 재시도
            if (finishReason !== 'STOP') {
                console.log(`⚠️ [Attempt ${attempt}] 비정상 종료 (finishReason: ${finishReason})`);

                if (attempt <= maxRetries) {
                    console.log(`🔄 재시도 중... (${attempt}/${maxRetries})`);
                    // 잠시 대기 후 재시도 (exponential backoff)
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                    continue;
                } else {
                    // 최대 재시도 횟수 초과 - 그래도 있는 텍스트 반환
                    console.log(`⚠️ 최대 재시도 횟수 초과, 현재 응답 반환 (finishReason: ${finishReason})`);
                    return text;
                }
            }

            // 정상 완료
            if (attempt > 1) {
                console.log(`✅ [Attempt ${attempt}] 재시도 성공 (finishReason: STOP)`);
            }
            return text;

        } catch (error) {
            lastError = error;
            console.error(`❌ [Attempt ${attempt}] API 호출 실패:`, error.message);

            if (attempt <= maxRetries) {
                console.log(`🔄 재시도 중... (${attempt}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, 500 * attempt));
                continue;
            }
        }
    }

    throw lastError || new Error('All API attempts failed');
}

// Query Planner - Gemini Flash로 쿼리 의도 분석
async function handleQueryPlanning(req, res, userQuery) {
    const { userSpecialty, recentContext } = req.body;

    // 사용자 진료과 정보 추가
    let userSpecialtyContext = '';
    if (userSpecialty && userSpecialty.label) {
        userSpecialtyContext = `

# 📌 중요: 사용자 진료과
사용자는 **${userSpecialty.label}** 개원을 준비 중입니다.

**검색 키워드 생성 시 반드시 다음 규칙을 따르세요:**
1. 질문에 진료과 특정 언급이 없어도, **${userSpecialty.label} 관련 키워드를 coreKeywords나 expandedKeywords에 추가**하세요.
2. 예: "의료기기 추천해줘" → coreKeywords에 "의료기기", "레이저", "피부" 등 ${userSpecialty.label} 관련 장비 포함
3. 예: "개원 비용 얼마야?" → expandedKeywords에 "${userSpecialty.label}", "개원비용" 추가
`;
    }

    // ★ 최근 대화 맥락 (후속 질문 해석용) ★
    let conversationContext = '';
    if (recentContext && recentContext.trim()) {
        const alreadyMentioned = req.body.alreadyMentioned || [];
        const mentionedText = alreadyMentioned.length > 0 ? `\n\n# ⛔ 이미 언급된 항목 (중복 금지)\n${alreadyMentioned.join(', ')}` : '';

        conversationContext = `

# 🔄 최근 대화 맥락 (매우 중요!)
아래는 최근 대화 내용입니다. "더 없어?", "그거 말고", "또 뭐 있어?" 같은 후속 질문이 오면, 이 맥락을 적극 참고하세요.${mentionedText}

${recentContext}

**[후속 질문 대응 규칙]**
1. 사용자가 "더", "또", "추가로", "다른" 같은 추가 정보를 요청하면, 이전 대화의 **intent, topic, targetCategory를 그대로 유지**하세요.
2. **중복 방지 (Exclusion)**: 이전 답변에서 이미 언급된 업체명이나 구체적인 항목이 있다면, 이를 **excludeKeywords** 리스트에 포함시키세요.
3. **새로운 정보 유도**: expandedKeywords에 "추가적인", "다른", "나머지" 등을 추가하여 검색 결과가 확장되도록 하세요.
`;
    }

    const plannerPrompt = `당신은 병원 개원 상담 챗봇의 Query Planner입니다.
사용자 질문을 분석하여 **1차로 의도(intent)를 분류**하고, 필요시 검색 전략을 JSON으로 출력하세요.
${userSpecialtyContext}${conversationContext}

# ⚠️ 최우선 규칙: 의도(Intent) 6분류 (MECE)
**모든 질문은 반드시 아래 6개 중 하나로 분류하세요. 겹치거나 누락 없이!**

## 1️⃣ GREETING (인사/소개)
- 인사, 감사, 챗봇 정체성 확인
- 예: "안녕", "고마워", "넌 누구야?", "뭐 할 줄 알아?"
- **requiresSearch: false** → directAnswer 작성 필수

## 2️⃣ ABUSE (부적절)
- 욕설, 비하, 성희롱, 정치/종교 민감 발언
- 예: 욕설, "바보야?"
- **requiresSearch: false** → directAnswer로 정중한 거절

## 3️⃣ OFF_TOPIC (무관한 잡담)
- 개원과 **완전히 무관한** 일상 질문
- 예: "저녁 뭐 먹지?", "오늘 날씨 어때?", "주식 추천해줘"
- **requiresSearch: false** → directAnswer로 상담 범위 안내

## 4️⃣ OUT_OF_SCOPE (전문가 영역)
- 개원과 **관련은 있으나** 우리 데이터/역량 밖 (세무 절세, 노무/인사, 의료소송, 보험청구 심사 등)
- 예: "절세 방법", "근로계약서 양식", "의료소송 대응"
- **requiresSearch: true** → 관련 데이터 검색 후 답변 생성 (데이터 없으면 플래너 연결 안내)

## 5️⃣ AMBIGUOUS (모호한 질문)
- 개원 관련 키워드이나 **의도가 불분명**한 짧은 입력 (1~2단어)
- 예: "인테리어", "통증의학과", "장비", "개원"
- **requiresSearch: false** → directAnswer로 역질문(Clarification) 제공

## 6️⃣ SPECIFIC (명확한 전문 상담)
- 개원 관련 + 구체적인 조건/의도가 담긴 질문
- 예: "송도 내과 입지 알려줘", "C-arm 리스 업체 추천", "30평 인테리어 비용"
- **requiresSearch: true** → 검색 전략 작성 필수

---

# 검색이 필요한 경우(SPECIFIC)만 아래 정보 참고

[데이터 소스 - 3가지]
1. **Google Sheets Q&A** - 병원 개원 관련 일반 질문/답변
2. **Google Sheets FAQ** - 자주 묻는 질문
3. **Notion 데이터** - 파트너사, 프로세스, 체크리스트 등 상세 정보

[Notion 폴더 구조]
1. **partners/** - 파트너사 명단
2. **hospital-basics/** - 개원 시 필요 영역 [기본편]
3. **advanced/** - 심화 콘텐츠 (의료기기 미용/통증/내과/치과)
4. **checklist/** - 체크리스트/점검표

[SPECIFIC의 세부 intent]
- 파트너사목록: 업체 리스트 요청
- 절차안내: 프로세스/순서 안내
- 비용: 가격/견적 관련
- 체크리스트: 점검표 요청
- 정보요청: 일반 정보/노하우

---

# 반환할 JSON 형식

## 검색 불필요 시 (GREETING, ABUSE, OFF_TOPIC, OUT_OF_SCOPE, AMBIGUOUS):
{
  "intent": "GREETING|ABUSE|OFF_TOPIC|OUT_OF_SCOPE|AMBIGUOUS",
  "requiresSearch": false,
  "directAnswer": "사용자에게 바로 보여줄 답변 텍스트"
}

## 검색 필요 시 (SPECIFIC):
{
  "intent": "SPECIFIC",
  "requiresSearch": true,
  "subIntent": ["질문에 해당하는 의도들 - 파트너사목록/절차안내/비용/체크리스트/정보요청/고객사례 중 해당되는 것 모두"],
  "topic": ["질문에 해당하는 주제들 - 인테리어/간판/의료기기/마케팅/홈페이지/PC&네트워크/가구/세무·대출/노무/EMR·CRM/의료폐기물/체크리스트/고객사례/개원로드맵/파트너사정보/기타 중 해당되는 것 모두"],
  "targetCategory": ["검색할 데이터 영역들 - qa/partners/hospital-basics/advanced/checklist/portfolio/hospital-opening-roadmap 중 해당되는 것 모두"],
  "targetSubCategory": ["검색할 세부 영역들 - 해당되는 것 모두 선택"],
  "specialtyRelevant": true/false,
  "coreKeywords": ["핵심 키워드들"],
  "expandedKeywords": ["관련 확장 키워드들"],
  "excludeKeywords": ["이전 대화에서 언급되어 제외할 키워드들"],
  "searchStrategy": "semantic|broad|exact"
}

**중요: 복합 질문의 경우 subIntent, topic, targetCategory, targetSubCategory는 반드시 배열로 여러 값을 포함하세요.**

[targetSubCategory 옵션 목록]
- qa (Q&A 데이터)
- pre-construction/interior, pre-construction/signage, pre-construction/homepage, pre-construction/bank, pre-construction/pc-network, pre-construction/medical-device, pre-construction/marketing, pre-construction/tax-loan, pre-construction/demolition
- during-construction/furniture, during-construction/infrastructure, during-construction/textiles, during-construction/waste
- post-construction/furniture, post-construction/emr-crm, post-construction/marketing
- post-opening/admin, post-opening/emr-crm, post-opening/management, post-opening/pharmacy
- checklist/general, checklist/facilities, checklist/regulations
- portfolio/customers
- advanced/interior, advanced/signage, advanced/medical-device-beauty, advanced/medical-device-dental, advanced/medical-device-internal, advanced/medical-device-pain
- roadmap

---

# directAnswer 작성 가이드

## GREETING 예시:
"안녕하세요! 저는 병원 개원을 도와드리는 AI 컨설턴트입니다. 😊 인테리어, 의료기기, 파트너사 추천 등 개원 과정의 궁금한 점을 물어봐 주세요!"

## ABUSE 예시:
"죄송합니다. 부적절한 표현에는 답변드리기 어렵습니다. 개원 관련 질문이 있으시면 도움을 드리겠습니다."

## OFF_TOPIC 예시:
"저는 병원 개원 전문 상담 챗봇이라 해당 질문에는 답변드리기 어렵습니다. 인테리어, 의료기기, 파트너사 추천 등에 대해 궁금하신 점이 있으시면 말씀해 주세요!"

## OUT_OF_SCOPE 예시:
"세무/절세 관련 상담은 전문 영역이라 저보다 담당 플래너에게 문의하시는 것이 정확합니다. 플래너 연결을 원하시면 말씀해 주세요! 그 외 개원 관련 질문은 제가 도움드릴 수 있습니다."

## AMBIGUOUS 예시 ("인테리어"만 입력 시):
"인테리어에 대해 궁금하시군요! 어떤 정보가 필요하신가요?\\n1️⃣ 인테리어 업체 추천\\n2️⃣ 평당 비용/견적\\n3️⃣ 진료과별 레이아웃 팁\\n번호나 자세한 질문을 입력해 주세요!"

---

반드시 JSON만 출력하세요.`;

    try {
        const models = [
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },  // 속도 최적화: 2.5 Flash 우선
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }
        ];

        let content = null;
        let usedModelName = 'fallback';

        for (const model of models) {
            try {
                console.log(`[Planner] Trying: ${model.name}`);
                content = await callGeminiAPI(userQuery, plannerPrompt, model.id);
                usedModelName = model.name;
                if (content) break;
            } catch (e) {
                console.error(`[Planner] ${model.name} failed:`, e.message);
                continue;
            }
        }

        try {
            if (!content) throw new Error('All planner models failed');

            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const plan = JSON.parse(jsonMatch[0]);
                return res.json({ success: true, plan, modelName: usedModelName });
            }
        } catch (e) {
            console.error('Planner processing error:', e.message);
        }

        // 파싱 실패시 기본 플랜 반환 (SPECIFIC으로 검색 진행)
        return res.json({
            success: true,
            plan: {
                intent: "SPECIFIC",
                requiresSearch: true,
                subIntent: "정보요청",
                topic: "기타",
                coreKeywords: userQuery.split(/\s+/).filter(w => w.length >= 2),
                expandedKeywords: [],
                excludeKeywords: [],
                searchStrategy: "broad"
            },
            modelName: `${usedModelName} (fallback)`
        });
    } catch (error) {
        console.error('Query Planner error:', error.message);

        // 실패시 기본 플랜 (SPECIFIC으로 검색 진행)
        return res.json({
            success: true,
            plan: {
                intent: "SPECIFIC",
                requiresSearch: true,
                subIntent: "정보요청",
                topic: "기타",
                coreKeywords: userQuery.split(/\s+/).filter(w => w.length >= 2),
                expandedKeywords: [],
                excludeKeywords: [],
                searchStrategy: "broad"
            },
            modelName: 'fallback'
        });
    }
}

// Context Summary - 대화 요약 (봇 3)
async function handleContextSummary(req, res, contextHistory) {
    if (!contextHistory) return res.status(400).json({ error: 'Context history is required' });

    console.log('[Summary] Generating summary for', contextHistory.length, 'turns');

    const systemPrompt = `
당신은 '개원 상담 챗봇'의 기억 관리자(Context Manager)입니다.
아래 제공되는 오래된 대화 기록(질문-답변 쌍)을 분석하여 핵심 내용을 요약하세요.

**요약 규칙:**
1. 사용자의 질문 주제(진료과, 찾고 있는 항목 등)를 명확히 기록하세요.
2. 챗봇이 추천했던 업체명, 제품명, 가격 정보 등 **핵심 디테일**은 반드시 유지하세요.
3. 전체 내용을 3~5문장 내외의 요약 노트(Summary Note) 형식으로 작성하세요.
4. 이 요약문은 향후 챗봇이 이전 대화를 기억하는 데 사용됩니다.
    `.trim();

    // 대화 내역 포맷팅
    const formattedDialogue = contextHistory.map(turn => `Q: ${turn.question}\nA: ${turn.answer}`).join('\n\n');

    console.log('📝 [Summary Agent] 요약할 대화 대상:', formattedDialogue.substring(0, 100) + '...');

    const models = [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }
    ];

    for (const model of models) {
        try {
            console.log(`[Summary Agent] Trying: ${model.name} (${model.id})`);
            const summary = await callGeminiAPI(formattedDialogue, systemPrompt, model.id);
            console.log('✅ [Summary Agent] 요약 완료:', summary.substring(0, 50) + '...');
            return res.status(200).json({ summary });
        } catch (error) {
            console.error(`[Summary Agent] ${model.name} failed:`, error.message);
            continue;
        }
    }

    return res.status(500).json({ error: 'All summary models failed' });
}

// 답변 생성 - Gemini API 사용
async function handleAnswerGeneration(req, res, userQuery, systemPrompt) {
    const models = [
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' }
    ];

    let lastError = null;

    for (const model of models) {
        try {
            console.log(`Trying model: ${model.name} (${model.id})`);

            // ★ 지능형 필터링 지침 주입 ★
            const finalSystemPrompt = `
${systemPrompt}

---
**[AI 답변 생성 핵심 지침]**
1. 위 **[검색된 정보]** 섹션에는 사용자 질문과 **관련 없는 데이터(Noise)**가 다수 포함되어 있습니다. (검색 범위를 넓혔기 때문)
2. **반드시 사용자 질문과 "의미적으로 일치하는" 정보만 선별**하여 답변에 사용하세요.
3. 키워드만 겹치고 내용은 다른 정보(예: '인테리어' 질문에 '간판' 정보)는 철저히 무시하세요.
4. 정보 퀄리티가 낮거나 불확실하면 사용하지 마세요.
            `.trim();

            const content = await callGeminiAPI(userQuery, finalSystemPrompt, model.id);

            return res.json({
                success: true,
                text: content,
                modelName: model.name
            });
        } catch (error) {
            console.error(`Error with model ${model.name}:`, error.message);
            lastError = error.message;
            continue;
        }
    }

    return res.status(500).json({
        success: false,
        error: 'All models failed',
        debug: {
            apiKeyExists: !!process.env.GEMINI_API_KEY,
            lastErrorMessage: lastError
        }
    });
}

// ========== 캐시 관련 함수 ==========

/**
 * 캐시 키 생성 (Query Plan 기반) - 간단한 해시
 */
function generateCacheKey(queryPlan, specialty, hasContext) {
    const topicSorted = [...(queryPlan.topic || [])].sort();
    const subIntentSorted = [...(queryPlan.subIntent || [])].sort();

    const keyData = JSON.stringify({
        topic: topicSorted,
        subIntent: subIntentSorted,
        specialty: specialty?.code || 'none',
        hasContext: !!hasContext
    });

    // 간단한 해시 함수 (crypto 없이)
    let hash = 0;
    for (let i = 0; i < keyData.length; i++) {
        const char = keyData.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(16, '0').substring(0, 16);
}

/**
 * Supabase REST API 호출 헬퍼
 */
async function supabaseQuery(table, method, options = {}) {
    const url = new URL(`${process.env.SUPABASE_URL}/rest/v1/${table}`);

    if (options.select) {
        url.searchParams.set('select', options.select);
    }
    if (options.eq) {
        for (const [key, value] of Object.entries(options.eq)) {
            url.searchParams.set(key, `eq.${value}`);
        }
    }

    const headers = {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : ''
    };

    const fetchOptions = { method, headers };
    if (options.body) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url.toString(), fetchOptions);
    return response.json();
}

/**
 * 캐시 조회 핸들러
 */
async function handleCacheCheck(req, res) {
    const { queryPlan, specialty, hasContext } = req.body;

    if (!queryPlan) {
        return res.status(400).json({ error: 'queryPlan is required' });
    }

    try {
        const cacheKey = generateCacheKey(queryPlan, specialty, hasContext);

        const url = `${process.env.SUPABASE_URL}/rest/v1/query_cache?cache_key=eq.${cacheKey}&select=answer,original_question,hit_count`;
        const response = await fetch(url, {
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
            }
        });

        const data = await response.json();

        if (!data || data.length === 0) {
            console.log(`[Cache] MISS: ${cacheKey}`);
            return res.json({ hit: false, cacheKey });
        }

        const cached = data[0];

        // 히트 카운트 증가 (비동기, 응답 기다리지 않음)
        fetch(`${process.env.SUPABASE_URL}/rest/v1/query_cache?cache_key=eq.${cacheKey}`, {
            method: 'PATCH',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ hit_count: cached.hit_count + 1 })
        }).catch(() => { });

        console.log(`[Cache] HIT: ${cacheKey}`);
        return res.json({
            hit: true,
            cacheKey,
            answer: cached.answer,
            originalQuestion: cached.original_question,
            hitCount: cached.hit_count
        });

    } catch (err) {
        console.error('[Cache] Check error:', err.message);
        return res.json({ hit: false, error: err.message });
    }
}

/**
 * 캐시 저장 핸들러
 */
async function handleCacheSave(req, res) {
    const { queryPlan, specialty, hasContext, answer, originalQuestion } = req.body;

    if (!queryPlan || !answer) {
        return res.status(400).json({ error: 'queryPlan and answer are required' });
    }

    try {
        const cacheKey = generateCacheKey(queryPlan, specialty, hasContext);

        const url = `${process.env.SUPABASE_URL}/rest/v1/query_cache`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': process.env.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify({
                cache_key: cacheKey,
                topic: queryPlan.topic || [],
                sub_intent: queryPlan.subIntent || [],
                specialty: specialty?.code || null,
                has_context: !!hasContext,
                answer: answer,
                original_question: originalQuestion,
                hit_count: 0
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Cache] Save error:', errorText);
            return res.json({ success: false, error: errorText });
        }

        console.log(`[Cache] SAVED: ${cacheKey}`);
        return res.json({ success: true, cacheKey });

    } catch (err) {
        console.error('[Cache] Save exception:', err.message);
        return res.json({ success: false, error: err.message });
    }
}
