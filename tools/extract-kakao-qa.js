/**
 * 카카오톡 채팅에서 Q&A 추출 스크립트
 * 진료과 태그: 미용, 치과, 통증, 내과, 공통
 */

const fs = require('fs');
const path = require('path');

// 입력 파일 정보 (파일명에서 진료과 추론)
const inputFiles = [
    {
        path: 'C:\\Users\\jeong\\OneDrive\\문서\\카카오톡 받은 파일\\김인겸원장님_인테리어현장_무아디자인.csv',
        field: '인테리어',
        specialty: '공통'  // 인테리어는 모든 진료과 공통
    },
    {
        path: 'C:\\Users\\jeong\\OneDrive\\문서\\카카오톡 받은 파일\\박지현원장님_간판_ls디자인.csv',
        field: '간판',
        specialty: '미용'  // 레지움 피부과 = 미용
    },
    {
        path: 'C:\\Users\\jeong\\OneDrive\\문서\\카카오톡 받은 파일\\박지현원장님_이동가구_오름앤컴퍼니.csv',
        field: '가구',
        specialty: '미용'  // 레지움 피부과 = 미용
    }
];

// CSV 파싱
function parseCSV(content) {
    const lines = content.split('\n');
    const messages = [];

    // 헤더 스킵
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // CSV 파싱 (Date,User,Message 형식)
        const match = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),"([^"]+)","(.+)"$/);
        if (match) {
            messages.push({
                date: match[1],
                user: match[2],
                message: match[3]
            });
        }
    }

    return messages;
}

// Q&A 추출 (질문 패턴 감지)
function extractQA(messages, field, specialty) {
    const qaList = [];

    // 질문 패턴
    const questionPatterns = [
        /\?$/,                           // 물음표로 끝남
        /어떻게|어떤가요|어떨까요/,
        /가능한가요|가능할까요|될까요/,
        /있을까요|없을까요/,
        /맞나요|맞을까요/,
        /몇|얼마나|언제/,
        /혹시.*인가요/,
        /부탁드립니다|부탁드려요/,
        /알려주실|알려주세요/,
        /확인.*부탁/,
    ];

    // 답변자 패턴 (업체 담당자)
    const responderPatterns = [
        /팀장|대표|책임|과장/,
        /무아디자인|ls디자인|오름앤컴퍼니/i
    ];

    // 질문자 패턴 (원장님, 플래너)
    const askerPatterns = [
        /원장님/,
        /지수|Ji One/
    ];

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];

        // 질문인지 확인
        const isQuestion = questionPatterns.some(p => p.test(msg.message));
        const isAsker = askerPatterns.some(p => p.test(msg.user));

        if (isQuestion && isAsker && msg.message.length > 10) {
            // 다음 메시지들에서 답변 찾기
            for (let j = i + 1; j < Math.min(i + 5, messages.length); j++) {
                const reply = messages[j];
                const isResponder = responderPatterns.some(p => p.test(reply.user));

                if (isResponder && reply.message.length > 5 && !reply.message.includes('사진')) {
                    // Q&A 쌍 발견
                    qaList.push({
                        question: cleanQuestion(msg.message),
                        answer: cleanAnswer(reply.message),
                        metadata: {
                            field: field,
                            specialty: specialty,
                            source: 'kakao',
                            asker: msg.user,
                            responder: reply.user,
                            date: msg.date
                        }
                    });
                    break;
                }
            }
        }
    }

    return qaList;
}

// 질문 정제
function cleanQuestion(text) {
    return text
        .replace(/사진\d*장?/g, '')
        .replace(/파일:.*$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// 답변 정제
function cleanAnswer(text) {
    return text
        .replace(/사진\d*장?/g, '')
        .replace(/파일:.*$/g, '')
        .replace(/네네?/g, '')
        .replace(/^\s*넵?\s*/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Q&A를 범용적으로 재구성 (특정 상황 → 일반화)
function generalizeQA(qa) {
    const { question, answer, metadata } = qa;

    // 너무 구체적인 것은 스킵
    if (question.length < 15 || answer.length < 10) return null;
    if (/\d+층|방금|어제|오늘|내일/.test(question) && question.length < 30) return null;

    return {
        question: question,
        answer: answer,
        metadata: metadata
    };
}

// 메인 실행
async function main() {
    const allQA = [];

    for (const file of inputFiles) {
        console.log(`\n📁 처리 중: ${path.basename(file.path)}`);

        try {
            const content = fs.readFileSync(file.path, 'utf8');
            const messages = parseCSV(content);
            console.log(`   메시지 수: ${messages.length}`);

            const qaList = extractQA(messages, file.field, file.specialty);
            console.log(`   추출된 Q&A: ${qaList.length}개`);

            // 일반화 및 필터링
            const generalizedQA = qaList
                .map(generalizeQA)
                .filter(qa => qa !== null);

            console.log(`   유효한 Q&A: ${generalizedQA.length}개`);

            allQA.push(...generalizedQA);
        } catch (error) {
            console.error(`   에러: ${error.message}`);
        }
    }

    // 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log(`📊 총 ${allQA.length}개 Q&A 추출 완료`);
    console.log('='.repeat(60));

    // JSON 저장
    const output = {
        source: 'kakao_chat',
        extractedAt: new Date().toISOString(),
        count: allQA.length,
        items: allQA.map((qa, idx) => ({
            id: `kakao-${idx}`,
            ...qa
        }))
    };

    fs.writeFileSync('extracted_kakao_qa.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('\n✅ 저장 완료: extracted_kakao_qa.json');

    // 샘플 출력
    console.log('\n📋 샘플 Q&A:');
    allQA.slice(0, 5).forEach((qa, i) => {
        console.log(`\n[${i + 1}] Q: ${qa.question.substring(0, 50)}...`);
        console.log(`    A: ${qa.answer.substring(0, 50)}...`);
        console.log(`    태그: ${qa.metadata.field} / ${qa.metadata.specialty}`);
    });
}

main().catch(console.error);
