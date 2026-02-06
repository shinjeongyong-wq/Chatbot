/**
 * 전체 문서 비교 리포트 생성
 * - 원본 문서 내용
 * - 나눠진 문단들
 * - 모든 문서 포함
 */

const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');
const PARAGRAPHS_FILE = path.join(__dirname, 'paragraphs.json');
const RESULTS_FILE = path.join(__dirname, 'test-results.json');
const REPORT_FILE = path.join(__dirname, 'report-full.html');

// 모든 JSON 파일 찾기
function findAllJsonFiles(dir) {
    let results = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results = results.concat(findAllJsonFiles(fullPath));
        } else if (item.endsWith('.json') && item !== 'index.json') {
            results.push(fullPath);
        }
    }

    return results;
}

// 데이터 로드
const paragraphsData = JSON.parse(fs.readFileSync(PARAGRAPHS_FILE, 'utf-8'));
const resultsData = fs.existsSync(RESULTS_FILE)
    ? JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'))
    : { finalScore: 0, testsPassed: 0, testsRun: 0, results: [] };

// 원본 문서들 로드
const jsonFiles = findAllJsonFiles(NOTION_DIR);
const originalDocs = [];

for (const filePath of jsonFiles) {
    try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const relativePath = path.relative(NOTION_DIR, filePath).replace(/\\/g, '/');

        if (data.items && Array.isArray(data.items)) {
            for (const item of data.items) {
                if (item.answer) {
                    originalDocs.push({
                        filePath: relativePath,
                        question: item.question || '(질문 없음)',
                        originalId: item.id || '',
                        content: item.answer
                    });
                }
            }
        }

        if (data.answer && !data.items) {
            originalDocs.push({
                filePath: relativePath,
                question: data.question || '(질문 없음)',
                originalId: data.id || '',
                content: data.answer
            });
        }
    } catch (err) {
        console.error(`Error loading ${filePath}: ${err.message}`);
    }
}

console.log(`📄 원본 문서 ${originalDocs.length}개 로드`);
console.log(`📄 분리된 문단 ${paragraphsData.paragraphs.length}개`);

// HTML 이스케이프
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// HTML 생성
let docSections = '';
let docIndex = 0;

for (const doc of originalDocs) {
    docIndex++;

    // 이 문서에서 생성된 문단들 찾기
    const relatedParagraphs = paragraphsData.paragraphs.filter(p =>
        p.sourceDoc === doc.filePath &&
        (p.originalId === doc.originalId || p.originalQuestion === doc.question)
    );

    docSections += `
        <div class="doc-section" id="doc-${docIndex}">
            <div class="doc-header">
                <div class="doc-number">#${docIndex}</div>
                <div class="doc-info">
                    <div class="doc-path">📁 ${escapeHtml(doc.filePath)}</div>
                    <div class="doc-question">❓ ${escapeHtml(doc.question)}</div>
                </div>
            </div>
            
            <div class="comparison">
                <div class="original-section">
                    <h3>📄 원본 문서</h3>
                    <div class="doc-content">${escapeHtml(doc.content)}</div>
                    <div class="doc-meta">총 ${doc.content.length}자</div>
                </div>
                
                <div class="paragraphs-section">
                    <h3>✂️ 나눠진 문단 (${relatedParagraphs.length}개)</h3>
                    ${relatedParagraphs.length === 0 ? '<p class="no-paragraphs">분리된 문단 없음 (내용이 너무 짧거나 헤더가 없음)</p>' : ''}
                    ${relatedParagraphs.map((p, i) => `
                        <div class="paragraph-card">
                            <div class="paragraph-header">
                                <span class="paragraph-id">${escapeHtml(p.id)}</span>
                                <span class="paragraph-title">${escapeHtml(p.title)}</span>
                            </div>
                            <div class="paragraph-content">${escapeHtml(p.content)}</div>
                            <div class="paragraph-keywords">
                                ${p.keywords.slice(0, 8).map(k => `<span class="keyword">${escapeHtml(k)}</span>`).join('')}
                            </div>
                        </div>
                        ${i < relatedParagraphs.length - 1 ? '<div class="paragraph-divider">────────────────────</div>' : ''}
                    `).join('')}
                </div>
            </div>
        </div>
        
        <hr class="section-divider">
    `;
}

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>전체 문서 비교 리포트</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0d1117;
            color: #c9d1d9;
            margin: 0;
            padding: 20px;
            line-height: 1.7;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            font-size: 2rem;
            background: linear-gradient(90deg, #58a6ff, #3fb950);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #8b949e;
            margin-bottom: 30px;
        }
        
        /* 점수 카드 */
        .score-card {
            background: linear-gradient(135deg, #238636 0%, #1f6feb 100%);
            border-radius: 16px;
            padding: 25px;
            text-align: center;
            margin-bottom: 30px;
            display: flex;
            justify-content: center;
            gap: 50px;
            flex-wrap: wrap;
        }
        .score-item {
            text-align: center;
        }
        .score-value {
            font-size: 2.5rem;
            font-weight: bold;
            color: #fff;
        }
        .score-label {
            color: rgba(255,255,255,0.8);
            font-size: 0.9rem;
        }
        
        /* 목차 */
        .toc {
            background: #161b22;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 30px;
            max-height: 300px;
            overflow-y: auto;
        }
        .toc h2 {
            margin-top: 0;
            color: #58a6ff;
            font-size: 1.2rem;
        }
        .toc-list {
            column-count: 3;
            column-gap: 20px;
        }
        .toc-item {
            display: block;
            color: #8b949e;
            text-decoration: none;
            padding: 4px 0;
            font-size: 0.85rem;
            break-inside: avoid;
        }
        .toc-item:hover {
            color: #58a6ff;
        }
        
        /* 문서 섹션 */
        .doc-section {
            background: #161b22;
            border-radius: 12px;
            padding: 25px;
            margin-bottom: 20px;
            border: 1px solid #30363d;
        }
        .doc-header {
            display: flex;
            align-items: flex-start;
            gap: 15px;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid #30363d;
        }
        .doc-number {
            background: #238636;
            color: #fff;
            padding: 5px 12px;
            border-radius: 20px;
            font-weight: bold;
            font-size: 0.9rem;
        }
        .doc-path {
            color: #58a6ff;
            font-size: 0.9rem;
        }
        .doc-question {
            color: #c9d1d9;
            font-size: 1.1rem;
            margin-top: 5px;
        }
        
        /* 비교 레이아웃 */
        .comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
        }
        @media (max-width: 1000px) {
            .comparison {
                grid-template-columns: 1fr;
            }
        }
        .original-section h3, .paragraphs-section h3 {
            margin-top: 0;
            color: #8b949e;
            font-size: 1rem;
            margin-bottom: 15px;
        }
        .original-section h3 { color: #f0883e; }
        .paragraphs-section h3 { color: #3fb950; }
        
        .doc-content {
            background: #0d1117;
            border: 1px solid #30363d;
            border-radius: 8px;
            padding: 20px;
            white-space: pre-wrap;
            font-size: 0.85rem;
            line-height: 1.8;
            max-height: 600px;
            overflow-y: auto;
            color: #8b949e;
        }
        .doc-meta {
            color: #6e7681;
            font-size: 0.8rem;
            margin-top: 10px;
        }
        
        /* 문단 카드 */
        .paragraph-card {
            background: #0d1117;
            border: 1px solid #238636;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 10px;
        }
        .paragraph-header {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-bottom: 10px;
        }
        .paragraph-id {
            background: #238636;
            color: #fff;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            font-family: monospace;
        }
        .paragraph-title {
            color: #c9d1d9;
            font-weight: bold;
            font-size: 0.95rem;
        }
        .paragraph-content {
            white-space: pre-wrap;
            font-size: 0.85rem;
            line-height: 1.8;
            color: #8b949e;
            max-height: 300px;
            overflow-y: auto;
            padding: 10px;
            background: #161b22;
            border-radius: 6px;
        }
        .paragraph-keywords {
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        }
        .keyword {
            background: #1f6feb33;
            color: #58a6ff;
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.75rem;
        }
        .paragraph-divider {
            text-align: center;
            color: #30363d;
            margin: 15px 0;
            font-size: 0.8rem;
        }
        .no-paragraphs {
            color: #6e7681;
            font-style: italic;
        }
        
        /* 섹션 구분 */
        .section-divider {
            border: none;
            border-top: 3px dashed #30363d;
            margin: 40px 0;
        }
        
        .footer {
            text-align: center;
            color: #6e7681;
            margin-top: 50px;
            padding: 30px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📚 전체 문서 비교 리포트</h1>
        <p class="subtitle">원본 vs 나눠진 문단 | ${new Date().toLocaleString('ko-KR')}</p>
        
        <!-- 통계 -->
        <div class="score-card">
            <div class="score-item">
                <div class="score-value">${resultsData.finalScore}</div>
                <div class="score-label">테스트 점수</div>
            </div>
            <div class="score-item">
                <div class="score-value">${originalDocs.length}</div>
                <div class="score-label">원본 문서</div>
            </div>
            <div class="score-item">
                <div class="score-value">${paragraphsData.totalParagraphs}</div>
                <div class="score-label">분리된 문단</div>
            </div>
            <div class="score-item">
                <div class="score-value">v${paragraphsData.version}</div>
                <div class="score-label">버전</div>
            </div>
        </div>
        
        <!-- 목차 -->
        <div class="toc">
            <h2>📋 목차 (${originalDocs.length}개 문서)</h2>
            <div class="toc-list">
                ${originalDocs.map((doc, i) => `
                    <a href="#doc-${i + 1}" class="toc-item">#${i + 1} ${doc.filePath.split('/').pop()}</a>
                `).join('')}
            </div>
        </div>
        
        <!-- 문서들 -->
        ${docSections}
        
        <div class="footer">
            <p>📂 원본 데이터: data_testing/notion/</p>
            <p>📄 분리 결과: data_testing/paragraphs.json</p>
            <p>🔒 원본 data/ 폴더는 수정되지 않았습니다</p>
        </div>
    </div>
</body>
</html>`;

fs.writeFileSync(REPORT_FILE, html, 'utf-8');
console.log(`\n✅ 전체 리포트 생성 완료: ${REPORT_FILE}`);
console.log(`📊 파일 크기: ${(Buffer.byteLength(html, 'utf-8') / 1024 / 1024).toFixed(2)} MB`);
