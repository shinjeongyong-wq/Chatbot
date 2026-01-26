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

    // 문서 요약 모드 - 검색 결과 압축 (토큰 최적화)
    if (mode === 'summarize') {
        return await handleDocumentSummary(req, res, userQuery);
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
        conversationContext = `

# 🔄 최근 대화 맥락 (매우 중요!)
아래는 최근 대화 내용입니다. "더 없어?", "그거 말고", "또 뭐 있어?" 같은 후속 질문이 오면, 이 맥락을 참고하여 주제를 유지하세요.

${recentContext}

**규칙: 사용자가 "더", "또", "추가로" 같은 후속 질문을 하면, 위 대화의 주제(topic)를 그대로 유지하세요!**
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
        // Gemini Flash로 Query Planning (최신 모델 우선 시도)
        // 시도할 모델 목록 (고성능 모델 포함)
        const models = [
            { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
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
            modelName: `${usedModel} (fallback)`
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
    // 모델 우선순위: Gemini 3 Flash -> Gemini 2.0 Flash -> Gemini 1.5 Flash
    const models = [
        { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (Exp)' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
    ];

    let lastError = null;

    for (const model of models) {
        try {
            console.log(`Trying model: ${model.name} (${model.id})`);
            const content = await callGeminiAPI(userQuery, systemPrompt, model.id);

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
            apiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
            lastErrorMessage: lastError,
            message: 'Gemini API 호출이 모두 실패했습니다. 마지막 에러: ' + lastError
        }
    });
}

// 문서 요약 핸들러 - 검색된 문서들을 핵심 정보만 추출하여 압축
async function handleDocumentSummary(req, res, documents) {
    const summaryPrompt = `당신은 문서 요약 전문가입니다. 아래 검색 결과들을 **각각 50자 이내로 핵심만 요약**해주세요.

**요약 규칙:**
1. 각 문서의 번호([1], [2]...)를 유지하세요.
2. 업체명, 장비명, 가격, 핵심 특징만 추출하세요.
3. 불필요한 설명이나 부연은 모두 제거하세요.
4. JSON이 아닌 일반 텍스트로 출력하세요.

**출력 형식 예시:**
[1] C-Arm: 실시간 투시 장비, 통증의학과 필수, 1억 내외
[2] 체외충격파(ESWT): 인대/근육 통증 치료, 외래 매출 효과
[3] 무이디자인: 18년 업력, 3D 도면 제공, 정형외과 전문

---
요약할 문서들:
${documents}`;

    try {
        const summary = await callGeminiAPI(summaryPrompt, '', 'gemini-2.0-flash');

        return res.json({
            success: true,
            summary: summary
        });
    } catch (error) {
        console.error('Document summary error:', error.message);
        return res.json({
            success: false,
            summary: null,
            error: error.message
        });
    }
}
