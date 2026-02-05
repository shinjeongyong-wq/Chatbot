// topics_shortened.json 완성 스크립트
const fs = require('fs');

// 1. 원본 topics.json 로드
const topicsData = JSON.parse(fs.readFileSync('./data/topics.json', 'utf-8'));
const allTopics = topicsData.topics;

// 2. 사용자가 제공한 축약 주제 로드 (순서대로)
const userShortened = fs.readFileSync('./user_shortened_topics.txt', 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

console.log(`원본 주제 수: ${allTopics.length}`);
console.log(`사용자 축약 주제 수: ${userShortened.length}`);

// 3. 기존 topics_shortened.json 로드 (15자 초과인 것들의 ID 순서)
const existingShortened = JSON.parse(fs.readFileSync('./topics_shortened.json', 'utf-8'));

console.log(`기존 축약 파일 항목 수: ${existingShortened.length}`);

// 4. 사용자 축약 주제를 ID 순서대로 매핑
const shortenedMap = {};
existingShortened.forEach((item, index) => {
    if (index < userShortened.length) {
        shortenedMap[item.id] = userShortened[index];
    }
});

// 5. 최종 topics_shortened.json 생성 (835개 전체)
const finalShortened = allTopics.map(topic => {
    const shortened = shortenedMap[topic.id] || topic.question;
    return {
        id: topic.id,
        original: topic.question,
        shortened: shortened,
        originalLen: topic.question.length,
        shortenedLen: shortened.length
    };
});

// 6. 저장
fs.writeFileSync('./topics_shortened.json', JSON.stringify(finalShortened, null, 2), 'utf-8');

console.log(`\n✅ 최종 topics_shortened.json 생성 완료: ${finalShortened.length}개 주제`);

// 7. 15자 초과 확인
const over15 = finalShortened.filter(t => t.shortenedLen > 15);
console.log(`15자 초과: ${over15.length}개`);
if (over15.length > 0) {
    console.log('15자 초과 예시:');
    over15.slice(0, 5).forEach(t => {
        console.log(`  ID ${t.id}: "${t.shortened}" (${t.shortenedLen}자)`);
    });
}
