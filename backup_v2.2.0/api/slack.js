// Vercel Serverless Function - Slack Webhook Proxy
// Slack Webhook URL이 환경변수에 저장되어 노출되지 않음

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

    const { question, plannerName } = req.body;

    if (!plannerName) {
        return res.status(400).json({ error: 'plannerName is required' });
    }

    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

    if (!SLACK_WEBHOOK_URL) {
        return res.status(500).json({ error: 'Slack webhook not configured' });
    }

    const timestamp = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

    const slackMessage = {
        text: `🏥 *챗봇 문의 접수*\n\n📝 *질문:* ${question || '(질문 없음)'}\n📅 *날짜 및 시간:* ${timestamp}\n👤 *담당 플래너:* ${plannerName}`
    };

    try {
        const response = await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackMessage)
        });

        if (response.ok) {
            return res.status(200).json({ success: true });
        } else {
            return res.status(500).json({ error: 'Slack send failed' });
        }
    } catch (error) {
        console.error('Slack webhook error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
