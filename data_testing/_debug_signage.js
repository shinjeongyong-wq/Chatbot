const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/notion/partners/pre-construction/signage.json'), 'utf-8'));

const coreKW = ['간판', '파트너사', '추천', '업체'];
const expandKW = ['사인물', '시인성', '가시성', '네온', '조명'];

console.log('=== 간판 파트너사 스코어 (진료과 제거 후) ===\n');

data.items.forEach((item, idx) => {
    const q = item.question || '';
    const answer = item.answer || '';
    const field = item.metadata?.field || '';
    const topic = item.metadata?.topic || '';
    const specs = (item.metadata?.specialties || []).join(',');
    const text = (q + ' ' + answer + ' ' + field + ' ' + specs).toLowerCase();
    const question = q.toLowerCase();

    let coreHits = 0;
    const coreDetail = [];
    for (const kw of coreKW) {
        if (text.includes(kw)) {
            coreHits++;
            if (question.includes(kw)) coreHits += 0.5;
            coreDetail.push(kw + (question.includes(kw) ? '(Q)' : '(본문)'));
        }
    }
    const coreScore = Math.min((coreHits / coreKW.length) * 0.6, 0.6);

    let expandHits = 0;
    for (const kw of expandKW) { if (text.includes(kw)) expandHits++; }
    const expandScore = Math.min((expandHits / expandKW.length) * 0.25, 0.25);

    let topicScore = 0;
    if (field.toLowerCase().includes('간판') || question.includes('간판')) topicScore = 0.1;

    const itemTopic = (topic || '').toLowerCase();
    const itemField = (field || '').toLowerCase();
    let topicBonus = (itemTopic.includes('간판') || itemField.includes('간판')) ? 0.5 : 0;
    const partnerBonus = 0.2;

    const total = coreScore + expandScore + topicScore + topicBonus + partnerBonus;
    const tier = item.metadata?.tier || '-';

    console.log(`T${tier} ${q.substring(0, 25).padEnd(28)} | core=${coreScore.toFixed(3)}(${coreDetail.join(',')}) exp=${expandScore.toFixed(3)} topic=${topicScore.toFixed(1)} tB=${topicBonus.toFixed(1)} pB=${partnerBonus.toFixed(1)} = ${total.toFixed(4)}`);
});
