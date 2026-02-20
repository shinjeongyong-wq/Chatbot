const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 5001;
const DATA_DIR = 'data_testing/notion';
const SAVE_FILE = 'data_testing/manual_splits.json';

// 타겟 폴더들
const targetPaths = [
    'advanced',
    'hospital-basics/during-construction',
    'hospital-basics/post-opening',
    'hospital-basics/pre-construction',
    'hospital-opening-roadmap.json'
];

function getAllFiles() {
    let allFiles = [];
    targetPaths.forEach(tp => {
        const fullPath = path.join(DATA_DIR, tp);
        if (!fs.existsSync(fullPath)) return;
        if (fs.statSync(fullPath).isDirectory()) {
            fs.readdirSync(fullPath).forEach(f => {
                if (f.endsWith('.json') && f !== 'index.json') {
                    allFiles.push(path.join(tp, f).replace(/\\/g, '/'));
                }
            });
        } else {
            allFiles.push(tp.replace(/\\/g, '/'));
        }
    });
    return allFiles;
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // 1. 파일 목록 가져오기
    if (parsedUrl.pathname === '/api/files') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(getAllFiles()));
    }

    // 2. 특정 파일 내용 읽기
    else if (parsedUrl.pathname === '/api/content') {
        const filePath = parsedUrl.query.path;
        const fullPath = path.join(DATA_DIR, filePath);
        if (fs.existsSync(fullPath)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(fs.readFileSync(fullPath, 'utf8'));
        } else {
            res.writeHead(404);
            res.end();
        }
    }

    // 3. 저장된 분할 정보 읽기
    else if (parsedUrl.pathname === '/api/get-splits') {
        if (fs.existsSync(SAVE_FILE)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(fs.readFileSync(SAVE_FILE, 'utf8'));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({}));
        }
    }

    // 4. 분할 정보 저장하기
    else if (parsedUrl.pathname === '/api/save' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const data = JSON.parse(body);
            let currentData = {};
            if (fs.existsSync(SAVE_FILE)) {
                currentData = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
            }
            currentData[data.path] = data.splits;
            fs.writeFileSync(SAVE_FILE, JSON.stringify(currentData, null, 2));
            res.writeHead(200);
            res.end('Saved');
            console.log(`✅ Saved splits for: ${data.path}`);
        });
    }

    // 5. HTML 서빙
    else {
        const htmlPath = path.join(__dirname, 'data_testing', 'interactive-splitter.html');
        if (fs.existsSync(htmlPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(htmlPath, 'utf8'));
        } else {
            res.writeHead(404);
            res.end('Tool not ready');
        }
    }
});

server.listen(PORT, () => {
    console.log(`🚀 Splitter Server running at http://localhost:${PORT}`);
});
