const results = require('./topics_shortened.json');
const topics = require('./data/topics.json');

// 통계
console.log('=== 최종 결과 ===');
console.log('');
console.log('총 주제 개수:', topics.topics.length, '개');
console.log('  - 15자 이하 (유지):', topics.topics.length - results.length, '개');
console.log('  - 15자 초과 → 축약:', results.length, '개');
console.log('');

// 축약 예시 30개
console.log('=== 원본 → 축약본 예시 30개 ===');
console.log('');

// 다양한 패턴 보여주기 위해 랜덤하게 선택
const samples = [];
for (let i = 0; i < results.length; i += Math.floor(results.length / 30)) {
    samples.push(results[i]);
}

samples.slice(0, 30).forEach((r, i) => {
    console.log((i + 1) + '.');
    console.log('   원본: ' + r.original + ' (' + r.originalLen + '자)');
    console.log('   축약: ' + r.shortened + ' (' + r.shortenedLen + '자)');
    console.log('');
});
