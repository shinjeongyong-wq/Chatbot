/**
 * 노션 데이터 재구조화 스크립트
 * checklist/general.json의 162개 항목을 적절한 카테고리로 분류하여 재배치
 */

const fs = require('fs');
const path = require('path');

const NOTION_DATA_DIR = path.join(__dirname, '..', 'data', 'notion');

// 분류 규칙 정의
const CLASSIFICATION_RULES = {
    // 인테리어 업체 키워드
    'partners/pre-construction/interior': [
        '플랜디자인', '더 코나', '더코나', '무아디자인', '네스트디자인', '인투익스',
        '플럭스', 'JWC그룹', '써드스페이스', '톤앤무드', '씨투와이', '메이드바이'
    ],

    // 간판 업체 키워드
    'partners/pre-construction/signage': [
        '디온에이', 'D.on.A', '더프라임', '디자인캐프', '동부기업', 'LS디자인'
    ],

    // 은행/대출 업체 키워드
    'partners/pre-construction/bank': [
        '하나은행', '닥터플래티늄', '경남은행', '메디칼론', '부산은행'
    ],

    // 홈페이지 업체 키워드
    'partners/pre-construction/homepage': [
        '애드리치', '홈페이지'
    ],

    // PC/네트워크 업체 키워드
    'partners/pre-construction/pc-network': [
        'KT텔레캅', 'SK브로드밴드', 'ADT캡스', '메디넷', '전산'
    ],

    // CRM/EMR 업체 키워드
    'partners/post-construction/emr-crm': [
        'CRM', 'EMR', '스마트차트', '스마트닥터', 'UNO', '페이션트', '리턴제로',
        '또하나의가족', '스마트NC', '메디소프트', '굿닥'
    ],

    // 가구 업체 키워드
    'partners/post-construction/furniture': [
        '무벤토', '플래닛도어', '이끼가구', '오피스가구', '스윙체어'
    ],

    // 중후반 프로세스 업체 (정수기, 침구, 청소 등)
    'partners/post-construction/late-process': [
        '코웨이', '청호나이스', '워터피아', '침구', '유니폼', '청소', '클리닝',
        '메디아이엔씨', '요리조리', '리넨'
    ],

    // 의료폐기물 업체
    'hospital-basics/during-construction/waste': [
        '닥터사이클린', '의료폐기물', '폐기물'
    ],

    // 마케팅 업체
    'partners/post-construction/marketing': [
        '마케팅', '광고', 'SNS', '블로그', '네이버'
    ]
};

// 고객사(병원) 식별 패턴
const HOSPITAL_PATTERNS = [
    /의원$/, /병원$/, /치과$/, /한의원$/, /클리닉$/, /센터$/, /의학과$/
];

// 체크리스트 항목 식별 키워드 (이건 checklist/general에 유지)
const CHECKLIST_KEYWORDS = [
    '급/배수', '배수', '임차인', '휠체어', '경사로', '냉난방', '파손', '창호',
    '기존', '현황', '확인', '여부', '체크', '점검'
];

function loadJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.error(`Error loading ${filePath}:`, error.message);
        return null;
    }
}

function saveJsonFile(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Saved: ${filePath}`);
}

function classifyItem(item) {
    const question = item.question || '';
    const answer = item.answer || '';
    const combined = `${question} ${answer}`;

    // 병원/고객사인지 확인 (이건 별도 처리)
    for (const pattern of HOSPITAL_PATTERNS) {
        if (pattern.test(question) && question.includes('⭐')) {
            return 'skip_hospital'; // 고객사는 별도 처리
        }
    }

    // 빈 항목 스킵
    if (!question || question.trim() === '' || answer.includes('Notion에서 상세 내용 확인')) {
        return 'skip_empty';
    }

    // 분류 규칙 적용
    for (const [category, keywords] of Object.entries(CLASSIFICATION_RULES)) {
        for (const keyword of keywords) {
            if (combined.includes(keyword)) {
                return category;
            }
        }
    }

    // 회사 소개 패턴 확인 (업체 데이터)
    if (answer.includes('⌛ 회사 소개') || answer.includes('회사 소개')) {
        // 인테리어 관련 키워드
        if (combined.includes('인테리어') || combined.includes('시공') || combined.includes('설계')) {
            return 'partners/pre-construction/interior';
        }
        if (combined.includes('간판') || combined.includes('사인')) {
            return 'partners/pre-construction/signage';
        }
        if (combined.includes('가구') || combined.includes('소파') || combined.includes('책상')) {
            return 'partners/post-construction/furniture';
        }
        if (combined.includes('정수기') || combined.includes('렌탈') || combined.includes('청소')) {
            return 'partners/post-construction/late-process';
        }
        // 기본값: 분류 불가
        return 'uncategorized_company';
    }

    // 주요 진료과 패턴 (CRM/EMR)
    if (answer.includes('🩺주요 진료과') || answer.includes('월 이용료')) {
        return 'partners/post-construction/emr-crm';
    }

    // 체크리스트 항목인지 확인
    for (const keyword of CHECKLIST_KEYWORDS) {
        if (combined.includes(keyword)) {
            return 'checklist/general'; // 유지
        }
    }

    return 'unknown';
}

function reorganizeData() {
    console.log('=== 노션 데이터 재구조화 시작 ===\n');

    // general.json 로드
    const generalPath = path.join(NOTION_DATA_DIR, 'checklist', 'general.json');
    const generalData = loadJsonFile(generalPath);

    if (!generalData) {
        console.error('general.json 로드 실패!');
        return;
    }

    console.log(`총 ${generalData.items.length}개 항목 분석 중...\n`);

    // 분류 결과 저장
    const classified = {};
    const skipList = [];
    const unknownList = [];

    for (const item of generalData.items) {
        const category = classifyItem(item);

        if (category.startsWith('skip_')) {
            skipList.push({ reason: category, item });
            continue;
        }

        if (category === 'unknown' || category === 'uncategorized_company') {
            unknownList.push(item);
            continue;
        }

        if (!classified[category]) {
            classified[category] = [];
        }
        classified[category].push(item);
    }

    // 결과 출력
    console.log('=== 분류 결과 ===\n');

    for (const [category, items] of Object.entries(classified)) {
        console.log(`📁 ${category}: ${items.length}개`);
        for (const item of items) {
            console.log(`   - ${item.question}`);
        }
        console.log('');
    }

    console.log(`⏭️ 스킵됨: ${skipList.length}개 (빈 항목/고객사)`);
    console.log(`❓ 미분류: ${unknownList.length}개\n`);

    if (unknownList.length > 0) {
        console.log('=== 미분류 항목 ===');
        for (const item of unknownList) {
            console.log(`   - ${item.question}`);
        }
        console.log('');
    }

    // 분류 결과를 JSON으로 저장 (검토용)
    const reportPath = path.join(__dirname, 'reorganize-report.json');
    saveJsonFile(reportPath, {
        classified,
        skipped: skipList.length,
        unknown: unknownList.map(i => i.question),
        summary: Object.entries(classified).map(([k, v]) => `${k}: ${v.length}개`).join('\n')
    });

    console.log(`\n분류 리포트 저장됨: ${reportPath}`);
    console.log('\n다음 단계: --apply 옵션으로 실행하면 실제 파일에 반영됩니다.');

    // --apply 옵션 시 실제 적용
    if (process.argv.includes('--apply')) {
        console.log('\n=== 데이터 재배치 적용 중... ===\n');
        applyReorganization(classified, generalData);
    }
}

function applyReorganization(classified, originalGeneral) {
    // 각 카테고리별로 기존 파일에 병합
    for (const [category, items] of Object.entries(classified)) {
        const parts = category.split('/');
        let filePath;

        if (parts.length === 2) {
            // checklist/general 등
            filePath = path.join(NOTION_DATA_DIR, parts[0], `${parts[1]}.json`);
        } else if (parts.length === 3) {
            // partners/pre-construction/interior 등
            filePath = path.join(NOTION_DATA_DIR, parts[0], parts[1], `${parts[2]}.json`);
        } else {
            console.log(`잘못된 카테고리: ${category}`);
            continue;
        }

        // 기존 파일 로드
        let existingData = loadJsonFile(filePath);
        if (!existingData) {
            existingData = {
                category: parts.slice(0, -1).join('/') || parts[0],
                subCategory: parts[parts.length - 1],
                itemCount: 0,
                lastUpdated: new Date().toISOString(),
                items: []
            };
        }

        // 메타데이터 업데이트 후 병합
        for (const item of items) {
            item.metadata.structuredCategory = parts.length === 3
                ? `${parts[0]}/${parts[1]}`
                : parts[0];
            item.metadata.structuredSubCategory = parts[parts.length - 1];
        }

        // 기존 항목과 병합 (중복 제거)
        const existingIds = new Set(existingData.items.map(i => i.pageId));
        const newItems = items.filter(i => !existingIds.has(i.pageId));

        existingData.items = [...existingData.items, ...newItems];
        existingData.itemCount = existingData.items.length;
        existingData.lastUpdated = new Date().toISOString();

        // 저장
        saveJsonFile(filePath, existingData);
        console.log(`✅ ${category}: ${newItems.length}개 항목 추가 (총 ${existingData.itemCount}개)`);
    }

    // general.json에서 이동된 항목 제거
    const movedPageIds = new Set();
    for (const items of Object.values(classified)) {
        for (const item of items) {
            if (item.metadata.structuredCategory !== 'checklist' ||
                item.metadata.structuredSubCategory !== 'general') {
                movedPageIds.add(item.pageId);
            }
        }
    }

    const remainingItems = originalGeneral.items.filter(
        item => !movedPageIds.has(item.pageId) ||
            (item.metadata.structuredCategory === 'checklist' &&
                item.metadata.structuredSubCategory === 'general')
    );

    originalGeneral.items = remainingItems;
    originalGeneral.itemCount = remainingItems.length;
    originalGeneral.lastUpdated = new Date().toISOString();

    const generalPath = path.join(NOTION_DATA_DIR, 'checklist', 'general.json');
    saveJsonFile(generalPath, originalGeneral);
    console.log(`\n📦 checklist/general.json: ${remainingItems.length}개 항목 유지`);

    // index.json 업데이트
    updateIndex();

    console.log('\n=== 재구조화 완료! ===');
}

function updateIndex() {
    const indexPath = path.join(NOTION_DATA_DIR, 'index.json');
    const index = {
        version: '3.1',
        generatedAt: new Date().toISOString(),
        totalItems: 0,
        categories: {}
    };

    // 모든 JSON 파일 스캔
    function scanDir(dir, relativePath = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                scanDir(fullPath, relPath);
            } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
                const data = loadJsonFile(fullPath);
                if (data && data.items) {
                    const categoryKey = relPath.replace('.json', '').replace(/\\/g, '/');
                    index.categories[categoryKey] = {
                        itemCount: data.items.length,
                        file: entry.name
                    };
                    index.totalItems += data.items.length;
                }
            }
        }
    }

    scanDir(NOTION_DATA_DIR);
    saveJsonFile(indexPath, index);
    console.log(`\n📋 index.json 업데이트됨 (총 ${index.totalItems}개 항목)`);
}

// 실행
reorganizeData();
