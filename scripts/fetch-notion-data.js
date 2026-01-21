/**
 * 노션 전체 데이터 수집 및 구조화 스크립트 v3
 * 
 * 모든 페이지의 하위 콘텐츠까지 재귀적으로 완전히 수집
 * - 하위 페이지(child_page) 내용까지 전부 수집
 * - toggle 블록 안의 내용도 수집
 * - 모든 레벨의 콘텐츠 완전 수집
 */

const fs = require('fs');
const path = require('path');

// 노션 API 설정
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2022-06-28';

const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'notion');

// ===== 카테고리 매핑 =====
const CATEGORY_MAPPING = {
    // ========== 심화편 (ADVANCED) - 먼저 체크해야 함! ==========
    '인테리어 심화편': { category: 'advanced', subCategory: 'interior' },
    '인테리어 심화편 (1)': { category: 'advanced', subCategory: 'interior' },
    '간판 심화편': { category: 'advanced', subCategory: 'signage' },
    '간판 심화편 (1)': { category: 'advanced', subCategory: 'signage' },
    '의료기기 미용 편': { category: 'advanced', subCategory: 'medical-device-beauty' },
    '의료기기 미용 편 (1)': { category: 'advanced', subCategory: 'medical-device-beauty' },
    '의료기기 통증 편': { category: 'advanced', subCategory: 'medical-device-pain' },
    '의료기기 통증 편 (1)': { category: 'advanced', subCategory: 'medical-device-pain' },
    '의료기기 내과 편': { category: 'advanced', subCategory: 'medical-device-internal' },
    '의료기기 내과 편 (1)': { category: 'advanced', subCategory: 'medical-device-internal' },
    '의료기기 치과 편': { category: 'advanced', subCategory: 'medical-device-dental' },
    '의료기기 치과 편 (1)': { category: 'advanced', subCategory: 'medical-device-dental' },

    // ========== 파트너사 - 착공 이전 ==========
    '인테리어 파트너사': { category: 'partners', subCategory: 'pre-construction/interior' },
    '오픈닥터 인테리어 파트너사': { category: 'partners', subCategory: 'pre-construction/interior' },
    '간판 파트너사': { category: 'partners', subCategory: 'pre-construction/signage' },
    '오픈닥터 간판 파트너사': { category: 'partners', subCategory: 'pre-construction/signage' },
    '파트너사': { category: 'partners', subCategory: 'pre-construction/signage' },
    '은행 파트너사': { category: 'partners', subCategory: 'pre-construction/bank' },
    '상세 조건 보기': { category: 'partners', subCategory: 'pre-construction/bank' },
    '홈페이지 파트너사': { category: 'partners', subCategory: 'pre-construction/homepage' },
    '오픈닥터 홈페이지 파트너사': { category: 'partners', subCategory: 'pre-construction/homepage' },
    'PC&네트워크 파트너사': { category: 'partners', subCategory: 'pre-construction/pc-network' },
    '오픈닥터 PC&네트워크, 통신&보안 파트너사': { category: 'partners', subCategory: 'pre-construction/pc-network' },
    '통신&보안 파트너사': { category: 'partners', subCategory: 'pre-construction/pc-network' },

    // ========== 파트너사 - 착공 이후 ==========
    '오픈닥터 가구 파트너사': { category: 'partners', subCategory: 'post-construction/furniture' },
    '이동가구 파트너사': { category: 'partners', subCategory: 'post-construction/furniture' },
    '붙박이가구': { category: 'partners', subCategory: 'post-construction/furniture' },
    '중후반 프로세스 파트너사': { category: 'partners', subCategory: 'post-construction/late-process' },
    'CRM/EMR 파트너사': { category: 'partners', subCategory: 'post-construction/emr-crm' },
    '피부미용(비보험과)': { category: 'partners', subCategory: 'post-construction/emr-crm' },
    '마케팅 파트너사': { category: 'partners', subCategory: 'post-construction/marketing' },

    // ========== 기본편 - 착공 이전 ==========
    '인테리어 (기본편)': { category: 'hospital-basics', subCategory: 'pre-construction/interior' },
    '인테리어': { category: 'hospital-basics', subCategory: 'pre-construction/interior' },
    '간판 (기본편)': { category: 'hospital-basics', subCategory: 'pre-construction/signage' },
    '간판': { category: 'hospital-basics', subCategory: 'pre-construction/signage' },
    'PC&네트워크': { category: 'hospital-basics', subCategory: 'pre-construction/marketing' },
    '홈페이지': { category: 'hospital-basics', subCategory: 'pre-construction/marketing' },
    '마케팅': { category: 'hospital-basics', subCategory: 'pre-construction/marketing' },
    '마케팅 / 홈페이지 / PC&네트워크': { category: 'hospital-basics', subCategory: 'pre-construction/marketing' },
    '대출': { category: 'hospital-basics', subCategory: 'pre-construction/tax-loan' },
    '세무': { category: 'hospital-basics', subCategory: 'pre-construction/tax-loan' },
    '세무 / 대출': { category: 'hospital-basics', subCategory: 'pre-construction/tax-loan' },
    '의료기기 (기본편)': { category: 'hospital-basics', subCategory: 'pre-construction/medical-device' },
    '의료기기': { category: 'hospital-basics', subCategory: 'pre-construction/medical-device' },
    '철거': { category: 'hospital-basics', subCategory: 'pre-construction/demolition' },
    '철거 및 운영': { category: 'hospital-basics', subCategory: 'pre-construction/demolition' },
    '철거 및 운영 필수 설비': { category: 'hospital-basics', subCategory: 'pre-construction/demolition' },

    // ========== 기본편 - 시공 중 ==========
    '가구': { category: 'hospital-basics', subCategory: 'during-construction/furniture' },
    '병원용 섬유류': { category: 'hospital-basics', subCategory: 'during-construction/textiles' },
    '침구/린넨': { category: 'hospital-basics', subCategory: 'during-construction/textiles' },
    '커튼/블라인드': { category: 'hospital-basics', subCategory: 'during-construction/textiles' },
    '유니폼': { category: 'hospital-basics', subCategory: 'during-construction/textiles' },
    '의료폐기물': { category: 'hospital-basics', subCategory: 'during-construction/waste' },
    '정수기': { category: 'hospital-basics', subCategory: 'during-construction/infrastructure' },
    '정기청소': { category: 'hospital-basics', subCategory: 'during-construction/infrastructure' },
    '소모품': { category: 'hospital-basics', subCategory: 'during-construction/infrastructure' },

    // ========== 기본편 - 개설신고 이후 ==========
    '행정 업무': { category: 'hospital-basics', subCategory: 'post-opening/admin' },
    '보험': { category: 'hospital-basics', subCategory: 'post-opening/admin' },
    '행정 업무 / 보험': { category: 'hospital-basics', subCategory: 'post-opening/admin' },
    'EMR & CRM': { category: 'hospital-basics', subCategory: 'post-opening/emr-crm' },
    'EMR&CRM': { category: 'hospital-basics', subCategory: 'post-opening/emr-crm' },
    '원내 의약품': { category: 'hospital-basics', subCategory: 'post-opening/pharmacy' },
    '원내의약품': { category: 'hospital-basics', subCategory: 'post-opening/pharmacy' },
    '관리 관련 업체': { category: 'hospital-basics', subCategory: 'post-opening/management' },

    // ========== 체크리스트 ==========
    '목록': { category: 'checklist', subCategory: 'general' },
    '체크리스트': { category: 'checklist', subCategory: 'general' },
    '소방점검 체크리스트': { category: 'checklist', subCategory: 'facilities' },
    '행정업무 체크리스트': { category: 'checklist', subCategory: 'admin' },
    '부동산 정보 점검표': { category: 'checklist', subCategory: 'regulations' },

    // ========== 고객 포트폴리오 ==========
    '오픈닥터 고객 사례': { category: 'portfolio', subCategory: 'customers' },
    '오픈닥터 고객 포트폴리오': { category: 'portfolio', subCategory: 'customers' },
};

// API 호출 함수
async function notionAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${NOTION_API_KEY}`,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json'
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`https://api.notion.com/v1${endpoint}`, options);

        if (!response.ok) {
            const error = await response.json();
            console.error(`API Error: ${response.status}`, error.message);
            return null;
        }

        return await response.json();
    } catch (e) {
        console.error('Network error:', e.message);
        return null;
    }
}

// 전체 페이지/DB 검색
async function searchAll() {
    console.log('=== 노션 전체 데이터 검색 ===\n');

    const results = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
        const response = await notionAPI('/search', 'POST', {
            page_size: 100,
            start_cursor: startCursor
        });

        if (!response) break;

        results.push(...response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;

        console.log(`수집된 항목: ${results.length}개`);
        await sleep(300);
    }

    return results;
}

// 데이터베이스 쿼리
async function queryDatabase(databaseId) {
    const items = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
        const response = await notionAPI(`/databases/${databaseId}/query`, 'POST', {
            page_size: 100,
            start_cursor: startCursor
        });

        if (!response) break;

        items.push(...response.results);
        hasMore = response.has_more;
        startCursor = response.next_cursor;

        await sleep(300);
    }

    return items;
}

// 페이지 정보 가져오기
async function getPage(pageId) {
    return await notionAPI(`/pages/${pageId}`);
}

// 페이지의 모든 블록(콘텐츠) 가져오기 - 재귀적으로 하위 페이지 콘텐츠까지 전부!
async function getPageBlocksDeep(pageId, depth = 0, maxDepth = 10) {
    if (depth >= maxDepth) return [];

    const blocks = [];
    let hasMore = true;
    let startCursor = undefined;

    while (hasMore) {
        const url = `/blocks/${pageId}/children?page_size=100${startCursor ? `&start_cursor=${startCursor}` : ''}`;
        const response = await notionAPI(url);

        if (!response) break;

        for (const block of response.results) {
            blocks.push(block);

            // 하위 블록이 있으면 재귀적으로 가져오기 (toggle, column 등)
            if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
                const children = await getPageBlocksDeep(block.id, depth + 1, maxDepth);
                block.children = children;
            }

            // ★★★ 핵심: child_page인 경우, 해당 페이지의 콘텐츠도 가져오기! ★★★
            if (block.type === 'child_page') {
                console.log(`    ${'  '.repeat(depth)}📄 하위 페이지: ${block.child_page.title}`);
                const childPageBlocks = await getPageBlocksDeep(block.id, depth + 1, maxDepth);
                block.childPageContent = childPageBlocks;
                await sleep(200);
            }

            // child_database인 경우도 DB 쿼리
            if (block.type === 'child_database') {
                console.log(`    ${'  '.repeat(depth)}📊 하위 DB: ${block.child_database.title}`);
            }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor;

        await sleep(200);
    }

    return blocks;
}

// 블록에서 텍스트 추출 (하위 페이지 콘텐츠 포함!)
function extractTextFromBlocksDeep(blocks, depth = 0) {
    const lines = [];
    const indent = '  '.repeat(depth);

    for (const block of blocks) {
        const type = block.type;
        const content = block[type];

        let text = '';

        if (content?.rich_text) {
            text = content.rich_text.map(t => t.plain_text).join('');
        }

        // 블록 타입별 처리
        switch (type) {
            case 'heading_1':
                if (text) lines.push(`\n# ${text}`);
                break;
            case 'heading_2':
                if (text) lines.push(`\n## ${text}`);
                break;
            case 'heading_3':
                if (text) lines.push(`\n### ${text}`);
                break;
            case 'paragraph':
                if (text) lines.push(`${indent}${text}`);
                break;
            case 'bulleted_list_item':
                if (text) lines.push(`${indent}• ${text}`);
                break;
            case 'numbered_list_item':
                if (text) lines.push(`${indent}1. ${text}`);
                break;
            case 'to_do':
                const checked = content.checked ? '☑' : '☐';
                if (text) lines.push(`${indent}${checked} ${text}`);
                break;
            case 'toggle':
                if (text) lines.push(`${indent}▸ ${text}`);
                break;
            case 'callout':
                const emoji = content.icon?.emoji || '💡';
                if (text) lines.push(`${emoji} ${text}`);
                break;
            case 'quote':
                if (text) lines.push(`> ${text}`);
                break;
            case 'code':
                if (text) lines.push(`\`\`\`\n${text}\n\`\`\``);
                break;
            case 'divider':
                lines.push('---');
                break;
            case 'child_page':
                // ★★★ 하위 페이지 제목 + 내용 추가! ★★★
                if (content.title) {
                    lines.push(`\n### 📄 ${content.title}`);
                }
                // 하위 페이지 콘텐츠가 있으면 추가
                if (block.childPageContent && block.childPageContent.length > 0) {
                    const childText = extractTextFromBlocksDeep(block.childPageContent, depth + 1);
                    if (childText) lines.push(childText);
                }
                break;
            case 'child_database':
                if (content.title) lines.push(`\n📊 ${content.title}`);
                break;
            case 'table':
                lines.push('[표]');
                break;
            case 'image':
                lines.push('[이미지]');
                break;
            case 'video':
                lines.push('[비디오]');
                break;
            case 'file':
                lines.push('[파일]');
                break;
            case 'pdf':
                lines.push('[PDF]');
                break;
            case 'bookmark':
                if (content.url) lines.push(`🔗 ${content.url}`);
                break;
            case 'link_preview':
                if (content.url) lines.push(`🔗 ${content.url}`);
                break;
            case 'embed':
                if (content.url) lines.push(`📎 ${content.url}`);
                break;
        }

        // 일반 하위 블록 처리 (toggle 안의 내용 등)
        if (block.children && block.children.length > 0) {
            const childText = extractTextFromBlocksDeep(block.children, depth + 1);
            if (childText) lines.push(childText);
        }
    }

    return lines.join('\n');
}

// 페이지 제목 추출
function getPageTitle(page) {
    const props = page.properties || {};

    for (const [key, value] of Object.entries(props)) {
        if (value.type === 'title' && value.title?.length > 0) {
            return value.title.map(t => t.plain_text).join('');
        }
    }

    return '';
}

// DB 제목 추출
function getDbTitle(db) {
    if (db.title && db.title.length > 0) {
        return db.title.map(t => t.plain_text).join('');
    }
    return 'Untitled';
}

// 카테고리 결정
function determineCategory(title, parentTitle = '') {
    const text = `${title} ${parentTitle}`;

    // ★★★ 심화편 키워드를 가장 먼저 체크! ★★★
    if (text.includes('심화편') || text.includes('심화 편')) {
        if (text.includes('인테리어')) return { category: 'advanced', subCategory: 'interior' };
        if (text.includes('간판')) return { category: 'advanced', subCategory: 'signage' };
        if (text.includes('미용')) return { category: 'advanced', subCategory: 'medical-device-beauty' };
        if (text.includes('통증')) return { category: 'advanced', subCategory: 'medical-device-pain' };
        if (text.includes('내과')) return { category: 'advanced', subCategory: 'medical-device-internal' };
        if (text.includes('치과')) return { category: 'advanced', subCategory: 'medical-device-dental' };
        return { category: 'advanced', subCategory: 'general' };
    }

    // 정확한 매핑 확인
    if (CATEGORY_MAPPING[title]) {
        return CATEGORY_MAPPING[title];
    }

    // 부모 제목으로 확인
    if (parentTitle && CATEGORY_MAPPING[parentTitle]) {
        return CATEGORY_MAPPING[parentTitle];
    }

    // 키워드 기반 매칭
    const lowerText = text.toLowerCase();
    for (const [keyword, mapping] of Object.entries(CATEGORY_MAPPING)) {
        if (lowerText.includes(keyword.toLowerCase())) {
            return mapping;
        }
    }

    // 고객사/병원 패턴
    if (title.includes('의원') || title.includes('병원') || title.includes('치과') ||
        title.includes('한의원') || title.includes('클리닉') || title.includes('의학과') ||
        title.startsWith('⭐')) {
        return { category: 'portfolio', subCategory: 'customers' };
    }

    return { category: 'uncategorized', subCategory: 'general' };
}

// 유틸리티
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function saveJson(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`💾 저장: ${path.relative(OUTPUT_DIR, filePath)} (${data.items?.length || 0}개 항목)`);
}

// 기존 파일 정리 - 전체 삭제 후 새로 시작
function cleanupOldFiles() {
    console.log('🧹 기존 data/notion 폴더 전체 삭제 후 새로 시작...\n');

    // data/notion 폴더 전체 삭제
    if (fs.existsSync(OUTPUT_DIR)) {
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
        console.log('  ✅ 기존 data/notion 폴더 삭제 완료');
    }

    // 폴더 새로 생성
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('  ✅ data/notion 폴더 새로 생성 완료\n');
}

// ===== 메인 실행 =====
async function main() {
    console.log('====================================================');
    console.log('   노션 전체 데이터 수집 및 구조화 v3');
    console.log('   - 하위 페이지 콘텐츠까지 완전 수집!');
    console.log('====================================================\n');

    // 기존 중복 파일 정리
    cleanupOldFiles();

    // 1. 전체 검색
    const allItems = await searchAll();

    if (!allItems || allItems.length === 0) {
        console.error('❌ 데이터를 가져올 수 없습니다. API 키를 확인하세요.');
        return;
    }

    console.log(`\n총 ${allItems.length}개 항목 발견\n`);

    // 2. 페이지와 DB 분류
    const pages = allItems.filter(item => item.object === 'page');
    const databases = allItems.filter(item => item.object === 'database');

    console.log(`📄 페이지: ${pages.length}개`);
    console.log(`📊 데이터베이스: ${databases.length}개\n`);

    // 3. 결과 저장소 초기화
    const structuredData = {};

    // 4. 데이터베이스 처리
    console.log('=== 데이터베이스 처리 ===\n');

    for (const db of databases) {
        const dbTitle = getDbTitle(db);
        console.log(`📊 ${dbTitle}`);

        // DB 항목 쿼리
        const dbItems = await queryDatabase(db.id);
        console.log(`   → ${dbItems.length}개 레코드`);

        for (const page of dbItems) {
            const title = getPageTitle(page);
            if (!title) continue;

            const { category, subCategory } = determineCategory(title, dbTitle);

            // ★★★ 페이지 콘텐츠 가져오기 - 하위 페이지까지! ★★★
            console.log(`  📄 ${title}`);
            const blocks = await getPageBlocksDeep(page.id);
            const content = extractTextFromBlocksDeep(blocks);

            // 구조화된 항목 생성
            const item = {
                id: `notion-${page.id.replace(/-/g, '').slice(0, 12)}`,
                source: 'notion',
                pageId: page.id,
                question: page.icon?.emoji ? `${page.icon.emoji} ${title}` : title,
                answer: content || `[${title}] - Notion에서 상세 내용 확인`,
                metadata: {
                    field: '플래너 AI',
                    topic: title,
                    category: 'DB 레코드',
                    icon: page.icon?.emoji || '',
                    lastUpdated: page.last_edited_time,
                    parentType: 'database_id',
                    parentDbName: dbTitle,
                    structuredCategory: category,
                    structuredSubCategory: subCategory
                }
            };

            // 카테고리별로 저장
            const key = `${category}/${subCategory}`;
            if (!structuredData[key]) {
                structuredData[key] = {
                    category,
                    subCategory,
                    items: []
                };
            }
            structuredData[key].items.push(item);

            await sleep(150);
        }
    }

    // 5. 일반 페이지 처리 (DB가 아닌 페이지)
    console.log('\n=== 일반 페이지 처리 ===\n');

    // DB에 속하지 않는 페이지들 (parent.type이 page_id 또는 workspace인 경우)
    const standalonePages = pages.filter(page => {
        return page.parent?.type === 'page_id' || page.parent?.type === 'workspace';
    });

    console.log(`독립 페이지: ${standalonePages.length}개\n`);

    for (const page of standalonePages) {
        const title = getPageTitle(page);
        if (!title) continue;

        // 부모 페이지 제목 가져오기 (있는 경우)
        let parentTitle = '';
        if (page.parent?.page_id) {
            const parentPage = pages.find(p => p.id === page.parent.page_id);
            if (parentPage) {
                parentTitle = getPageTitle(parentPage);
            }
        }

        const { category, subCategory } = determineCategory(title, parentTitle);

        // ★★★ 페이지 콘텐츠 가져오기 - 하위 페이지까지! ★★★
        console.log(`📄 ${title}`);
        const blocks = await getPageBlocksDeep(page.id);
        const content = extractTextFromBlocksDeep(blocks);

        if (!content && !title) continue;

        // 콘텐츠 길이 확인
        console.log(`   → 콘텐츠 길이: ${content.length}자`);

        const item = {
            id: `notion-${page.id.replace(/-/g, '').slice(0, 12)}`,
            source: 'notion',
            pageId: page.id,
            question: page.icon?.emoji ? `${page.icon.emoji} ${title}` : title,
            answer: content || `[${title}] - Notion에서 상세 내용 확인`,
            metadata: {
                field: '플래너 AI',
                topic: title,
                category: '페이지',
                icon: page.icon?.emoji || '',
                lastUpdated: page.last_edited_time,
                parentType: page.parent?.type || 'unknown',
                parentTitle: parentTitle,
                structuredCategory: category,
                structuredSubCategory: subCategory
            }
        };

        const key = `${category}/${subCategory}`;
        if (!structuredData[key]) {
            structuredData[key] = {
                category,
                subCategory,
                items: []
            };
        }
        structuredData[key].items.push(item);

        await sleep(150);
    }

    // 6. 파일로 저장
    console.log('\n=== 파일 저장 ===\n');

    let totalItems = 0;

    for (const [key, data] of Object.entries(structuredData)) {
        if (data.items.length === 0) continue;

        const filePath = path.join(OUTPUT_DIR, data.category, `${data.subCategory.replace(/\//g, '/')}.json`);

        const fileData = {
            category: data.category,
            subCategory: data.subCategory,
            itemCount: data.items.length,
            lastUpdated: new Date().toISOString(),
            items: data.items
        };

        saveJson(filePath, fileData);
        totalItems += data.items.length;
    }

    // 7. index.json 업데이트
    updateIndex();

    console.log('\n====================================================');
    console.log(`   ✅ 노션 데이터 수집 완료!`);
    console.log(`   총 ${totalItems}개 항목 저장됨`);
    console.log('====================================================');
}

function updateIndex() {
    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    const index = {
        version: '5.0',
        generatedAt: new Date().toISOString(),
        totalItems: 0,
        categories: {}
    };

    function scanDir(dir, relativePath = '') {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

            if (entry.isDirectory()) {
                scanDir(fullPath, relPath);
            } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
                try {
                    const data = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
                    if (data && data.items) {
                        const categoryKey = relPath.replace('.json', '').replace(/\\/g, '/');
                        index.categories[categoryKey] = {
                            itemCount: data.items.length,
                            file: entry.name
                        };
                        index.totalItems += data.items.length;
                    }
                } catch (e) { }
            }
        }
    }

    scanDir(OUTPUT_DIR);

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    console.log(`\n📋 index.json 업데이트됨 (총 ${index.totalItems}개 항목)`);
}

// 실행
main().catch(console.error);
