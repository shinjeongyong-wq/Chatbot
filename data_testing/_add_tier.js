/**
 * 파트너사 데이터에 tier 메타데이터 추가/제거 스크립트
 * 
 * 사용법:
 *   node data_testing/_add_tier.js add     → tier 추가
 *   node data_testing/_add_tier.js remove  → tier 제거
 */
const fs = require('fs');
const path = require('path');

// 구글 시트 기반 Tier 분류 (Winning Rate + 소개횟수 종합)
const TIER_MAP = {
    // ===== 인테리어 =====
    '무아디자인': 1,  // WR 57%, 계약4, 소개7
    '인투익스': 1,  // WR 50%, 계약2, 소개4
    '메이드바이': 1,  // WR 50%, 계약1, 소개2
    '톤앤무드': 2,  // WR 33%, 계약3, 소개9
    '네스트디자인': 2,  // WR 33%, 계약2, 소개6
    '플랜디자인': 3,  // WR 30%, 계약3, 소개10
    '아임디자인': 3,  // WR 20%, 계약2, 소개10
    '플럭스': 3,  // WR 10%, 계약1, 소개10
    '더 코나 메디스페이스': 3, // WR 0%, 계약0, 소개1
    'JWC그룹': 3,  // WR 0%, 계약0, 소개2
    '씨투와이': 3,  // 시트에 없음 → tier3
    '써드스페이스': 3,  // 시트에 없음 → tier3

    // ===== 간판 =====
    '지웍스': 1,  // WR 64%, 계약7, 소개11 → 시트 명칭
    'LS디자인': 1,  // WR 45%, 계약5, 소개11
    '디자인캐프': 1,  // WR 43%, 계약3, 소개7
    '더프라임': 2,  // WR 38%, 계약3, 소개8
    '디온에이(D.on.A)': 2,  // WR 25%, 계약1, 소개4
    '동부기업': 3,  // WR 0%, 계약0, 소개1

    // ===== 홈페이지 =====
    '원프레임': 1,  // WR 83%, 계약5, 소개6
    'YourDev:유어데브': 1,  // WR 78%, 계약7, 소개9
    'BUD': 1,  // WR 75%, 계약3, 소개4
    '파인애플피티엘': 2,  // WR 60%, 계약3, 소개5

    // ===== PC네트워크 =====
    '덴탈컴넷': 1,  // WR 78%, 계약7, 소개9
    '중앙정보기술': 1,  // WR 42%, 계약5, 소개12
    '덴앤택': 2,  // WR 100%, 계약1, 소개1 (소개 적음)

    // ===== 통신/보안 =====
    'KT (내부용)': 1,  // WR 100%, 계약6, 소개6
    'SK쉴더스(ADT캡스)': 1,  // WR 70%, 계약7, 소개10
    'LG U+': 2,  // 시트에 없음

    // ===== 가구 =====
    '루벨루테': 1,  // WR 75%, 계약3, 소개4
    '오름앤컴퍼니': 1,  // WR 50%, 계약1, 소개2
    '바우스가구': 2,  // WR 0% but 시트 없음→2
    'UNWIND': 2,
    'DS소파': 3,  // WR 0%, 계약0, 소개1
    '메종비퍼니처': 3,  // WR 0%, 계약0, 소개2

    // ===== EMR/CRM =====
    '의사랑': 1,  // WR 100%, 계약5, 소개5 → 시트에 '의사랑'
    '비트': 1,  // WR 67%, 계약2, 소개3
    '베가스 CRM': 2,  // WR 50%, 계약2, 소개4
    '스마트/우노 CRM': 2,
    'KOS CRM': 3,
    '스마트닥터CRM': 3,
    '닥터팔레트': 3,  // WR 0%, 계약0, 소개2

    // ===== 은행 =====
    '[하나은행] 닥터플래티늄': 1, // WR 67%, 계약6, 소개9
    '부산은행': 2,  // WR 40%, 계약2, 소개5
    '[경남은행] 메디칼론': 3,  // WR 17%, 계약1, 소개6

    // ===== 마케팅 =====
    '플랜티': 1,  // WR 100%, 계약2, 소개2
};

const mode = process.argv[2] || 'add';
const partnersDir = path.resolve(__dirname, '..', 'data', 'notion', 'partners');

function processFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.items || !Array.isArray(data.items)) return 0;

    let count = 0;
    for (const item of data.items) {
        if (!item.metadata) continue;
        if (item.metadata.category !== 'DB 레코드') continue;

        if (mode === 'add') {
            const name = (item.question || '').trim();
            const tier = TIER_MAP[name];
            if (tier) {
                item.metadata.tier = tier;
                count++;
            } else {
                item.metadata.tier = 3; // 기본값
                count++;
            }
        } else if (mode === 'remove') {
            if ('tier' in item.metadata) {
                delete item.metadata.tier;
                count++;
            }
        }
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return count;
}

function scan(dir) {
    let total = 0;
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
            total += scan(p);
        } else if (f.endsWith('.json')) {
            const n = processFile(p);
            if (n > 0) console.log(`  ${mode === 'add' ? '✅' : '🗑️'} ${path.relative(partnersDir, p)}: ${n}개`);
            total += n;
        }
    }
    return total;
}

console.log(`\n🔧 Tier ${mode === 'add' ? '추가' : '제거'} 중...\n`);
const total = scan(partnersDir);
console.log(`\n✅ 완료: 총 ${total}개 파트너사 ${mode === 'add' ? 'tier 추가됨' : 'tier 제거됨'}\n`);
