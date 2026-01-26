// api/sheets-proxy.js
// Vercel Serverless Function to proxy Google Sheets API requests for security

export default async function handler(req, res) {
    const { range } = req.query;
    const apiKey = process.env.GOOGLE_API_KEY;
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!range) {
        return res.status(400).json({ error: 'Range is required' });
    }

    if (!apiKey || !spreadsheetId) {
        return res.status(500).json({ error: 'Server environment variables not set' });
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
