// 짧은 단락 분석
const d = require('./compare-data.json');
const splits = d.items.filter(i => i.wasSplit);

console.log('=== 짧은 단락 (200자 미만) 분석 ===\n');

let totalShort = 0;
splits.forEach(item => {
    const shorts = item.paragraphs.filter(p => p.length < 200);
    if (shorts.length > 0) {
        totalShort += shorts.length;
        console.log(`📄 ${item.file} (${item.paragraphs.length}개 단락)`);
        shorts.forEach(p => {
            console.log(`  ⚠️ [${p.length}자] "${p.paragraphTitle}"`);
        });
    }
});

console.log(`\n총 짧은 단락: ${totalShort}개`);

// 전체 단락 길이 분포
const allLens = [];
splits.forEach(item => {
    item.paragraphs.forEach(p => allLens.push(p.length));
});
allLens.sort((a, b) => a - b);

console.log('\n=== 단락 길이 분포 ===');
console.log(`  ~100자: ${allLens.filter(l => l <= 100).length}개`);
console.log(`  100~300자: ${allLens.filter(l => l > 100 && l <= 300).length}개`);
console.log(`  300~800자: ${allLens.filter(l => l > 300 && l <= 800).length}개`);
console.log(`  800~1500자: ${allLens.filter(l => l > 800 && l <= 1500).length}개`);
console.log(`  1500~3000자: ${allLens.filter(l => l > 1500 && l <= 3000).length}개`);
console.log(`  3000자+: ${allLens.filter(l => l > 3000).length}개`);
