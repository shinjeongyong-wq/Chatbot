const fs = require('fs');
const data = require('./data/qa/qna.json');
const items = data.items;

let output = '=== 기존 Q&A 데이터 분석 보고서 ===\n\n';

output += '## 1. 기본 통계\n';
output += '총 Q&A 수: ' + items.length + '개\n\n';

// field(분야) 분석
const fields = {};
items.forEach(item => {
    const field = item.metadata?.field || '미분류';
    fields[field] = (fields[field] || 0) + 1;
});
output += '## 2. 분야별 분포\n';
Object.entries(fields).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    output += k + ': ' + v + '개\n';
});

// category 분석
const categories = {};
items.forEach(item => {
    const cat = item.metadata?.category || '미분류';
    categories[cat] = (categories[cat] || 0) + 1;
});
output += '\n## 3. 카테고리별 분포\n';
Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => {
    output += k + ': ' + v + '개\n';
});

// 질문 패턴
output += '\n## 4. 질문 유형 분석\n';
const patterns = {
    '추천/선택형': items.filter(i => /추천|어떤|선택|좋을까|어디가|뭐가/.test(i.question)).length,
    '비용/가격형': items.filter(i => /비용|가격|얼마|견적|예산/.test(i.question)).length,
    '방법/절차형': items.filter(i => /어떻게|방법|절차|과정|하려면/.test(i.question)).length,
    '문제/해결형': items.filter(i => /문제|해결|안되|못|오류|실패/.test(i.question)).length,
    '필요/필수형': items.filter(i => /필요|필수|해야|반드시/.test(i.question)).length
};
Object.entries(patterns).forEach(([k, v]) => {
    output += k + ': ' + v + '개\n';
});

// 샘플 Q&A
output += '\n## 5. 샘플 Q&A (분야별 각 3개)\n\n';
const sampleFields = ['인테리어', '간판', '마케팅', '홈페이지', '의료기기'];
sampleFields.forEach(f => {
    const samples = items.filter(i => i.metadata?.field === f).slice(0, 3);
    if (samples.length > 0) {
        output += '### ' + f + '\n';
        samples.forEach((s, idx) => {
            output += (idx + 1) + '. Q: ' + s.question + '\n';
            output += '   A: ' + s.answer.substring(0, 200) + '...\n';
            output += '   카테고리: ' + s.metadata?.category + '\n\n';
        });
    }
});

// 질문 형식 분석
output += '\n## 6. 질문 형식 특징\n';
output += '- 의문문 형태 (~할까요?, ~인가요?, ~해야 하나요?)\n';
output += '- 구체적인 상황 설명 + 질문 형태\n';
output += '- 전문 용어 사용 (체어, 유닛, CT, MRI 등)\n';

output += '\n## 7. 답변 형식 특징\n';
output += '- 평균 답변 길이: ' + Math.round(items.map(i => i.answer.length).reduce((a, b) => a + b, 0) / items.length) + '자\n';
output += '- 구체적인 수치, 사례, 솔루션 제시\n';
output += '- 전문적이면서도 친근한 어조 (~해요, ~입니다)\n';

fs.writeFileSync('qa-analysis-report.txt', output, 'utf8');
console.log('분석 보고서 저장 완료: qa-analysis-report.txt');
