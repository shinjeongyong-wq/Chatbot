/**
 * Notion 데이터 구조화 스크립트 v3
 * 
 * 기존 notionData.js를 폴더 기반 구조로 변환합니다.
 * 사용법: node scripts/organize-notion-data.js
 */

const fs = require('fs');
const path = require('path');

// notionData.js 로드
const notionDataPath = path.join(__dirname, '..', 'notionData.js');
const notionDataContent = fs.readFileSync(notionDataPath, 'utf-8');

// NOTION_DATA 추출
const match = notionDataContent.match(/const NOTION_DATA = (\[[\s\S]*?\]);/);
if (!match) {
    console.error('❌ NOTION_DATA를 찾을 수 없습니다.');
    process.exit(1);
}

const NOTION_DATA = JSON.parse(match[1]);
console.log(`📦 ${NOTION_DATA.length}개 항목 로드 완료\n`);

// 출력 디렉토리
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'notion');

// ===== 분류 매핑 정의 =====

// 파트너사 - 전반부 (착공 이전)
const PARTNERS_PRE = ['은행 파트너사', '인테리어 파트너사', '간판 파트너사', '홈페이지 파트너사', 'PC&네트워크 파트너사', 'PC&네트워크, 통신'];

// 파트너사 - 중후반부 (착공 이후)
const PARTNERS_POST = ['가구 파트너사', '중후반 프로세스 파트너사', '중후반  프로세스 파트너사', '행정업무 체크리스트', '마케팅 업체', 'CRM/EMR 파트너사', '소방점검 체크리스트', '부동산 정보 점검표'];

// 심화 콘텐츠
const ADVANCED = ['심화편', '심화 편', '의료기기 미용', '의료기기 통증', '의료기기 내과', '의료기기 치과', '미용 편', '통증 편', '내과 편', '치과 편'];

// 기본편 - 착공 이전
const BASICS_PRE = ['세무', '대출', '인테리어 (기본편)', '인테리어(기본편)', '간판 (기본편)', '간판(기본편)', '의료기기 (기본편)', '의료기기(기본편)', '마케팅', 'PC&네트워크', '홈페이지', '철거 및 운영'];

// 기본편 - 시공 중
const BASICS_DURING = ['운영 지원 인프라', '가구', '병원용 섬유류', '의료폐기물'];

// 기본편 - 개설신고 이후
const BASICS_POST = ['행정 업무', '보험', 'EMR & CRM', 'EMR&CRM', '원내 의약품', '관리 관련 업체', '유니폼', '정기청소', '소모품'];

// 결과 저장소
const results = {
    'partners/pre-construction': {},
    'partners/post-construction': {},
    'advanced': {},
    'hospital-basics/pre-construction': {},
    'hospital-basics/during-construction': {},
    'hospital-basics/post-registration': {},
    'checklist': {},
    'uncategorized': {}
};

// 분류 함수
function categorizeItem(item) {
    const question = item.question || '';
    const topic = item.metadata?.topic || '';
    const parentType = item.metadata?.parentType || '';
    const category = item.metadata?.category || '';
    const text = question + ' ' + topic;

    // 1. DB 레코드 → checklist
    if (parentType === 'database_id' || category === 'DB 레코드') {
        return { category: 'checklist', subCategory: getChecklistSubCategory(item) };
    }

    // 2. 파트너사 전반부
    for (const kw of PARTNERS_PRE) {
        if (text.includes(kw)) {
            return { category: 'partners/pre-construction', subCategory: getPartnersSubCategory(text) };
        }
    }

    // 3. 파트너사 중후반부
    for (const kw of PARTNERS_POST) {
        if (text.includes(kw)) {
            return { category: 'partners/post-construction', subCategory: getPartnersPostSubCategory(text) };
        }
    }

    // 4. 심화 콘텐츠
    for (const kw of ADVANCED) {
        if (text.includes(kw)) {
            return { category: 'advanced', subCategory: getAdvancedSubCategory(text) };
        }
    }

    // 5. 기본편 - 착공 이전
    for (const kw of BASICS_PRE) {
        if (text.includes(kw)) {
            return { category: 'hospital-basics/pre-construction', subCategory: getBasicsPreSubCategory(text) };
        }
    }

    // 6. 기본편 - 시공 중
    for (const kw of BASICS_DURING) {
        if (text.includes(kw)) {
            return { category: 'hospital-basics/during-construction', subCategory: getBasicsDuringSubCategory(text) };
        }
    }

    // 7. 기본편 - 개설신고 이후
    for (const kw of BASICS_POST) {
        if (text.includes(kw)) {
            return { category: 'hospital-basics/post-registration', subCategory: getBasicsPostSubCategory(text) };
        }
    }

    // 8. 미분류
    return { category: 'uncategorized', subCategory: 'general' };
}

// ===== 서브카테고리 결정 함수들 =====

function getPartnersSubCategory(text) {
    if (text.includes('인테리어')) return 'interior';
    if (text.includes('간판')) return 'signage';
    if (text.includes('홈페이지')) return 'homepage';
    if (text.includes('PC') || text.includes('네트워크')) return 'pc-network';
    if (text.includes('은행')) return 'bank';
    return 'general';
}

function getPartnersPostSubCategory(text) {
    if (text.includes('가구')) return 'furniture';
    if (text.includes('중후반')) return 'late-process';
    if (text.includes('CRM') || text.includes('EMR')) return 'emr-crm';
    if (text.includes('마케팅')) return 'marketing';
    if (text.includes('행정')) return 'admin-checklist';
    if (text.includes('소방')) return 'fire-checklist';
    if (text.includes('부동산')) return 'real-estate';
    return 'general';
}

function getAdvancedSubCategory(text) {
    if (text.includes('인테리어')) return 'interior';
    if (text.includes('간판')) return 'signage';
    if (text.includes('미용')) return 'medical-beauty';
    if (text.includes('통증')) return 'medical-pain';
    if (text.includes('내과')) return 'medical-internal';
    if (text.includes('치과')) return 'medical-dental';
    return 'general';
}

function getBasicsPreSubCategory(text) {
    if (text.includes('세무')) return 'tax';
    if (text.includes('대출')) return 'loan';
    if (text.includes('인테리어')) return 'interior';
    if (text.includes('간판')) return 'signage';
    if (text.includes('의료기기')) return 'medical-device';
    if (text.includes('마케팅')) return 'marketing';
    if (text.includes('홈페이지')) return 'homepage';
    if (text.includes('PC') || text.includes('네트워크')) return 'pc-network';
    if (text.includes('철거')) return 'demolition';
    return 'general';
}

function getBasicsDuringSubCategory(text) {
    if (text.includes('운영 지원') || text.includes('인프라')) return 'infrastructure';
    if (text.includes('가구')) return 'furniture';
    if (text.includes('섬유')) return 'textiles';
    if (text.includes('폐기물')) return 'waste';
    return 'general';
}

function getBasicsPostSubCategory(text) {
    if (text.includes('행정')) return 'admin';
    if (text.includes('보험')) return 'insurance';
    if (text.includes('EMR') || text.includes('CRM')) return 'emr-crm';
    if (text.includes('의약품')) return 'pharmacy';
    if (text.includes('관리') || text.includes('유니폼') || text.includes('정기청소') || text.includes('소모품')) return 'management';
    return 'general';
}

function getChecklistSubCategory(item) {
    const answer = (item.answer || '').toLowerCase();
    if (answer.includes('소방') || answer.includes('스프링클러')) return 'facilities';
    if (answer.includes('주차') || answer.includes('장애인')) return 'facilities';
    if (answer.includes('철거') || answer.includes('바닥') || answer.includes('천정')) return 'construction';
    if (answer.includes('개설') || answer.includes('신고')) return 'regulations';
    return 'general';
}

// ===== 분류 실행 =====
console.log('🔄 데이터 분류 중...\n');

NOTION_DATA.forEach(item => {
    const { category, subCategory } = categorizeItem(item);

    // 새로운 카테고리 정보 추가
    item.metadata.structuredCategory = category;
    item.metadata.structuredSubCategory = subCategory;

    if (!results[category][subCategory]) {
        results[category][subCategory] = [];
    }
    results[category][subCategory].push(item);
});

// 결과 출력
console.log('📊 분류 결과:');
Object.entries(results).forEach(([catName, subCats]) => {
    const total = Object.values(subCats).reduce((sum, arr) => sum + arr.length, 0);
    if (total > 0) {
        console.log(`   ${catName}: ${total}개`);
    }
});

// ===== 폴더 생성 및 파일 저장 =====
console.log('\n📁 폴더 구조 생성 중...\n');

// 인덱스 데이터
const indexData = {
    version: '3.0',
    generatedAt: new Date().toISOString(),
    totalItems: NOTION_DATA.length,
    categories: {}
};

Object.entries(results).forEach(([catName, subCats]) => {
    Object.entries(subCats).forEach(([subCat, items]) => {
        if (items.length === 0) return;

        const catPath = path.join(OUTPUT_DIR, catName);

        // 폴더 생성
        fs.mkdirSync(catPath, { recursive: true });

        // 파일 저장
        const filePath = path.join(catPath, `${subCat}.json`);
        const fileData = {
            category: catName,
            subCategory: subCat,
            itemCount: items.length,
            lastUpdated: new Date().toISOString(),
            items: items
        };

        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
        console.log(`   ✅ ${catName}/${subCat}.json (${items.length}개)`);

        // 인덱스에 추가
        const fullPath = `${catName}/${subCat}`;
        indexData.categories[fullPath] = {
            itemCount: items.length,
            file: `${subCat}.json`
        };
    });
});

// index.json 저장
const indexPath = path.join(OUTPUT_DIR, 'index.json');
fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2), 'utf-8');
console.log(`\n   ✅ index.json (전체 인덱스)`);

console.log('\n✨ 데이터 구조화 완료!');
console.log(`   총 카테고리: ${Object.keys(indexData.categories).length}개`);
console.log(`   총 항목: ${NOTION_DATA.length}개`);
console.log(`   출력 경로: ${OUTPUT_DIR}`);
