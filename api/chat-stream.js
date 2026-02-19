// Vercel Serverless Function - Gemini Streaming API (SSE)
// 실시간 스트리밍으로 AI 응답을 클라이언트에 전달

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

    const { userQuery, systemPrompt } = req.body;

    if (!userQuery) {
        return res.status(400).json({ error: 'userQuery is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    }

    // SSE 헤더 설정
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx 버퍼링 비활성화

    // 모델 목록 (fallback)
    const models = [
        'gemini-2.5-flash',
        'gemini-3-flash-preview'
    ];

    let streamSuccess = false;
    let accumulatedText = ''; // 누적 텍스트 (에러 시 보존용)

    for (const model of models) {
        if (streamSuccess) break;

        try {
            console.log(`[Stream] Trying model: ${model}`);

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

            const requestBody = {
                contents: [
                    {
                        role: 'user',
                        parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${userQuery}` : userQuery }]
                    }
                ],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 8192
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Stream] ${model} failed: ${response.status} - ${errorText}`);
                continue; // 다음 모델 시도
            }

            // 스트림 읽기
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // 모델 정보 전송
            res.write(`event: model\ndata: ${JSON.stringify({ model })}\n\n`);

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    streamSuccess = true;
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });

                // SSE 형식 파싱: "data: {...}\n\n"
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.slice(6); // "data: " 제거
                            if (jsonStr.trim() === '') continue;

                            const data = JSON.parse(jsonStr);
                            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

                            if (text) {
                                accumulatedText += text;
                                // 클라이언트에 토큰 전송
                                res.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`);
                            }

                            // 종료 확인
                            const finishReason = data.candidates?.[0]?.finishReason;
                            if (finishReason === 'STOP') {
                                streamSuccess = true;
                            }
                        } catch (parseError) {
                            // JSON 파싱 실패는 무시 (부분 데이터일 수 있음)
                            console.warn('[Stream] Parse warning:', parseError.message);
                        }
                    }
                }
            }

            if (streamSuccess) {
                // 정상 완료
                res.write(`event: done\ndata: ${JSON.stringify({ success: true, model })}\n\n`);
            }

        } catch (error) {
            console.error(`[Stream] Error with ${model}:`, error.message);

            // 에러 발생 시에도 누적된 텍스트가 있으면 보존
            if (accumulatedText.length > 0) {
                res.write(`event: error\ndata: ${JSON.stringify({
                    error: error.message,
                    partial: true,
                    accumulatedLength: accumulatedText.length
                })}\n\n`);
            }

            continue; // 다음 모델 시도
        }
    }

    // 모든 모델 실패
    if (!streamSuccess) {
        if (accumulatedText.length > 0) {
            // 부분 응답이라도 있으면 보존
            res.write(`event: done\ndata: ${JSON.stringify({
                success: false,
                partial: true,
                message: '응답이 완전하지 않을 수 있습니다.'
            })}\n\n`);
        } else {
            res.write(`event: error\ndata: ${JSON.stringify({
                error: 'All models failed',
                fallback: true
            })}\n\n`);
        }
    }

    res.end();
}
