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
사용자 질문을 분석하여 검색 전략을 JSON으로 출력하세요.
${userSpecialtyContext}${conversationContext}
[데이터 소스 - 3가지]
1. **Google Sheets Q&A** - 병원 개원 관련 일반 질문/답변
2. **Google Sheets FAQ** - 자주 묻는 질문
3. **Notion 데이터** - 파트너사, 프로세스, 체크리스트 등 상세 정보

[Notion 폴더 구조]
1. **partners/** - 파트너사 명단
   - partners/pre-construction/ - 착공 이전 파트너사 (은행, 인테리어, 간판, 홈페이지, PC&네트워크)
   - partners/post-construction/ - 착공 이후 파트너사 (가구, 중후반 프로세스, EMR/CRM, 마케팅)

2. **hospital-basics/** - 개원 시 필요 영역 [기본편]
   - hospital-basics/pre-construction/ - 착공 이전 (세무, 대출, 인테리어, 간판, 의료기기, 마케팅, 홈페이지)
   - hospital-basics/during-construction/ - 시공 중 (운영 지원 인프라, 가구, 섬유류, 의료폐기물)
   - hospital-basics/post-opening/ - 개설신고 이후 (행정, 보험, EMR/CRM, 의약품, 관리)

3. **advanced/** - 심화 콘텐츠 (인테리어 심화, 간판 심화, 의료기기 미용/통증/내과/치과)

4. **checklist/** - 체크리스트/점검표 (시설, 공사, 규정, 일반)

[중요 규칙]
- 모든 검색은 Q&A, FAQ, Notion 3가지 소스 모두를 대상으로 합니다
- targetCategory는 Notion 데이터 내에서 우선순위를 정하는 용도입니다
- 일반적인 질문이면 targetCategory를 "all"로 설정하세요
- 사용자가 '더', '또'라고 하면 **excludeKeywords**를 활용해 이미 본 정보를 제외하도록 쿼리를 짜세요.

[의도 구분 및 카테고리 매칭 규칙]
1. **지식/방법론 요청 (How/What)**: "방법", "팁", "노하우", "잘 보이는 법", "절차" 등을 물으면 **intent: "정보요청"**, **targetCategory: "all"**로 설정하세요. (Google Sheets와 모든 Notion 폴더를 훑기 위함)
2. **단순 업체/리스트 요청 (Who)**: "업체 추천", "명단", "리스트", "파트너사 알려줘"처럼 대상을 직접 찾을 때만 **intent: "파트너사목록"**, **targetCategory: "partners"**를 사용하세요.
3. **심화 주제 요청**: 특정 분야의 깊은 내용(예: 의료기기 상세 스펙)은 **intent: "심화"**, **targetCategory: "advanced"**로 설정하세요.

[매칭 예시]
- "밤에 간판 잘 보이게 하고 싶어" → intent: "정보요청", topic: "간판", targetCategory: "all", targetSubCategory: "signage"
- "인테리어 업체 명단 뽑아줘" → intent: "파트너사목록", topic: "인테리어", targetCategory: "partners", targetSubCategory: "interior"
- "대출 받을 때 팁 알려줘" → intent: "정보요청", topic: "개원비용", targetCategory: "all", targetSubCategory: "finance"

[반환할 JSON 형식]
{
  "intent": "파트너사목록|절차안내|비용|체크리스트|심화|정보요청|off_topic",
  "topic": "인테리어|간판|의료기기|세무|마케팅|개원비용|CI/BI|기타",
  "targetCategory": "partners|hospital-basics|advanced|checklist|all",
  "targetSubCategory": "interior|signage|homepage|medical-device|tax|finance|all",
  "specialtyRelevant": true/false,
  "coreKeywords": ["핵심 키워드 1-3개"],
  "expandedKeywords": ["관련 확장 키워드"],
  "excludeKeywords": ["이전 대화에서 언급되어 제외할 키워드들"],
  "searchStrategy": "semantic|broad|exact"
}

[specialtyRelevant 판단 기준]
- **true**: 진료과별로 답변이 달라야 하는 질문
  예: 의료기기 추천, 파트너사 추천, 진료과별 인테리어, 진료과별 비용
- **false**: 모든 진료과에 공통으로 적용되는 질문
  예: 간판 설치, 세무, 법률, 개설신고 절차, 일반 운영

[예시]
질문: "인테리어 파트너사 추천해줘"
{"intent":"파트너사목록","topic":"인테리어","targetCategory":"partners","specialtyRelevant":true,"coreKeywords":["인테리어","파트너"],"expandedKeywords":["시공","업체"],"excludeKeywords":[],"searchStrategy":"semantic"}

질문: "의료기기 장비 알려줘"
{"intent":"정보요청","topic":"의료기기","targetCategory":"advanced","specialtyRelevant":true,"coreKeywords":["의료기기","장비"],"expandedKeywords":[],"excludeKeywords":[],"searchStrategy":"semantic"}

질문: "간판 관련 정보"
{"intent":"정보요청","topic":"간판","targetCategory":"partners","specialtyRelevant":false,"coreKeywords":["간판"],"expandedKeywords":["사인"],"excludeKeywords":[],"searchStrategy":"broad"}

질문: "개설신고 절차 알려줘"
{"intent":"절차안내","topic":"기타","targetCategory":"hospital-basics","specialtyRelevant":false,"coreKeywords":["개설신고","절차"],"expandedKeywords":["행정","서류"],"excludeKeywords":[],"searchStrategy":"broad"}

반드시 JSON만 출력하세요.`;

    try {
        const models = [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }
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

        // 파싱 실패시 기본 플랜 반환
        return res.json({
            success: true,
            plan: {
                intent: "정보요청",
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

        // 실패시 기본 플랜
        return res.json({
            success: true,
            plan: {
                intent: "정보요청",
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
