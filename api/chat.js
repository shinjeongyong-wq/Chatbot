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

    // 일반 답변 모드
    return await handleAnswerGeneration(req, res, userQuery, systemPrompt);
}

// Gemini API 호출 함수
async function callGeminiAPI(prompt, systemPrompt = '', model = 'gemini-1.5-flash') {
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
            maxOutputTokens: 4096
        }
    };

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

    // Gemini 응답에서 텍스트 추출
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
    }

    throw new Error('No content in Gemini response');
}

// Query Planner - Gemini Flash로 쿼리 의도 분석
async function handleQueryPlanning(req, res, userQuery) {
    const { userSpecialty } = req.body;

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

    const plannerPrompt = `당신은 병원 개원 상담 챗봇의 Query Planner입니다.
사용자 질문을 분석하여 검색 전략을 JSON으로 출력하세요.
${userSpecialtyContext}
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

[반환할 JSON 형식]
{
  "intent": "파트너사목록|절차안내|비용|체크리스트|심화|정보요청|off_topic",
  "topic": "인테리어|간판|의료기기|세무|마케팅|개원비용|CI/BI|기타",
  "targetCategory": "partners|hospital-basics|advanced|checklist|all",
  "specialtyRelevant": true/false,
  "coreKeywords": ["핵심 키워드 1-3개"],
  "expandedKeywords": ["관련 확장 키워드"],
  "excludeKeywords": [],
  "searchStrategy": "semantic|broad|exact"
}

[specialtyRelevant 판단 기준]
- **true**: 진료과별로 답변이 달라야 하는 질문
  예: 의료기기 추천, 파트너사 추천, 진료과별 인테리어, 진료과별 비용
- **false**: 모든 진료과에 공통으로 적용되는 질문
  예: 간판 설치, 세무, 법률, 개설신고 절차, 일반 운영

[예시]
질문: "인테리어 파트너사 뭐 있어?"
{"intent":"파트너사목록","topic":"인테리어","targetCategory":"partners","specialtyRelevant":true,"coreKeywords":["인테리어","파트너사"],"expandedKeywords":["시공업체"],"excludeKeywords":[],"searchStrategy":"semantic"}

질문: "의료기기 추천해줘"
{"intent":"정보요청","topic":"의료기기","targetCategory":"advanced","specialtyRelevant":true,"coreKeywords":["의료기기","장비"],"expandedKeywords":["레이저","초음파"],"excludeKeywords":[],"searchStrategy":"semantic"}

질문: "간판 설치할 때 고려사항"
{"intent":"정보요청","topic":"간판","targetCategory":"all","specialtyRelevant":false,"coreKeywords":["간판","설치","고려사항"],"expandedKeywords":["사인","외관"],"excludeKeywords":[],"searchStrategy":"broad"}

질문: "개설신고 절차 알려줘"
{"intent":"절차안내","topic":"기타","targetCategory":"hospital-basics","specialtyRelevant":false,"coreKeywords":["개설신고","절차"],"expandedKeywords":["행정","서류"],"excludeKeywords":[],"searchStrategy":"broad"}

반드시 JSON만 출력하세요.`;

    try {
        // Gemini Flash로 Query Planning (빠르고 무료)
        const content = await callGeminiAPI(userQuery, plannerPrompt, 'gemini-1.5-flash');

        // JSON 파싱 시도
        try {
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const plan = JSON.parse(jsonMatch[0]);
                return res.json({ success: true, plan, modelName: 'Gemini 1.5 Flash' });
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
            modelName: 'Gemini 1.5 Flash (fallback)'
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

// 답변 생성 - Gemini API 사용
async function handleAnswerGeneration(req, res, userQuery, systemPrompt) {
    // 모델 우선순위: Gemini 3 Flash (최신) → 2.0 Flash → 1.5 Flash
    const models = [
        { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ];

    for (const model of models) {
        try {
            console.log(`Trying model: ${model.name}`);

            const content = await callGeminiAPI(userQuery, systemPrompt, model.id);

            return res.json({
                success: true,
                text: content,
                modelName: model.name
            });
        } catch (error) {
            console.error(`Error with model ${model.name}:`, error.message);
            continue;
        }
    }

    return res.status(500).json({
        success: false,
        error: 'All models failed',
        debug: {
            apiKeyExists: !!process.env.GEMINI_API_KEY,
            apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
            message: 'Gemini API 호출이 모두 실패했습니다. API 키를 확인해주세요.'
        }
    });
}
