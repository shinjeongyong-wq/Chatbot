/**
 * Summary Cache Test Script
 * 터미널에서 요약 캐싱 기능 테스트
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase 설정
const SUPABASE_URL = 'https://ebigoqusvopbmmutypgd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImViaWdvcXVzdm9wYm1tdXR5cGdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1ODA5OTcsImV4cCI6MjA4NTE1Njk5N30.DHXJ3Fgdok01PKkmuhz2IB3ego03M3YWiYtfNObLtKM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testSummaryCaching() {
    console.log('========================================');
    console.log('📦 Summary Cache Test');
    console.log('========================================\n');

    // 1. 테스트용 세션 ID 가져오기 (가장 최근 세션)
    console.log('1️⃣ 세션 조회...');
    const { data: sessions, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('id, title')
        .order('created_at', { ascending: false })
        .limit(1);

    if (sessionError) {
        console.error('❌ 세션 조회 에러:', sessionError);
        return;
    }

    if (!sessions || sessions.length === 0) {
        console.error('❌ 세션이 없습니다. 먼저 챗봇에 로그인하세요.');
        return;
    }

    const testSessionId = sessions[0].id;
    console.log('✅ 테스트 세션:', testSessionId, '-', sessions[0].title);

    // 2. 테스트 요약 데이터 생성
    console.log('\n2️⃣ 테스트 요약 저장 시도...');
    const testDoc = {
        session_id: testSessionId,
        doc_id: 'test-doc-001',
        doc_source: 'qa',
        original_question: '인테리어 비용이 얼마나 드나요?',
        original_length: 1500,
        summary: '병원 인테리어 비용은 평당 150~250만원 수준입니다. 70평 기준 약 1억~1.75억원이 소요됩니다.',
        summary_length: 60
    };

    const { error: insertError } = await supabase
        .from('session_doc_summaries')
        .upsert(testDoc, { onConflict: 'session_id,doc_id' });

    if (insertError) {
        console.error('❌ 저장 에러:', insertError);
        return;
    }

    console.log('✅ 테스트 요약 저장 완료!');

    // 3. 저장된 데이터 확인
    console.log('\n3️⃣ 저장된 데이터 확인...');
    const { data: savedData, error: selectError } = await supabase
        .from('session_doc_summaries')
        .select('*')
        .eq('session_id', testSessionId);

    if (selectError) {
        console.error('❌ 조회 에러:', selectError);
        return;
    }

    console.log('✅ 저장된 데이터:', savedData.length, '개');
    savedData.forEach((row, idx) => {
        console.log(`   [${idx + 1}] ${row.doc_id}: ${row.summary.substring(0, 50)}...`);
    });

    // 4. /api/summarize 테스트
    console.log('\n4️⃣ /api/summarize API 테스트...');
    try {
        const response = await fetch('http://localhost:3002/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: '다음 문장을 요약해주세요: 병원 개원 시 인테리어 비용은 평당 150~250만원 수준이며, 70평 기준 약 1억~1.75억원이 소요됩니다. 공사 기간은 보통 6~7주 정도 걸립니다.'
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API 에러:', response.status, errorText);
            return;
        }

        const result = await response.json();
        console.log('✅ API 응답:', result.summary);
    } catch (err) {
        console.error('❌ API 호출 실패:', err.message);
    }

    console.log('\n========================================');
    console.log('✅ 테스트 완료!');
    console.log('========================================');
}

testSummaryCaching();
