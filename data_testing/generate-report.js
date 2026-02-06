/**
 * 테스트 결과를 사람이 읽기 쉬운 HTML 리포트로 생성
 */

const fs = require('fs');
const path = require('path');

const PARAGRAPHS_FILE = path.join(__dirname, 'paragraphs.json');
const RESULTS_FILE = path.join(__dirname, 'test-results.json');
const REPORT_FILE = path.join(__dirname, 'report.html');

// 데이터 로드
const paragraphsData = JSON.parse(fs.readFileSync(PARAGRAPHS_FILE, 'utf-8'));
const resultsData = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf-8'));

// HTML 생성
const html = `<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>문단 분리 테스트 리포트</title>
    <style>
        * { box-sizing: border-box; }
        body {
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            color: #e8e8e8;
            margin: 0;
            padding: 40px 20px;
            min-height: 100vh;
            line-height: 1.8;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            font-size: 2.5rem;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #888;
            margin-bottom: 40px;
        }
        .score-card {
            background: linear-gradient(135deg, #00d9ff33, #00ff8833);
            border-radius: 20px;
            padding: 30px;
            text-align: center;
            margin-bottom: 40px;
            border: 1px solid #00d9ff55;
        }
        .score-number {
            font-size: 5rem;
            font-weight: bold;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .score-label {
            font-size: 1.2rem;
            color: #aaa;
        }
        .stats {
            display: flex;
            justify-content: center;
            gap: 40px;
            margin-top: 20px;
        }
        .stat-item {
            text-align: center;
        }
        .stat-value {
            font-size: 1.5rem;
            font-weight: bold;
            color: #00ff88;
        }
        .stat-label {
            color: #888;
            font-size: 0.9rem;
        }
        
        .section {
            background: #ffffff0a;
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 30px;
            border: 1px solid #ffffff15;
        }
        .section h2 {
            color: #00d9ff;
            margin-top: 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .test-result {
            background: #ffffff08;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
            border-left: 4px solid #00ff88;
        }
        .test-result.failed {
            border-left-color: #ff4757;
        }
        .test-question {
            font-size: 1.1rem;
            color: #fff;
            margin-bottom: 10px;
        }
        .test-score {
            display: inline-block;
            background: #00ff8833;
            color: #00ff88;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.9rem;
            margin-bottom: 15px;
        }
        .test-result.failed .test-score {
            background: #ff475733;
            color: #ff4757;
        }
        .found-items {
            color: #aaa;
            font-size: 0.95rem;
        }
        .found-items strong {
            color: #00ff88;
        }
        
        .divider {
            border: none;
            border-top: 1px dashed #ffffff30;
            margin: 30px 0;
        }
        
        .paragraph-section {
            margin-bottom: 40px;
        }
        .paragraph-title {
            font-size: 1.3rem;
            color: #00d9ff;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid #00d9ff33;
        }
        .paragraph-content {
            background: #0a0a15;
            border-radius: 12px;
            padding: 25px;
            white-space: pre-wrap;
            font-size: 0.95rem;
            line-height: 2;
            color: #ccc;
            max-height: 500px;
            overflow-y: auto;
        }
        .paragraph-meta {
            display: flex;
            gap: 20px;
            margin-top: 15px;
            font-size: 0.85rem;
            color: #666;
        }
        .keyword-tag {
            display: inline-block;
            background: #00d9ff22;
            color: #00d9ff;
            padding: 3px 10px;
            border-radius: 15px;
            font-size: 0.8rem;
            margin: 2px;
        }
        
        .footer {
            text-align: center;
            color: #555;
            margin-top: 50px;
            padding-top: 30px;
            border-top: 1px solid #ffffff15;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 문단 분리 테스트 리포트</h1>
        <p class="subtitle">생성 시간: ${new Date().toLocaleString('ko-KR')}</p>
        
        <!-- 점수 카드 -->
        <div class="score-card">
            <div class="score-number">${resultsData.finalScore}</div>
            <div class="score-label">최종 점수</div>
            <div class="stats">
                <div class="stat-item">
                    <div class="stat-value">${resultsData.testsPassed}/${resultsData.testsRun}</div>
                    <div class="stat-label">테스트 통과</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${paragraphsData.totalParagraphs}</div>
                    <div class="stat-label">총 문단 수</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">v${paragraphsData.version}</div>
                    <div class="stat-label">버전</div>
                </div>
            </div>
        </div>
        
        <!-- 테스트 결과 섹션 -->
        <div class="section">
            <h2>📊 테스트 결과</h2>
            
            ${resultsData.results.map(r => `
            <div class="test-result ${r.passed ? '' : 'failed'}">
                <div class="test-question">❓ ${r.question}</div>
                <div class="test-score">${r.passed ? '✅ 통과' : '❌ 실패'} - ${r.score}점</div>
                <div class="found-items">
                    ${r.foundItems ? `<strong>발견된 항목:</strong> ${r.foundItems.join(', ')}` : ''}
                    ${r.foundTopics ? `<strong>발견된 주제:</strong> ${r.foundTopics.join(', ')}` : ''}
                    ${r.missingItems && r.missingItems.length > 0 ? `<br><span style="color:#ff4757">누락된 항목:</span> ${r.missingItems.join(', ')}` : ''}
                    ${r.missingTopics && r.missingTopics.length > 0 ? `<br><span style="color:#ff4757">누락된 주제:</span> ${r.missingTopics.join(', ')}` : ''}
                </div>
            </div>
            `).join('')}
        </div>
        
        <hr class="divider">
        
        <!-- 웨이브 문단 상세 -->
        <div class="section">
            <h2>🌊 웨이브 문단 상세 내용</h2>
            
            ${['wave1', 'wave2', 'wave3'].map(id => {
    const p = paragraphsData.paragraphs.find(para => para.id === id);
    if (!p) return '';
    return `
                <div class="paragraph-section">
                    <div class="paragraph-title">${p.title}</div>
                    <div class="paragraph-content">${p.content}</div>
                    <div class="paragraph-meta">
                        <span>📄 출처: ${p.sourceDoc}</span>
                        <span>📝 ${p.content.length}자</span>
                    </div>
                    <div style="margin-top: 10px;">
                        ${p.keywords.slice(0, 10).map(k => `<span class="keyword-tag">${k}</span>`).join('')}
                    </div>
                </div>
                <hr class="divider">
                `;
}).join('')}
        </div>
        
        <!-- 통증 의료기기 문단 -->
        <div class="section">
            <h2>💉 통증 의료기기 관련 주요 문단</h2>
            
            ${paragraphsData.paragraphs
        .filter(p => p.keywords.some(k => k.includes('통증 의료기기')))
        .slice(0, 5)
        .map(p => `
                <div class="paragraph-section">
                    <div class="paragraph-title">${p.title}</div>
                    <div class="paragraph-content">${p.content.slice(0, 1500)}${p.content.length > 1500 ? '\n\n... (내용 더 있음)' : ''}</div>
                    <div class="paragraph-meta">
                        <span>📄 출처: ${p.sourceDoc}</span>
                        <span>📝 ${p.content.length}자</span>
                    </div>
                </div>
                <hr class="divider">
                `).join('')}
        </div>
        
        <div class="footer">
            <p>📂 원본 데이터: data_testing/paragraphs.json</p>
            <p>🔒 원본 data/ 폴더는 수정되지 않았습니다</p>
        </div>
    </div>
</body>
</html>`;

fs.writeFileSync(REPORT_FILE, html, 'utf-8');
console.log(`✅ 리포트 생성 완료: ${REPORT_FILE}`);
console.log(`\n🔗 브라우저에서 열기: file:///${REPORT_FILE.replace(/\\/g, '/')}`);
