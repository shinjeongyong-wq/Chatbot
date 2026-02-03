// Vercel Serverless Function - Google Sheets 데이터 수집 Proxy
// Apps Script URL이 환경변수에 저장되어 보안 유지

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

    const APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

    if (!APPS_SCRIPT_URL) {
        return res.status(500).json({ error: 'Apps Script URL not configured' });
    }

    try {
        const response = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body)
        });

        const text = await response.text();
        console.log('GAS Response Text:', text);

        try {
            const data = JSON.parse(text);
            return res.status(response.status).json(data);
        } catch (parseError) {
            console.error('JSON Parse Error from GAS:', parseError, 'Raw Text:', text);
            return res.status(response.status).json({
                success: false,
                error: 'Google Apps Script가 JSON이 아닌 응답을 반환했습니다.',
                rawResponse: text.substring(0, 500)
            });
        }

    } catch (error) {
        console.error('Proxy Error:', error);
        return res.status(500).json({
            success: false,
            error: 'Vercel Proxy 내에서 서버 오류가 발생했습니다: ' + error.message
        });
    }
}
