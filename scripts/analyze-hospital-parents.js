/**
 * 고객사(병원) 데이터의 부모 페이지(파트너사) 조회 및 재분류 스크립트
 * Notion API를 사용하여 각 고객사가 어느 파트너사 소속인지 파악
 */

const fs = require('fs');
const path = require('path');

const NOTION_DATA_DIR = path.join(__dirname, '..', 'data', 'notion');

// 파트너사 pageId → 이름 매핑 (이미 수집된 데이터에서 추출)
const PARTNER_PAGE_IDS = {};

// 먼저 파트너사 데이터 로드하여 pageId 매핑 구축
function loadPartnerMapping() {
    const interiorPath = path.join(NOTION_DATA_DIR, 'partners', 'pre-construction', 'interior.json');
    const signagePath = path.join(NOTION_DATA_DIR, 'partners', 'pre-construction', 'signage.json');
    const emrCrmPath = path.join(NOTION_DATA_DIR, 'partners', 'post-construction', 'emr-crm.json');
    const furniturePath = path.join(NOTION_DATA_DIR, 'partners', 'post-construction', 'furniture.json');
    const lateProcessPath = path.join(NOTION_DATA_DIR, 'partners', 'post-construction', 'late-process.json');

    const paths = [interiorPath, signagePath, emrCrmPath, furniturePath, lateProcessPath];

    for (const p of paths) {
        try {
            const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
            for (const item of data.items || []) {
                if (item.pageId && item.question) {
                    PARTNER_PAGE_IDS[item.pageId] = {
                        name: item.question.replace(/[🛠️🖼️📊💼]/g, '').trim(),
                        category: `${data.category}/${data.subCategory}`
                    };
                }
            }
        } catch (e) {
            console.log(`파일 로드 실패: ${p}`);
        }
    }

    console.log(`파트너사 ${Object.keys(PARTNER_PAGE_IDS).length}개 로드됨`);
}

// 고객사(병원) 항목 추출
function extractHospitalItems() {
    const generalPath = path.join(NOTION_DATA_DIR, 'checklist', 'general.json');
    const generalData = JSON.parse(fs.readFileSync(generalPath, 'utf-8'));

    const hospitals = [];
    const hospitalPattern = /(의원|병원|치과|한의원|클리닉|센터|의학과|성형외과|피부과|안과|내과|정형외과|신경과|외과)$/;

    for (const item of generalData.items) {
        const question = item.question || '';
        // ⭐ 아이콘으로 시작하거나 병원명 패턴 매칭
        if (question.startsWith('⭐') || hospitalPattern.test(question)) {
            hospitals.push(item);
        }
    }

    console.log(`\n고객사(병원) ${hospitals.length}개 발견`);
    return hospitals;
}

// Notion API로 페이지 부모 정보 조회
async function fetchParentInfo(pageId) {
    const NOTION_API_KEY = process.env.NOTION_API_KEY;

    if (!NOTION_API_KEY) {
        console.error('NOTION_API_KEY 환경변수가 설정되지 않았습니다.');
        return null;
    }

    try {
        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28'
            }
        });

        if (!response.ok) {
            console.error(`페이지 조회 실패: ${pageId}, ${response.status}`);
            return null;
        }

        const data = await response.json();
        return data.parent;
    } catch (error) {
        console.error(`API 오류: ${pageId}`, error.message);
        return null;
    }
}

// 부모 체인을 따라가며 파트너사 찾기
async function findPartnerForHospital(hospital) {
    let currentPageId = hospital.pageId;
    let depth = 0;
    const maxDepth = 5;

    while (depth < maxDepth) {
        const parent = await fetchParentInfo(currentPageId);

        if (!parent) break;

        if (parent.type === 'page_id') {
            // 부모가 페이지인 경우 - 파트너사인지 확인
            if (PARTNER_PAGE_IDS[parent.page_id]) {
                return PARTNER_PAGE_IDS[parent.page_id];
            }
            currentPageId = parent.page_id;
        } else if (parent.type === 'database_id') {
            // 부모가 DB인 경우 - DB의 부모 페이지 확인 필요
            currentPageId = parent.database_id;
        } else if (parent.type === 'workspace') {
            // 최상위에 도달
            break;
        } else {
            break;
        }

        depth++;
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 350));
    }

    return null;
}

// 메인 분석 함수
async function analyzeHospitals() {
    console.log('=== 고객사(병원) 부모 파트너사 분석 ===\n');

    loadPartnerMapping();
    const hospitals = extractHospitalItems();

    // 고유한 병원만 추출 (중복 제거)
    const uniqueHospitals = [];
    const seenNames = new Set();

    for (const h of hospitals) {
        const name = h.question.replace('⭐ ', '').trim();
        if (!seenNames.has(name)) {
            seenNames.add(name);
            uniqueHospitals.push(h);
        }
    }

    console.log(`중복 제거 후 ${uniqueHospitals.length}개 병원\n`);

    // API 호출 없이 먼저 통계 출력
    console.log('=== 발견된 고객사(병원) 목록 ===');
    for (const h of uniqueHospitals) {
        console.log(`  ${h.question}`);
    }

    // API 키가 있으면 부모 조회 시도
    if (process.env.NOTION_API_KEY && process.argv.includes('--fetch')) {
        console.log('\n=== Notion API로 부모 정보 조회 중... ===\n');

        const results = [];
        for (const hospital of uniqueHospitals.slice(0, 10)) { // 처음 10개만 테스트
            console.log(`조회 중: ${hospital.question}`);
            const partner = await findPartnerForHospital(hospital);

            results.push({
                hospital: hospital.question,
                pageId: hospital.pageId,
                partner: partner ? partner.name : '미확인'
            });

            if (partner) {
                console.log(`  → 파트너사: ${partner.name}`);
            } else {
                console.log(`  → 파트너사 미확인`);
            }
        }

        // 결과 저장
        fs.writeFileSync(
            path.join(__dirname, 'hospital-partner-mapping.json'),
            JSON.stringify(results, null, 2),
            'utf-8'
        );
        console.log('\n결과 저장됨: hospital-partner-mapping.json');
    } else {
        console.log('\n💡 --fetch 옵션과 NOTION_API_KEY 환경변수로 실제 부모 정보 조회 가능');
    }
}

analyzeHospitals();
