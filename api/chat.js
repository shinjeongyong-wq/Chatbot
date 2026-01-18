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

    // 무료 모델 목록
    const freeModels = [
        'meta-llama/llama-3.3-70b-instruct:free',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-4-maverick:free',
        'qwen/qwen-2.5-72b-instruct:free'
    ];

    // 모델 순서대로 시도 (Fallback)
    for (const modelId of freeModels) {
        try {
            console.log(`Trying model: ${modelId}`);

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: systemPrompt || '' },
                        { role: 'user', content: userQuery }
                    ],
                    temperature: 0.2,
                    max_tokens: 4096
                })
            });

            if (!response.ok) {
                console.log(`Model ${modelId} failed with status ${response.status}`);
                continue;
            }

            const data = await response.json();

            if (data.choices && data.choices[0] && data.choices[0].message) {
                // 사용된 모델명 추출
                const modelName = modelId.split('/')[1].split(':')[0];
                return res.json({
                    success: true,
                    text: data.choices[0].message.content,
                    modelName: modelName
                });
            }
        } catch (error) {
            console.error(`Error with model ${modelId}:`, error.message);
            continue;
        }
    }

    // 모든 모델 실패
    return res.status(500).json({
        success: false,
        error: 'All models failed'
    });
}
