const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./topics_shortened.json', 'utf-8'));

console.log('=== topics_shortened.json 테스트 ===\n');
console.log('총 주제 수:', data.length);

// 15자 초과 확인
const over15 = data.filter(t => t.shortened.length > 15);
console.log('15자 초과:', over15.length, '개');

// 샘플 출력
console.log('\n--- 축약 샘플 (랜덤 10개) ---');
const samples = data.sort(() => Math.random() - 0.5).slice(0, 10);
samples.forEach(t => {
    console.log('[' + t.id + '] "' + t.shortened + '" (' + t.shortened.length + '자)');
});

// AI 프롬프트에 전달될 형태 시뮬레이션
console.log('\n--- AI 시스템 프롬프트 형식 ---');
const anchorTopics = data.map(item => ({ id: item.id, question: item.shortened }));
const topicList = anchorTopics.slice(0, 10).map(t => '- ' + t.question).join('\n');
console.log('[사용 가능한 주제 목록 - 샘플 10개]');
console.log(topicList);

console.log('\n✅ 테스트 완료!');
