/**
 * Phase 0: 노션 문서 문단 분리 테스트
 * AI가 긴 노션 문서를 문단별로 잘 분리하고 요약하는지 검증
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Gemini API 설정
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function callGemini(prompt) {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 8192
            }
        })
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(data.error.message);
    }
    return data.candidates[0].content.parts[0].text;
}

async function testParagraphSplit() {
    console.log('========================================');
    console.log('📚 Phase 0: 노션 문서 문단 분리 테스트');
    console.log('========================================\n');

    // 1. 노션 문서 로드
    const filePath = path.join(__dirname, 'data/notion/hospital-opening-roadmap.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const doc = data.items[0];

    console.log(`📄 문서: ${doc.question}`);
    console.log(`📏 원본 길이: ${doc.answer.length.toLocaleString()}자`);
    console.log('\n----------------------------------------\n');

    // 2. AI에게 문단 분리 및 요약 요청
    const splitPrompt = `당신은 문서 분석 전문가입니다. 아래 문서를 **큰 주제 단위**로 분리하고 각 주제를 **요약**해주세요.

## 규칙:
1. **사람이 읽듯이** 큰 주제별로 분리하세요. 세부 항목마다 나누지 마세요.
2. 예를 들어:
   - "1차 웨이브"는 하나의 문단 (안에 대출, 세무, 인테리어 등 세부 항목이 있어도 하나로)
   - "2차 웨이브"는 하나의 문단
   - "인테리어 상세 설명"은 하나의 문단
3. **목표: 약 10~15개 문단**으로 분리
4. 각 문단마다 다음 형식으로 출력하세요:
   - **제목**: (문단의 핵심 주제)
   - **원본 시작**: (해당 문단이 시작하는 텍스트 첫 30자)
   - **요약**: (핵심 정보를 5~10문장으로 요약. 수치, 금액, 기간 등 구체적 정보는 반드시 포함)

5. 핵심 수치(금액, 기간, 수량)는 절대 생략하지 마세요.

## 문서:
${doc.answer}

## 출력 (JSON 배열):
\`\`\`json
[
  {
    "title": "문단 제목",
    "originalStart": "원본 첫 30자...",
    "summary": "요약 내용 (5~10문장)..."
  },
  ...
]
\`\`\``;

    console.log('🤖 AI에게 문단 분리 요청 중...\n');

    try {
        const result = await callGemini(splitPrompt);

        console.log('========================================');
        console.log('📋 AI 분리 결과');
        console.log('========================================\n');

        // JSON 추출 시도
        const jsonMatch = result.match(/```json\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
            const paragraphs = JSON.parse(jsonMatch[1]);

            console.log(`✅ 총 ${paragraphs.length}개 문단으로 분리됨\n`);

            paragraphs.forEach((p, idx) => {
                console.log(`--- 문단 ${idx + 1} ---`);
                console.log(`📌 제목: ${p.title}`);
                console.log(`📝 시작: "${p.originalStart}..."`);
                console.log(`📄 요약: ${p.summary}`);
                console.log(`📏 요약 길이: ${p.summary.length}자`);
                console.log('');
            });

            // 통계
            const totalOriginal = doc.answer.length;
            const totalSummary = paragraphs.reduce((sum, p) => sum + p.summary.length, 0);
            const ratio = ((totalSummary / totalOriginal) * 100).toFixed(1);

            console.log('========================================');
            console.log('📊 통계');
            console.log('========================================');
            console.log(`원본 길이: ${totalOriginal.toLocaleString()}자`);
            console.log(`요약 총 길이: ${totalSummary.toLocaleString()}자`);
            console.log(`압축률: ${ratio}% (${(totalOriginal / totalSummary).toFixed(1)}배 압축)`);
            console.log(`문단 수: ${paragraphs.length}개`);

            // 결과 저장
            const outputPath = path.join(__dirname, 'test-paragraph-result.json');
            fs.writeFileSync(outputPath, JSON.stringify({
                docId: doc.id,
                docQuestion: doc.question,
                originalLength: totalOriginal,
                summaryLength: totalSummary,
                compressionRatio: ratio,
                paragraphCount: paragraphs.length,
                paragraphs: paragraphs
            }, null, 2), 'utf-8');

            console.log(`\n💾 결과 저장됨: ${outputPath}`);

        } else {
            console.log('⚠️ JSON 파싱 실패. 원본 결과:');
            console.log(result);
        }

    } catch (error) {
        console.error('❌ 에러:', error.message);
    }
}

testParagraphSplit();
