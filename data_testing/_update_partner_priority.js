/**
 * 파트너사 Priority 데이터 업데이트 스크립트
 * 스프레드시트 데이터를 기반으로 각 파트너사 JSON의 metadata에 추가
 * 
 * 추가 필드: winningRate, totalContracts, totalIntroductions, priority
 * Priority 계산:
 *   P1: WR >= 50% AND 소개 >= 3
 *   P2: WR >= 30% OR 소개 >= 5
 *   P3: 나머지
 */

const fs = require('fs');
const path = require('path');

// ========== 스프레드시트 매칭 데이터 ==========
const PARTNER_DATA = {
    // ===== 인테리어 =====
    '무아디자인': { winningRate: 57, totalContracts: 4, totalIntroductions: 7 },
    'JWC그룹': { winningRate: 0, totalContracts: 0, totalIntroductions: 2 },
    '플럭스': { winningRate: 10, totalContracts: 1, totalIntroductions: 10 },
    '플랜디자인': { winningRate: 30, totalContracts: 3, totalIntroductions: 10 },
    '네스트디자인': { winningRate: 33, totalContracts: 2, totalIntroductions: 6 },
    '톤앤무드': { winningRate: 33, totalContracts: 3, totalIntroductions: 9 },
    '인투익스': { winningRate: 50, totalContracts: 2, totalIntroductions: 4 },
    '씨투와이': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },
    '써드스페이스': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },
    '메이드바이': { winningRate: 50, totalContracts: 1, totalIntroductions: 2 },
    '더 코나 메디스페이스': { winningRate: 0, totalContracts: 0, totalIntroductions: 1 },

    // ===== 간판 =====
    'LS디자인': { winningRate: 45, totalContracts: 5, totalIntroductions: 11 },
    '더프라임': { winningRate: 38, totalContracts: 3, totalIntroductions: 8 },
    '디온에이': { winningRate: 25, totalContracts: 1, totalIntroductions: 4 },
    '동부기업': { winningRate: 0, totalContracts: 0, totalIntroductions: 1 },
    '디자인캐프': { winningRate: 43, totalContracts: 3, totalIntroductions: 7 },

    // ===== PC네트워크 (signage.json 내) =====
    '덴탈컴넷': { winningRate: 78, totalContracts: 7, totalIntroductions: 9 },
    '중앙정보기술': { winningRate: 42, totalContracts: 5, totalIntroductions: 12 },

    // ===== PC네트워크 =====
    'SK쉴더스': { winningRate: 70, totalContracts: 7, totalIntroductions: 10 },
    'KT': { winningRate: 100, totalContracts: 6, totalIntroductions: 6 },
    // LG U+ → 스프레드시트에 없음

    // ===== 홈페이지 =====
    'BUD': { winningRate: 75, totalContracts: 3, totalIntroductions: 4 },
    '원프레임': { winningRate: 83, totalContracts: 5, totalIntroductions: 6 },
    '파인애플피티엘': { winningRate: 60, totalContracts: 3, totalIntroductions: 5 },
    '유어데브': { winningRate: 78, totalContracts: 7, totalIntroductions: 9 },

    // ===== 은행 =====
    '부산은행': { winningRate: 40, totalContracts: 2, totalIntroductions: 5 },
    '하나은행': { winningRate: 67, totalContracts: 6, totalIntroductions: 9 },
    '경남은행': { winningRate: 17, totalContracts: 1, totalIntroductions: 6 },

    // ===== EMR/CRM =====
    '베가스': { winningRate: 50, totalContracts: 2, totalIntroductions: 4 },
    '스마트/우노 CRM': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },
    'KOS CRM': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },
    '스마트닥터CRM': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },

    // ===== 가구 =====
    '바우스가구': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },
    '오름앤컴퍼니': { winningRate: 50, totalContracts: 1, totalIntroductions: 2 },
    'UNWIND': { winningRate: 0, totalContracts: 0, totalIntroductions: 0 },
    'DS소파': { winningRate: 0, totalContracts: 0, totalIntroductions: 1 },
    '루벨루테': { winningRate: 75, totalContracts: 3, totalIntroductions: 4 },
    '메종비퍼니처': { winningRate: 0, totalContracts: 0, totalIntroductions: 2 },

    // ===== 마케팅 =====
    '플랜티': { winningRate: 100, totalContracts: 2, totalIntroductions: 2 },
};

// ========== Priority 계산 ==========
function calculatePriority(wr, intros) {
    if (wr >= 50 && intros >= 3) return 1;
    if (wr >= 30 || intros >= 5) return 2;
    return 3;
}

// ========== 파트너 이름 매칭 (유연) ==========
function findPartnerData(questionName) {
    const name = questionName.toLowerCase().trim();

    for (const [key, value] of Object.entries(PARTNER_DATA)) {
        const k = key.toLowerCase();

        // 정확 매칭
        if (name === k) return { key, ...value };

        // 부분 매칭 (파트너사 이름이 question에 포함되어 있는 경우)
        if (name.includes(k) || k.includes(name)) return { key, ...value };

        // 특수 케이스
        if (k === 'sk쉴더스' && name.includes('sk쉴더스')) return { key, ...value };
        if (k === 'kt' && (name.includes('kt (내부용)') || name.includes('kt(내부용)'))) return { key, ...value };
        if (k === '유어데브' && (name.includes('유어데브') || name.includes('yourdev'))) return { key, ...value };
        if (k === '하나은행' && name.includes('하나은행')) return { key, ...value };
        if (k === '경남은행' && name.includes('경남은행')) return { key, ...value };
        if (k === '베가스' && name.includes('베가스')) return { key, ...value };
        if (k === '디온에이' && (name.includes('디온에이') || name.includes('d.on.a'))) return { key, ...value };
        if (k === '네스트디자인' && name.includes('네스트디자인')) return { key, ...value };
        if (k === 'jwc그룹' && (name.includes('jwc그룹') || name.includes('jwc'))) return { key, ...value };
    }

    return null;
}

// ========== 대상 파일 목록 ==========
const BASE_PATH = path.join(__dirname, '..', 'data', 'notion', 'partners');
const TARGET_FILES = [
    'pre-construction/interior.json',
    'pre-construction/signage.json',
    'pre-construction/pc-network.json',
    'pre-construction/homepage.json',
    'pre-construction/bank.json',
    'post-construction/emr-crm.json',
    'post-construction/furniture.json',
    'post-construction/marketing.json',
];

// ========== 실행 ==========
let totalUpdated = 0;
let totalSkipped = 0;
let totalNotFound = 0;

TARGET_FILES.forEach(filePath => {
    const fullPath = path.join(BASE_PATH, filePath);
    console.log(`\n📂 처리 중: ${filePath}`);

    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));

    data.items.forEach(item => {
        const name = item.question || '';

        // 요약 카드 (이모지로 시작하는 카드) 건너뛰기
        if (name.startsWith('🛠️') || name.startsWith('📊') || name.startsWith('💪') ||
            name.startsWith('💺') || name.startsWith('🖥️') || name.startsWith('🏠') ||
            name.startsWith('🚧') || name.startsWith('🏦')) {
            console.log(`  ⏭️ 요약 카드 건너뛰기: ${name.substring(0, 30)}...`);
            totalSkipped++;
            return;
        }

        const matched = findPartnerData(name);

        if (matched) {
            const priority = calculatePriority(matched.winningRate, matched.totalIntroductions);

            item.metadata = item.metadata || {};
            item.metadata.winningRate = matched.winningRate;
            item.metadata.totalContracts = matched.totalContracts;
            item.metadata.totalIntroductions = matched.totalIntroductions;
            item.metadata.priority = priority;

            console.log(`  ✅ ${name} → WR:${matched.winningRate}% | 계약:${matched.totalContracts} | 소개:${matched.totalIntroductions} | P${priority}`);
            totalUpdated++;
        } else {
            console.log(`  ❌ 매칭 실패: ${name}`);
            totalNotFound++;
        }
    });

    // JSON 저장 (2칸 인덴트)
    fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`  💾 저장 완료`);
});

console.log(`\n========== 결과 ==========`);
console.log(`✅ 업데이트: ${totalUpdated}개`);
console.log(`⏭️ 건너뛰기(요약카드): ${totalSkipped}개`);
console.log(`❌ 매칭 실패: ${totalNotFound}개`);
