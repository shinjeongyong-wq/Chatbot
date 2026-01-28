// api/sheets-proxy.js
// Vercel Serverless Function to proxy Google Sheets API requests for security

export default async function handler(req, res) {
    // CORS 헤더 추가 (브라우저 호출 허용)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { range } = req.query;
    // GOOGLE_API_KEY가 없으면 GEMINI_API_KEY를 대신 시도 (보통 같은 프로젝트 키를 사용하므로)
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!range) {
        return res.status(400).json({ error: 'Range is required' });
    }

    if (!apiKey || !spreadsheetId) {
        const missing = [];
        if (!apiKey) missing.push('GOOGLE_API_KEY (or GEMINI_API_KEY)');
        if (!spreadsheetId) missing.push('SPREADSHEET_ID');

        return res.status(500).json({
            error: 'Server environment variables not set',
            details: `Missing: ${missing.join(', ')}`,
            tip: 'Vercel Settings > Environment Variables에서 해당 값을 등록하고 Redeploy 해주세요.'
        });
    }

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${apiKey}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google Sheets API Error:', errorText);
            return res.status(response.status).json({ error: `Google Sheets API Error: ${response.status}`, details: errorText });
        }

        const data = await response.json();
        return res.status(200).json(data);
    } catch (error) {
        console.error('Fetch Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
