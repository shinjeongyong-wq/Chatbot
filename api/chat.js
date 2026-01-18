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

    // 무료 모델 목록 (Claude → Gemini → GPT → 기타 순서)
    // ⚠️ Claude 무료 모델은 OpenRouter에 없음! Gemini부터 시작
    const freeModels = [
        // 1. Gemini (Google) - 무료 ✅
        { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash' },
        // 2. GPT (OpenAI) - 무료 ✅
        { id: 'openai/gpt-oss-120b:free', name: 'GPT-OSS 120B' },
        // 3. 기타 - Llama, DeepSeek 등 무료
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B' },
        { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1' },
        { id: 'meta-llama/llama-4-maverick:free', name: 'Llama 4 Maverick' },
        { id: 'qwen/qwen3-4b:free', name: 'Qwen 3 4B' }
    ];

    // 모델 순서대로 시도 (Fallback)
    for (const model of freeModels) {
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
