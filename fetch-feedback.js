/**
 * 피드백 데이터 수집 스크립트 (v3 - Supabase)
 * - Supabase에서 미처리 피드백을 가져와서 콘솔 출력 + JSON 파일 저장
 * - _feedback_data.json으로 프로그래밍적 파싱 지원
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// .env 파일에서 환경변수 읽기
function loadEnv() {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf-8');
        content.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        });
    }
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ SUPABASE_URL 또는 SUPABASE_ANON_KEY가 설정되지 않았습니다.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchFeedbackData() {
    try {
        console.log('📥 Supabase에서 피드백 데이터 가져오는 중...\n');

        // 처리되지 않은 피드백 조회
        const { data: feedbacks, error } = await supabase
            .from('feedback')
            .select('*')
            .is('processed', null)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('❌ 조회 오류:', error.message);
            process.exit(1);
        }

        if (!feedbacks || feedbacks.length === 0) {
            console.log('ℹ️ 처리할 피드백이 없습니다.');
            // 빈 배열로 파일 저장
            fs.writeFileSync('_feedback_data.json', JSON.stringify([], null, 2), 'utf8');
            console.log('📁 _feedback_data.json 저장 (빈 배열)');
            process.exit(0);
        }

        console.log(`✅ ${feedbacks.length}개 피드백 수집 완료!\n`);
        console.log('='.repeat(80));

        feedbacks.forEach((fb, idx) => {
            console.log(`\n📋 피드백 #${idx + 1} (ID: ${fb.id})`);
            console.log('-'.repeat(40));
            console.log(`  ⭐ 타입: ${fb.type}`);
            console.log(`  ❓ 질문: ${fb.question || '(없음)'}`);
            console.log(`  💬 답변: ${(fb.answer || '').substring(0, 100)}...`);
            console.log(`  📝 상세: ${fb.content || '(없음)'}`);
            console.log(`  🧠 맥락: ${(fb.context_prompt || '').substring(0, 50)}...`);
            console.log(`  👤 사용자: ${fb.user_name || '(없음)'} / ${fb.specialty || '(없음)'}`);
            console.log(`  🔍 search_log: ${fb.search_log ? '있음' : '없음'}`);
            console.log(`  ⏰ 시간: ${fb.created_at}`);
        });

        console.log('\n' + '='.repeat(80));
        console.log('\n📊 요약:');

        const goodCount = feedbacks.filter(fb => fb.type === 'Good').length;
        const badCount = feedbacks.filter(fb => fb.type === 'Bad').length;
        const withLog = feedbacks.filter(fb => fb.search_log).length;

        console.log(`  👍 Good: ${goodCount}개`);
        console.log(`  👎 Bad: ${badCount}개`);
        console.log(`  🔍 search_log 포함: ${withLog}개`);

        // JSON 파일로 저장
        fs.writeFileSync('_feedback_data.json', JSON.stringify(feedbacks, null, 2), 'utf8');
        console.log(`\n📁 _feedback_data.json 저장 완료 (${feedbacks.length}개)`);

        return feedbacks;

    } catch (error) {
        console.error('❌ 데이터 수집 실패:', error.message);
        process.exit(1);
    }
}

// 피드백 처리 완료 표시
async function markFeedbacksAsProcessed(feedbackIds) {
    try {
        const { error } = await supabase
            .from('feedback')
            .update({ processed: true })
            .in('id', feedbackIds);

        if (error) {
            console.error('❌ 처리 완료 표시 실패:', error.message);
            return false;
        }

        console.log(`✅ ${feedbackIds.length}개 피드백 처리 완료로 표시됨`);
        return true;

    } catch (error) {
        console.error('❌ 처리 완료 표시 오류:', error.message);
        return false;
    }
}

// 직접 실행 시
if (require.main === module) {
    fetchFeedbackData();
}

module.exports = { fetchFeedbackData, markFeedbacksAsProcessed };
