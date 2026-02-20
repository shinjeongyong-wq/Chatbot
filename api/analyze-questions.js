/**
 * 질문 분석 Cron Job (매일 자정 KST 자동 실행)
 * 
 * 1. Supabase에서 유저 질문 전체 조회
 * 2. Gemini 2.5 Flash로 인기 키워드 + 자주 묻는 질문 추출
 * 3. 결과를 daily_analytics 테이블에 저장
 */

const { supabase } = require('../lib/supabase');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        console.log('📊 질문 분석 시작...');

        // 1. Supabase에서 유저 질문 조회
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('content, created_at')
            .eq('role', 'user')
            .order('created_at', { ascending: false });

        if (msgError) {
            throw new Error(`메시지 조회 실패: ${msgError.message}`);
        }

        if (!messages || messages.length === 0) {
            return res.status(200).json({
                success: true,
                message: '분석할 질문이 없습니다.',
                total: 0
            });
        }

        console.log(`📝 총 ${messages.length}개 유저 질문 조회 완료`);

        // 2. 유저별 통계도 조회
        const { data: userStats, error: userError } = await supabase
            .from('users')
            .select('name, specialty');

        const { data: sessionStats, error: sessionError } = await supabase
            .from('chat_sessions')
            .select('id, created_at');

        // 3. 질문 목록을 텍스트로 변환 (최대 200개)
        const questionList = messages
            .slice(0, 200)
            .map((m, i) => `${i + 1}. ${m.content}`)
            .join('\n');

        // 4. Gemini 2.5 Flash 호출
        const prompt = `아래는 "병원 개원 상담 챗봇"에 들어온 사용자 질문 목록입니다.
이 질문들을 분석해서 아래 2가지를 JSON으로 뽑아주세요.

## 분석 요청

### 1. 인기 키워드 (popular_keywords)
- 질문들에서 자주 등장하는 핵심 주제 키워드를 추출하세요.
- 단순 조사/불용어(은/는/이/가/뭐/좀/해줘)는 제외하세요.
- 빈도(count)와 함께 상위 15개를 내림차순으로 정렬하세요.

### 2. 자주 묻는 질문 (frequent_questions)
- 의미가 유사한 질문들을 그룹으로 묶으세요.
- 각 그룹에 대표 질문(representative), 그룹에 속한 질문 수(count), 실제 질문 예시 3개(examples)를 포함하세요.
- 그룹 수가 가장 많은 순서로 상위 10개를 정렬하세요.
- 1~2건뿐인 그룹은 포함하지 마세요.

## 출력 형식 (반드시 이 JSON 형식으로만 응답)
\`\`\`json
{
  "popular_keywords": [
    {"keyword": "인테리어", "count": 23},
    {"keyword": "의료기기", "count": 18}
  ],
  "frequent_questions": [
    {
      "topic": "인테리어 비용",
      "representative": "인테리어 평당가는 얼마인가요?",
      "count": 15,
      "examples": ["인테리어 비용 알려줘", "평당가 얼마야?", "시공비 얼마 들어?"]
    }
  ]
}
\`\`\`

## 질문 목록 (총 ${messages.length}개 중 상위 ${Math.min(messages.length, 200)}개)
${questionList}`;

        let geminiResponse;
        try {
            geminiResponse = await fetch(GEMINI_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 4096
                        // ⚠️ responseMimeType: 'application/json' 제거
                        // Gemini 2.5 Flash에서 500 에러를 일으키는 known issue
                    }
                })
            });
        } catch (fetchErr) {
            console.error('❌ [DEBUG] Gemini fetch 자체 실패:', fetchErr.message);
            throw new Error(`Gemini API fetch 실패: ${fetchErr.message}`);
        }

        if (!geminiResponse.ok) {
            const errText = await geminiResponse.text();
            throw new Error(`Gemini API 오류 (${geminiResponse.status}): ${errText.substring(0, 500)}`);
        }

        let geminiData;
        try {
            geminiData = await geminiResponse.json();
        } catch (jsonErr) {
            const rawBody = await geminiResponse.text().catch(() => '(text도 실패)');
            console.error('❌ [DEBUG] Gemini 응답 JSON 파싱 실패:', rawBody.substring(0, 500));
            throw new Error(`Gemini 응답 body JSON 파싱 실패: ${rawBody.substring(0, 200)}`);
        }

        // ★ 디버그: 전체 응답 top-level 키 로깅
        console.log('🔍 [DEBUG] Gemini top-level keys:', Object.keys(geminiData));

        const allParts = geminiData.candidates?.[0]?.content?.parts || [];
        console.log('🔍 [DEBUG] Gemini 응답 구조:', JSON.stringify({
            hasCandidates: !!geminiData.candidates,
            candidatesLength: geminiData.candidates?.length || 0,
            partsLength: allParts.length,
            partsTypes: allParts.map((p, i) => ({
                index: i,
                hasText: !!p.text,
                textLength: p.text?.length || 0,
                textPreview: p.text?.substring(0, 100) || '(empty)',
                hasThought: !!p.thought
            })),
            finishReason: geminiData.candidates?.[0]?.finishReason,
            promptFeedback: geminiData.promptFeedback || null
        }, null, 2));

        // Gemini 2.5 Flash는 thinking + output 파트가 분리됨 → thought가 아닌 파트 찾기
        let rawText = '';
        for (let i = allParts.length - 1; i >= 0; i--) {
            if (!allParts[i].thought && allParts[i].text) {
                rawText = allParts[i].text;
                break;
            }
        }
        // fallback: 아무것도 못 찾으면 마지막 파트
        if (!rawText && allParts.length > 0) {
            rawText = allParts[allParts.length - 1].text || '';
        }

        console.log('🤖 Gemini 응답 수신 완료, rawText 길이:', rawText.length);
        console.log('🔍 [DEBUG] rawText 앞 300자:', rawText.substring(0, 300));

        // 5. JSON 파싱
        let analysisResult;
        try {
            // ```json ... ``` 블록 추출
            const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
            const jsonStr = jsonMatch ? jsonMatch[1] : rawText;
            analysisResult = JSON.parse(jsonStr.trim());
        } catch (parseError) {
            // JSON 파싱 실패 시 raw에서 재시도
            try {
                const fallbackMatch = rawText.match(/\{[\s\S]*\}/);
                if (fallbackMatch) {
                    analysisResult = JSON.parse(fallbackMatch[0]);
                } else {
                    throw parseError;
                }
            } catch {
                console.error('❌ JSON 파싱 실패:', rawText.substring(0, 500));
                // 디버그 정보를 에러 응답에 포함
                throw new Error(`Gemini 응답 JSON 파싱 실패 | rawText길이: ${rawText.length} | 앞100자: ${rawText.substring(0, 100)} | parts수: ${allParts.length} | finishReason: ${geminiData.candidates?.[0]?.finishReason || 'N/A'}`);
            }
        }

        // 6. Supabase에 저장 (오늘 날짜로 upsert)
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const { data: upsertData, error: upsertError } = await supabase
            .from('daily_analytics')
            .upsert({
                date: today,
                popular_keywords: analysisResult.popular_keywords || [],
                frequent_questions: analysisResult.frequent_questions || [],
                total_questions: messages.length
            }, { onConflict: 'date' })
            .select();

        if (upsertError) {
            throw new Error(`daily_analytics 저장 실패: ${upsertError.message}`);
        }

        console.log(`✅ 분석 완료! 날짜: ${today}, 질문 수: ${messages.length}`);

        return res.status(200).json({
            success: true,
            date: today,
            total_questions: messages.length,
            popular_keywords_count: (analysisResult.popular_keywords || []).length,
            frequent_questions_count: (analysisResult.frequent_questions || []).length,
            users: userStats?.length || 0,
            sessions: sessionStats?.length || 0
        });

    } catch (error) {
        console.error('❌ 질문 분석 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
