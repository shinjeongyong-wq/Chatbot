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

    const { userQuery, systemPrompt, model } = req.body;

    if (!userQuery) {
        return res.status(400).json({ error: 'userQuery is required' });
    }

    // 유료 모델 목록 (Gemini → Claude → GPT 순서)
    // $15 결제 완료 - 약 1,000~1,400회 답변 가능
    const paidModels = [
        // 1. Gemini (Google) - 가장 경제적
        { id: 'google/gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        // 2. Claude (Anthropic) - 고품질
        { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
        { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku' },
        // 3. GPT (OpenAI) - 범용
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'openai/gpt-4o', name: 'GPT-4o' }
    ];

    // 모델 순서대로 시도 (Fallback)
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

            if (data.choices && data.choices[0] && data.choices[0].message) {
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

    // 모든 모델 실패
    return res.status(500).json({
        success: false,
        error: 'All models failed'
    });
}
