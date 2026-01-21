/**
 * 고객사(병원) 데이터 재분류 스크립트
 * 
 * 노션 원본 구조 기반으로 고객사를 해당 파트너사에 연결
 * 
 * 참고: 스크린샷에서 확인된 구조
 * - 무아디자인 > 오픈닥터 고객 포트폴리오 > 연세튼튼재활의학과, 프라임영상의학과 등
 * - 각 파트너사마다 유사한 구조로 고객사 포트폴리오 존재
 */

const fs = require('fs');
const path = require('path');

const NOTION_DATA_DIR = path.join(__dirname, '..', 'data', 'notion');

// ===== 고객사 → 파트너사 수동 매핑 =====
// 노션 원본 데이터를 기반으로 작성해야 함
// 현재는 스크린샷에서 확인된 무아디자인 고객사 예시만 포함

const HOSPITAL_PARTNER_MAPPING = {
    // 무아디자인 고객사 (스크린샷에서 확인)
    '연세튼튼재활의학과': { partner: '무아디자인', specialty: '재활의학과' },
    '아차산마루마취통증의학과': { partner: '무아디자인', specialty: '마취통증의학과' },
    '프라임영상의학과': { partner: '무아디자인', specialty: '영상의학과' },
    '삼성스마트신경과': { partner: '무아디자인', specialty: '신경의학과' },
    '서울튼튼한치과의원': { partner: '무아디자인', specialty: '치과' },
    '수유바로본의원': { partner: '무아디자인', specialty: '정형외과' },

    // 기타 파트너사 고객사 (노션 확인 필요 - 플레이스홀더)
    // 플랜디자인, 네스트디자인, 플럭스 등의 고객사도 추가해야 함
};

// 고객사 데이터 추출
function extractHospitals() {
    const generalPath = path.join(NOTION_DATA_DIR, 'checklist', 'general.json');
    const generalData = JSON.parse(fs.readFileSync(generalPath, 'utf-8'));

    const hospitals = [];

    for (const item of generalData.items) {
        const question = item.question || '';
        // ⭐ 아이콘으로 시작하는 항목이 고객사
        if (question.startsWith('⭐')) {
            hospitals.push(item);
        }
    }

    return { hospitals, generalData };
}

// 파트너사 데이터 로드
function loadPartnerData(category, subCategory) {
    const filePath = path.join(NOTION_DATA_DIR, category, `${subCategory}.json`);
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        return null;
    }
}

// 파트너사에 포트폴리오 추가
function addPortfolioToPartner(partnerData, partnerName, hospitalItem, specialty) {
    // 해당 파트너사 찾기
    const partner = partnerData.items.find(item => {
        const name = (item.question || '').replace(/[🛠️🖼️📊💼⭐]/g, '').trim();
        return name.includes(partnerName) || partnerName.includes(name);
    });

    if (!partner) {
        console.log(`  ⚠️ 파트너사 "${partnerName}" 찾기 실패`);
        return false;
    }

    // 포트폴리오 배열 초기화
    if (!partner.portfolio) {
        partner.portfolio = [];
    }

    // 중복 체크
    const hospitalName = hospitalItem.question.replace('⭐ ', '').trim();
    const exists = partner.portfolio.some(p => p.name === hospitalName);

    if (!exists) {
        partner.portfolio.push({
            name: hospitalName,
            specialty: specialty || '',
            pageId: hospitalItem.pageId
        });
        console.log(`  ✅ ${partnerName} → ${hospitalName} (${specialty})`);
        return true;
    }

    return false;
}

// 메인 함수
function reorganizeHospitals() {
    console.log('=== 고객사(병원) 데이터 파트너사별 분류 ===\n');

    const { hospitals, generalData } = extractHospitals();
    console.log(`총 ${hospitals.length}개 고객사(병원) 항목 발견\n`);

    // 중복 제거
    const uniqueHospitals = new Map();
    for (const h of hospitals) {
        const name = h.question.replace('⭐ ', '').trim();
        if (!uniqueHospitals.has(name)) {
            uniqueHospitals.set(name, h);
        }
    }
    console.log(`중복 제거 후 ${uniqueHospitals.size}개 고유 병원\n`);

    // 인테리어 파트너사 데이터 로드
    const interiorData = loadPartnerData('partners/pre-construction', 'interior');
    if (!interiorData) {
        console.error('❌ 인테리어 파트너사 데이터 로드 실패');
        return;
    }

    // 매핑된 고객사 처리
    let matched = 0;
    let unmatched = 0;
    const unmatchedList = [];

    for (const [hospitalName, hospitalItem] of uniqueHospitals) {
        const mapping = HOSPITAL_PARTNER_MAPPING[hospitalName];

        if (mapping) {
            const added = addPortfolioToPartner(interiorData, mapping.partner, hospitalItem, mapping.specialty);
            if (added) matched++;
        } else {
            unmatched++;
            unmatchedList.push(hospitalName);
        }
    }

    console.log(`\n✅ 매핑 완료: ${matched}개`);
    console.log(`❓ 미매핑: ${unmatched}개`);

    if (unmatchedList.length > 0) {
        console.log('\n=== 미매핑 고객사 (노션에서 파트너사 확인 필요) ===');
        for (const name of unmatchedList) {
            console.log(`  - ${name}`);
        }
    }

    // 파트너사 데이터 저장
    if (matched > 0) {
        const interiorPath = path.join(NOTION_DATA_DIR, 'partners', 'pre-construction', 'interior.json');
        interiorData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(interiorPath, JSON.stringify(interiorData, null, 2), 'utf-8');
        console.log(`\n💾 인테리어 파트너사 데이터 저장됨`);

        // 포트폴리오 있는 파트너사 확인
        console.log('\n=== 파트너사별 포트폴리오 현황 ===');
        for (const partner of interiorData.items) {
            const name = (partner.question || '').replace(/[🛠️🖼️📊💼]/g, '').trim();
            const portfolioCount = (partner.portfolio || []).length;
            if (portfolioCount > 0) {
                console.log(`  ${name}: ${portfolioCount}개 고객사`);
            }
        }
    }

    // general.json에서 매핑된 고객사 제거 (선택적)
    if (process.argv.includes('--remove-matched')) {
        const matchedPageIds = new Set();
        for (const [hospitalName] of uniqueHospitals) {
            if (HOSPITAL_PARTNER_MAPPING[hospitalName]) {
                const item = uniqueHospitals.get(hospitalName);
                matchedPageIds.add(item.pageId);
            }
        }

        generalData.items = generalData.items.filter(item => !matchedPageIds.has(item.pageId));
        generalData.itemCount = generalData.items.length;
        generalData.lastUpdated = new Date().toISOString();

        const generalPath = path.join(NOTION_DATA_DIR, 'checklist', 'general.json');
        fs.writeFileSync(generalPath, JSON.stringify(generalData, null, 2), 'utf-8');
        console.log(`\n📦 general.json 업데이트: ${generalData.itemCount}개 항목 유지`);
    }

    console.log('\n=== 완료 ===');
    console.log('💡 더 많은 고객사를 매핑하려면 HOSPITAL_PARTNER_MAPPING에 추가하세요.');
}

// 실행
reorganizeHospitals();
