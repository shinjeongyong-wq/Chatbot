const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../data/notion/partners/pre-construction/interior.json'), 'utf-8'));

// queryPlan: "인테리어 파트너사 추천해줘"
const coreKW = ['인테리어', '파트너사', '추천', '업체'];
const expandKW = ['미용', '피부과', '성형외과', '디자인', '시공'];

console.log('=== 인테리어 파트너사 문서 스코어 분석 ===\n');
console.log('커트라인: 1.0500 (테스트 결과 기준)\n');

data.items.forEach((item, idx) => {
    const q = item.question || '';
    const answer = item.answer || '';
    const field = item.metadata?.field || '';
    const topic = item.metadata?.topic || '';
    const specs = (item.metadata?.specialties || []).join(',');
    const structCat = item.metadata?.structuredCategory || '';
    const text = (q + ' ' + answer + ' ' + field + ' ' + specs).toLowerCase();
    const question = q.toLowerCase();

    // 1) 핵심 키워드 매칭 (최대 +0.6)
    let coreHits = 0;
    const coreDetail = [];
    for (const kw of coreKW) {
        if (text.includes(kw)) {
            coreHits++;
            if (question.includes(kw)) coreHits += 0.5;
            coreDetail.push(kw + (question.includes(kw) ? '(Q+본문)' : '(본문만)'));
        }
    }
    const coreScore = Math.min((coreHits / coreKW.length) * 0.6, 0.6);

    // 2) 확장 키워드 매칭 (최대 +0.25)
    let expandHits = 0;
    const expandDetail = [];
    for (const kw of expandKW) {
        if (text.includes(kw)) { expandHits++; expandDetail.push(kw); }
    }
    const expandScore = Math.min((expandHits / expandKW.length) * 0.25, 0.25);

    // 3) 토픽 매칭 (+0.1)
    let topicScore = 0;
    if (field.toLowerCase().includes('인테리어') || question.includes('인테리어')) topicScore = 0.1;

    const baseScore = coreScore + expandScore + topicScore;

    // 4) smartSearchRaw 내 토픽 보너스 (+0.5)
    let topicBonus = 0;
    const itemTopic = (topic || '').toLowerCase();
    const itemField = (field || '').toLowerCase();
    if (itemTopic.includes('인테리어') || itemField.includes('인테리어')) topicBonus = 0.5;

    // 5) 파트너사 의도 보너스 (+0.2)
    const isPartnerItem = structCat === 'partners' || structCat.startsWith('partners');
    const partnerBonus = isPartnerItem ? 0.2 : 0;

    // 6) 진료과 보너스
    let specBonus = 0;
    if (specs.toLowerCase().includes('미용')) {
        specBonus = 0.2;
    } else {
        let matchCount = 0;
        const specKWs = ['미용', '피부과', '성형외과', '피부', '성형', '레이저', '보톡스', '필러', '리프팅', '울쎄라', '써마지'];
        for (const kw of specKWs) { if (text.includes(kw)) matchCount++; }
        if (matchCount > 0) specBonus = Math.min(matchCount * 0.05, 0.15);
    }

    const rawScore = baseScore + topicBonus + partnerBonus + specBonus;

    // 7) 진료과 민감 페널티 (partners 카테고리에서 미용 아닌 전공 → ×0.6)
    const hasSpec = (item.metadata?.specialties || []).length > 0;
    const matchesUser = (item.metadata?.specialties || []).some(s => s.toLowerCase() === '미용');
    const penalty = (hasSpec && !matchesUser) ? 0.6 : 1.0;
    const finalScore = rawScore * penalty;

    const pass = finalScore >= 1.05 ? '✅ PASS' : '❌ FAIL';

    console.log('─'.repeat(70));
    console.log(`[${idx + 1}] ${q} | specs=[${specs}]`);
    console.log(`  core=${coreScore.toFixed(3)} (hits=${coreHits}/${coreKW.length}: ${coreDetail.join(', ') || '없음'})`);
    console.log(`  expand=${expandScore.toFixed(3)} (hits=${expandHits}/${expandKW.length}: ${expandDetail.join(', ') || '없음'})`);
    console.log(`  topic=${topicScore.toFixed(2)} | topicBonus=${topicBonus.toFixed(1)} | partnerBonus=${partnerBonus.toFixed(1)} | specBonus=${specBonus.toFixed(2)}`);
    console.log(`  rawScore=${rawScore.toFixed(4)} × penalty=${penalty} = FINAL=${finalScore.toFixed(4)} → ${pass}`);
});
