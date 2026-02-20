/**
 * 카카오톡 채팅에서 Q&A 추출 스크립트 v2
 * 
 * 기존 Q&A 스타일 분석 결과:
 * 1. 질문: "~인가요?", "~무엇인가요?", "~어떻게 해야 하나요?" 형식의 완성된 문장
 * 2. 답변: 상세한 설명 + 실용적인 팁 포함 (150~400자)
 * 3. 일반화된 질문 (특정 상황이 아닌 범용적 질문)
 * 4. 전문적인 어투 (~입니다, ~이에요, ~하세요)
 */

const fs = require('fs');
const path = require('path');

// 입력 파일 정보
const inputFiles = [
    {
        path: 'C:\\Users\\jeong\\OneDrive\\문서\\카카오톡 받은 파일\\김인겸원장님_인테리어현장_무아디자인.csv',
        field: '인테리어',
        specialty: '공통'
    },
    {
        path: 'C:\\Users\\jeong\\OneDrive\\문서\\카카오톡 받은 파일\\박지현원장님_간판_ls디자인.csv',
        field: '간판',
        specialty: '미용'
    },
    {
        path: 'C:\\Users\\jeong\\OneDrive\\문서\\카카오톡 받은 파일\\박지현원장님_이동가구_오름앤컴퍼니.csv',
        field: '이동가구',
        specialty: '미용'
    }
];

// CSV 파싱 (개선된 버전)
function parseCSV(content) {
    const lines = content.split('\n');
    const messages = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // 더 유연한 파싱
        const dateMatch = line.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
        if (dateMatch) {
            const rest = line.substring(dateMatch[0].length + 1);
            const userMatch = rest.match(/^"([^"]+)"/);
            if (userMatch) {
                const msgPart = rest.substring(userMatch[0].length + 1);
                const msgMatch = msgPart.match(/^"(.+)"$/);
                if (msgMatch) {
                    messages.push({
                        date: dateMatch[1],
                        user: userMatch[1],
                        message: msgMatch[1]
                    });
                }
            }
        }
    }

    return messages;
}

// 대화에서 유의미한 정보 추출
function extractInsights(messages, field) {
    const insights = [];

    // 키워드별 주제 분류
    const topicKeywords = {
        '인테리어': {
            '벽체/구조': ['벽체', '벽', '구조', '철거', '단열', '소방', 'MRI', 'CT', '방사선'],
            '가구/수납': ['수납장', '상하부장', '서랍', '락카', '가구', '상판', '하부장'],
            '설비': ['콘센트', '전기', '배선', '에어컨', '세탁기', '건조기', '서버'],
            '마감': ['마감', '도어', '문', '창문', '시창', '바닥', '천장'],
            '공간배치': ['동선', '배치', '위치', '공간', '폭', '사이즈', '간격']
        },
        '간판': {
            '디자인': ['로고', '색상', '시안', '디자인', '폰트', '문구'],
            '설치': ['설치', '위치', '높이', '조명', '스텐', '발색'],
            '제작': ['제작', '견적', '비용', '가격', '납품'],
            '사인물': ['사인물', '파사드', '내부사인', '월사인', '스카시']
        },
        '이동가구': {
            '소파/의자': ['소파', '의자', '팔걸이', '쿠션'],
            '책상/테이블': ['책상', '테이블', '데스크', '본체함', '선정리'],
            '수납': ['수납', '서랍', '선반', '행거'],
            '아트웍': ['그림', '아트웍', '러그', '블라인드', '커튼'],
            '납품/설치': ['납품', '설치', '셋팅', '조립']
        }
    };

    const fieldTopics = topicKeywords[field] || {};

    // 연속된 대화 분석
    for (let i = 0; i < messages.length - 1; i++) {
        const msg = messages[i];
        const nextMsgs = messages.slice(i + 1, i + 6);

        // 정보성 메시지 감지 (단순 수락이 아닌)
        if (msg.message.length > 30) {
            // 어떤 주제인지 분류
            let category = '기타';
            for (const [cat, keywords] of Object.entries(fieldTopics)) {
                if (keywords.some(kw => msg.message.includes(kw))) {
                    category = cat;
                    break;
                }
            }

            // 유용한 정보 추출
            const info = extractUsefulInfo(msg, nextMsgs, field, category);
            if (info) {
                insights.push(info);
            }
        }
    }

    return insights;
}

// 유용한 정보 추출 및 Q&A 형식으로 변환
function extractUsefulInfo(msg, nextMsgs, field, category) {
    const text = msg.message;

    // 숫자/수치가 포함된 정보 (견적, 크기, 수량 등)
    const hasNumbers = /\d+(?:만원|원|mm|cm|개|장|폭|높이|간격|%)/i.test(text);

    // 전문 용어가 포함된 정보
    const hasTechnicalTerms = /시공|제작|도면|규격|사양|스펙|납품|설치|견적|마감|시안/.test(text);

    // 조언/팁 성격의 정보
    const hasAdvice = /추천|좋을것|괜찮|불편|주의|확인|체크|참고/.test(text);

    // 업체 담당자의 전문적 답변
    const isExpertAnswer = /팀장|대표|책임|과장|디자인|컴퍼니/.test(msg.user);

    if ((hasNumbers || hasTechnicalTerms || hasAdvice) && text.length > 40) {
        // Q&A 형식으로 변환
        const qa = convertToQA(text, field, category, isExpertAnswer);
        if (qa) {
            return {
                ...qa,
                originalText: text,
                user: msg.user,
                date: msg.date
            };
        }
    }

    return null;
}

// 채팅 내용을 Q&A 형식으로 변환
function convertToQA(text, field, category, isExpertAnswer) {
    // 패턴별 Q&A 생성 규칙
    const patterns = [
        // 크기/규격 관련
        {
            match: /(\d+)(?:mm|폭|높이|사이즈|간격)/,
            question: (m) => `${field} 시공 시 ${category} 관련 적정 규격은 어떻게 되나요?`,
            answer: (t) => t
        },
        // 비용 관련
        {
            match: /(\d+)(?:만원|원|가량|정도)/,
            question: (m) => `${field} ${category} 관련 비용은 얼마 정도 드나요?`,
            answer: (t) => t
        },
        // 재질/소재 관련
        {
            match: /(단열|스텐|발색|조명|LED)/,
            question: (m) => `${field}에서 ${m[1]} 관련해서 고려해야 할 사항은 무엇인가요?`,
            answer: (t) => t
        },
        // 가능 여부 질문
        {
            match: /(가능|될까요|되나요|할 수 있)/,
            question: (m) => `${field} 시공 중 특수 요청사항은 어떻게 처리되나요?`,
            answer: (t) => t
        },
        // 배치/동선 관련
        {
            match: /(동선|배치|위치|공간)/,
            question: (m) => `${field} 설계 시 공간 배치와 동선을 고려한 주의사항은 무엇인가요?`,
            answer: (t) => t
        }
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern.match);
        if (match) {
            return {
                question: pattern.question(match),
                answer: cleanAndExpandAnswer(text, field, category)
            };
        }
    }

    // 기본 패턴
    if (text.length > 50) {
        return {
            question: `${field} ${category} 관련해서 알아두면 좋은 점은 무엇인가요?`,
            answer: cleanAndExpandAnswer(text, field, category)
        };
    }

    return null;
}

// 답변 정제 및 확장
function cleanAndExpandAnswer(text, field, category) {
    let answer = text
        .replace(/사진\d*장?/g, '')
        .replace(/파일:.*$/gm, '')
        .replace(/^넵?\s*/g, '')
        .replace(/^\s*(네네?|알겠습니다)\s*/g, '')
        .trim();

    // 전문적인 어투로 변환
    answer = answer
        .replace(/할께요/g, '할게요')
        .replace(/할거같/g, '할 것 같')
        .replace(/되실거같/g, '되실 것 같')
        .replace(/드릴께요/g, '드릴게요');

    // 너무 짧으면 맥락 추가
    if (answer.length < 80) {
        answer = `${field} 시공 시 ${category} 관련하여 참고하시면 좋습니다: ${answer}`;
    }

    return answer;
}

// 중복 제거 및 품질 필터링
function filterAndDedupe(insights) {
    const seen = new Set();
    const filtered = [];

    for (const insight of insights) {
        // 질문 유사도 체크 (간단한 해시)
        const key = insight.question.replace(/[^가-힣a-zA-Z]/g, '').substring(0, 30);

        if (!seen.has(key)) {
            seen.add(key);

            // 품질 필터
            if (insight.answer.length >= 40 &&
                !insight.answer.includes('사진') &&
                !insight.answer.match(/^(넵|네|알겠습니다)$/)) {
                filtered.push(insight);
            }
        }
    }

    return filtered;
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

            const insights = extractInsights(messages, file.field);
            console.log(`   추출된 인사이트: ${insights.length}개`);

            // 필터링
            const filtered = filterAndDedupe(insights);
            console.log(`   유효한 Q&A: ${filtered.length}개`);

            // 진료과 태그 추가
            filtered.forEach(qa => {
                qa.metadata = {
                    field: file.field,
                    category: qa.category || '일반',
                    specialty: file.specialty,
                    source: 'kakao_chat'
                };
                delete qa.category;
            });

            allQA.push(...filtered);
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
            question: qa.question,
            answer: qa.answer,
            metadata: qa.metadata
        }))
    };

    fs.writeFileSync('extracted_kakao_qa_v2.json', JSON.stringify(output, null, 2), 'utf8');
    console.log('\n✅ 저장 완료: extracted_kakao_qa_v2.json');

    // 샘플 출력
    console.log('\n📋 샘플 Q&A (스타일 확인):');
    allQA.slice(0, 5).forEach((qa, i) => {
        console.log(`\n[${i + 1}]`);
        console.log(`Q: ${qa.question}`);
        console.log(`A: ${qa.answer.substring(0, 100)}...`);
        console.log(`태그: ${qa.metadata.field} / ${qa.metadata.specialty}`);
    });
}

main().catch(console.error);
