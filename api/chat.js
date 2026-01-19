// Vercel Serverless Function - OpenRouter API Proxy
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

    // Query Planner 모드 - 빠른 모델로 쿼리 분석
    if (mode === 'plan') {
        return await handleQueryPlanning(req, res, userQuery);
    }

    // 일반 답변 모드
    return await handleAnswerGeneration(req, res, userQuery, systemPrompt);
}

// Query Planner - 빠른 모델로 쿼리 의도 분석
async function handleQueryPlanning(req, res, userQuery) {
    const plannerPrompt = `당신은 병원 개원 상담 챗봇의 Query Planner입니다.
사용자 질문을 분석하여 검색 전략을 JSON으로 출력하세요.

[출력 형식 - 반드시 JSON만 출력]
{
  "intent": "정보요청|비교|절차|비용|파트너사",
  "topic": "인테리어|간판|의료기기|세무|마케팅|개원비용|파트너사|기타",
  "coreKeywords": ["핵심 키워드 1-3개 - 문서 제목/질문에 있을 법한 단어"],
  "expandedKeywords": ["확장/관련 키워드 - 동의어나 관련 표현"],
  "excludeKeywords": ["제외할 키워드 - 이 단어가 포함된 문서는 제외"],
  "searchStrategy": "exact|semantic|broad"
}

[핵심 규칙]
1. coreKeywords는 문서 제목이나 질문에 직접 나올 표현 사용
2. excludeKeywords로 무관한 문서 필터링 (예: 파트너사 질문시 "자격", "면허" 제외)
3. 병원 개원과 무관한 질문이면 intent를 "off_topic"으로

[예시]
질문: "인테리어 파트너사 뭐 있어?"
{
  "intent": "파트너사",
  "topic": "인테리어",
  "coreKeywords": ["인테리어 파트너사", "파트너사 안내", "인테리어 업체"],
  "expandedKeywords": ["오픈닥터 인테리어", "시공업체"],
  "excludeKeywords": ["자격", "면허", "시공능력", "필수", "확인"],
  "searchStrategy": "exact"
}

질문: "100평 개원하는데 얼마정도 들어?"
{
  "intent": "비용",
  "topic": "개원비용",
  "coreKeywords": ["개원 비용", "예산", "100평"],
  "expandedKeywords": ["의료기기 예산", "인테리어 비용", "총 비용"],
  "excludeKeywords": [],
  "searchStrategy": "semantic"
}`;

    // Query Planner용 빠른 모델 (Claude 사용)
    const fastModels = [
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }
    ];

    for (const model of fastModels) {
        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
                },
                body: JSON.stringify({
                    model: model.id,
                    messages: [
                        { role: 'system', content: plannerPrompt },
                        { role: 'user', content: userQuery }
                    ],
                    temperature: 0.1,
                    max_tokens: 500
                })
            });

            if (!response.ok) continue;

            const data = await response.json();
            if (data.choices?.[0]?.message?.content) {
                const content = data.choices[0].message.content;
                // JSON 파싱 시도
                try {
                    const jsonMatch = content.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        const plan = JSON.parse(jsonMatch[0]);
                        return res.json({ success: true, plan, modelName: model.name });
                    }
                } catch (e) {
                    console.error('JSON parse error:', e);
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
                    modelName: model.name
                });
            }
        } catch (error) {
            console.error(`Planner error with ${model.name}:`, error.message);
            continue;
        }
    }

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

// 답변 생성 - 기존 로직
async function handleAnswerGeneration(req, res, userQuery, systemPrompt) {
    const paidModels = [
        { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'openai/gpt-4o', name: 'GPT-4o' }
    ];

    for (const model of paidModels) {
        try {
            console.log(`Trying model: ${model.name}`);

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
                },
                body: JSON.stringify({
                    model: model.id,
                    messages: [
                        { role: 'system', content: systemPrompt || '' },
                        { role: 'user', content: userQuery }
                    ],
                    temperature: 0.2,
                    max_tokens: 4096
                })
            });

            if (!response.ok) {
                console.log(`Model ${model.name} failed with status ${response.status}`);
                continue;
            }

            const data = await response.json();

            if (data.choices?.[0]?.message) {
                return res.json({
                    success: true,
                    text: data.choices[0].message.content,
                    modelName: model.name
                });
            }
        } catch (error) {
            console.error(`Error with model ${model.name}:`, error.message);
            continue;
        }
    }

    return res.status(500).json({
        success: false,
        error: 'All models failed'
    });
}
