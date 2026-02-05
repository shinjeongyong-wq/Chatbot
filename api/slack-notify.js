/**
 * Slack 알림 전송 API
 * POST /api/slack-notify
 */

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

    const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

    if (!SLACK_WEBHOOK_URL) {
        console.error('SLACK_WEBHOOK_URL not configured');
        return res.status(500).json({ error: 'Slack webhook not configured' });
    }

    try {
        const { message, count } = req.body;

        const slackPayload = {
            blocks: [
                {
                    type: "header",
                    text: {
                        type: "plain_text",
                        text: "🔔 피드백 자동화 알림",
                        emoji: true
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: `*${count}개*의 새로운 피드백이 쌓였습니다!`
                    }
                },
                {
                    type: "section",
                    text: {
                        type: "mrkdwn",
                        text: "👉 AI 채팅창에 `/feedback-auto` 를 입력하여 자동 개선을 시작하세요."
                    }
                },
                {
                    type: "context",
                    elements: [
                        {
                            type: "mrkdwn",
                            text: `⏰ ${new Date().toLocaleString('ko-KR')}`
                        }
                    ]
                }
            ]
        };

        const response = await fetch(SLACK_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload)
        });

        if (response.ok) {
            console.log('✅ Slack 알림 전송 성공');
            return res.status(200).json({ success: true });
        } else {
            const errorText = await response.text();
            console.error('Slack 알림 실패:', errorText);
            return res.status(500).json({ error: 'Slack notification failed', details: errorText });
        }

    } catch (error) {
        console.error('Slack 알림 오류:', error);
        return res.status(500).json({ error: error.message });
    }
}
