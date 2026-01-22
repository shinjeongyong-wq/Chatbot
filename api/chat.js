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

[의도 구분]
- "파트너사 알려줘/뭐있어/추천해줘" → intent: "파트너사목록", targetCategory: "partners"
- "어떻게 해/절차/과정/방법" → intent: "절차안내", targetCategory: "hospital-basics"
- "체크리스트/점검" → intent: "체크리스트", targetCategory: "checklist"
- 일반적인 질문/정보 요청 → intent: "정보요청", targetCategory: "all"

[출력 형식 - JSON만 출력]
{
  "intent": "파트너사목록|절차안내|비용|체크리스트|심화|정보요청|off_topic",
  "topic": "인테리어|간판|의료기기|세무|마케팅|개원비용|CI/BI|기타",
  "targetCategory": "partners|hospital-basics|advanced|checklist|all",
  "coreKeywords": ["핵심 키워드 1-3개"],
  "expandedKeywords": ["관련 확장 키워드"],
  "excludeKeywords": [],
  "searchStrategy": "semantic|broad|exact"
}

[예시]
질문: "인테리어 파트너사 뭐 있어?"
{"intent":"파트너사목록","topic":"인테리어","targetCategory":"partners","coreKeywords":["인테리어","파트너사"],"expandedKeywords":["시공업체"],"excludeKeywords":[],"searchStrategy":"semantic"}

질문: "CI/BI 연계하지말고 보편적으로 알려줘"
{"intent":"정보요청","topic":"CI/BI","targetCategory":"all","coreKeywords":["CI","BI","브랜딩"],"expandedKeywords":["로고","간판","디자인"],"excludeKeywords":["연계"],"searchStrategy":"broad"}

질문: "개원 비용 얼마나 들어?"
{"intent":"비용","topic":"개원비용","targetCategory":"all","coreKeywords":["개원","비용","예산"],"expandedKeywords":["자금","투자"],"excludeKeywords":[],"searchStrategy":"broad"}`;

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

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'No error body');
                console.error(`Planner ${model.name} failed: ${response.status} - ${errorText}`);
                continue;
            }

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
        error: 'All models failed',
        debug: {
            apiKeyExists: !!process.env.OPENROUTER_API_KEY,
            apiKeyLength: process.env.OPENROUTER_API_KEY?.length || 0,
            message: 'OpenRouter API 호출이 모두 실패했습니다. API 키를 확인해주세요.'
        }
    });
}
