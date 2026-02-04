/**
 * 피드백 데이터 수집 스크립트
 * GAS에서 피드백 데이터를 가져와서 분석용으로 출력
 */

const fs = require('fs');
const path = require('path');

// .env.local 파일에서 환경변수 읽기
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

const GAS_URL = process.env.GOOGLE_APPS_SCRIPT_URL;

async function fetchFeedbackData() {
    if (!GAS_URL) {
        console.error('❌ GOOGLE_APPS_SCRIPT_URL 환경변수가 설정되지 않았습니다.');
        process.exit(1);
    }

    try {
        console.log('📥 피드백 데이터 가져오는 중...\n');

        const response = await fetch(`${GAS_URL}?action=getFeedback`);
        const result = await response.json();

        if (!result.success) {
            console.error('❌ 오류:', result.error);
            process.exit(1);
        }

        if (result.data.length === 0) {
            console.log('ℹ️ 새 피드백이 없습니다.');
            process.exit(0);
        }

        console.log(`✅ ${result.data.length}개 피드백 수집 완료 (행 ${result.startRow} ~ ${result.endRow})\n`);
        console.log('='.repeat(80));

        result.data.forEach((fb, idx) => {
            console.log(`\n📋 피드백 #${idx + 1} (행 ${fb.rowNum})`);
            console.log('-'.repeat(40));
            console.log(`  ⭐ 타입: ${fb.type}`);
            console.log(`  ❓ 질문: ${fb.question || '(없음)'}`);
            console.log(`  💬 답변: ${(fb.answer || '').substring(0, 100)}...`);
            console.log(`  📝 상세: ${fb.content || '(없음)'}`);
            console.log(`  🧠 맥락: ${(fb.contextPrompt || '').substring(0, 50)}...`);
            console.log(`  👤 사용자: ${fb.userName || '(없음)'} / ${fb.specialty || '(없음)'}`);
            console.log(`  ⏰ 시간: ${fb.timestamp}`);
        });

        console.log('\n' + '='.repeat(80));
        console.log('\n📊 요약:');

        const goodCount = result.data.filter(fb => fb.type === 'Good').length;
        const badCount = result.data.filter(fb => fb.type === 'Bad').length;

        console.log(`  👍 Good: ${goodCount}개`);
        console.log(`  👎 Bad: ${badCount}개`);

        // JSON 형태로도 출력 (분석용)
        console.log('\n\n📦 JSON 데이터:');
        console.log(JSON.stringify(result.data, null, 2));

    } catch (error) {
        console.error('❌ 데이터 수집 실패:', error.message);
        process.exit(1);
    }
}

fetchFeedbackData();
