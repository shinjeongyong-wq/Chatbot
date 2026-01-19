/**
 * Notion 계층적 백업 스크립트 v4
 * 
 * 부모 페이지 정보를 추적하여 DB 레코드도 정확히 분류
 * 사용법: node scripts/notion-backup-v4.js
 */

const fs = require('fs');
const path = require('path');

// .env 로드
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
            const [key, ...vals] = line.split('=');
            if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
        });
    }
}
loadEnv();

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'notion');

if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
}

const headers = {
    'Authorization': `Bearer ${NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
};

// 페이지 ID → 제목 매핑 (부모 추적용)
const pageIdToTitle = {};
const pageIdToCategory = {};

let stats = { pages: 0, files: 0, errors: 0 };
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function notionFetch(endpoint, options = {}) {
    const url = `https://api.notion.com/v1${endpoint}`;
    for (let i = 0; i < 3; i++) {
        try {
            const res = await fetch(url, { ...options, headers });
            if (res.status === 429) { await delay(2000 * (i + 1)); continue; }
            if (!res.ok) { if (i === 2) stats.errors++; await delay(1000); continue; }
            return await res.json();
        } catch (e) { if (i === 2) stats.errors++; await delay(1000); }
    }
    return null;
}

function richTextToPlain(rt) {
    if (!rt || !Array.isArray(rt)) return '';
    return rt.map(r => r.plain_text || '').join('');
}

function getPageTitle(page) {
    if (!page?.properties) return 'Untitled';
    for (const [, prop] of Object.entries(page.properties)) {
        if (prop.type === 'title') return richTextToPlain(prop.title);
    }
    return 'Untitled';
}

function getPageIcon(page) {
    return page?.icon?.type === 'emoji' ? page.icon.emoji : '';
}

// 제목에서 카테고리 추출
function titleToCategory(title) {
    const t = title.toLowerCase();

    // 파트너사 명단
    if (t.includes('인테리어 파트너사') || t.includes('오픈닥터 인테리어')) return 'partners/interior';
    if (t.includes('간판 파트너사') || t.includes('오픈닥터 간판')) return 'partners/signage';
    if (t.includes('홈페이지 파트너사') || t.includes('오픈닥터 홈페이지')) return 'partners/website';
    if (t.includes('pc&네트워크') || t.includes('통신') || t.includes('보안')) return 'partners/it';
    if (t.includes('가구 파트너사') || t.includes('오픈닥터 가구')) return 'partners/furniture';
    if (t.includes('은행 파트너사')) return 'partners/bank';
    if (t.includes('crm') || t.includes('emr')) return 'partners/crm-emr';
    if (t.includes('중후반') && t.includes('파트너사')) return 'partners/mid-late';

    // 프로세스
    if (t.includes('세무')) return 'process/pre-construction/tax';
    if (t.includes('대출')) return 'process/pre-construction/loan';
    if (t.includes('인테리어') && (t.includes('기본') || !t.includes('파트너'))) return 'process/pre-construction/interior';
    if (t.includes('간판') && (t.includes('기본') || !t.includes('파트너'))) return 'process/pre-construction/signage';
    if (t.includes('의료기기')) return 'process/pre-construction/medical-device';
    if (t.includes('마케팅')) return 'process/pre-construction/marketing';
    if (t.includes('홈페이지') && !t.includes('파트너')) return 'process/pre-construction/website';
    if (t.includes('철거')) return 'process/pre-construction/demolition';

    if (t.includes('운영 지원')) return 'process/during-construction/infrastructure';
    if (t.includes('가구') && !t.includes('파트너')) return 'process/during-construction/furniture';
    if (t.includes('섬유류')) return 'process/during-construction/textiles';
    if (t.includes('의료폐기물')) return 'process/during-construction/waste';

    if (t.includes('행정 업무')) return 'process/post-registration/admin';
    if (t.includes('보험')) return 'process/post-registration/insurance';
    if (t.includes('emr') && !t.includes('파트너')) return 'process/post-registration/emr-crm';
    if (t.includes('의약품')) return 'process/post-registration/medicine';
    if (t.includes('관리 관련')) return 'process/post-registration/management';

    // 체크리스트
    if (t.includes('소방점검')) return 'checklists/fire';
    if (t.includes('부동산') || t.includes('점검표')) return 'checklists/real-estate';
    if (t.includes('행정업무 체크')) return 'checklists/admin';

    // 심화
    if (t.includes('심화')) {
        if (t.includes('인테리어')) return 'advanced/interior';
        if (t.includes('간판')) return 'advanced/signage';
    }
    if (t.includes('의료기기') && t.includes('미용')) return 'advanced/medical-beauty';
    if (t.includes('의료기기') && t.includes('치과')) return 'advanced/medical-dental';
    if (t.includes('의료기기') && t.includes('통증')) return 'advanced/medical-pain';
    if (t.includes('의료기기') && t.includes('내과')) return 'advanced/medical-internal';

    return null;
}

async function getBlockContent(blockId) {
    const parts = [];
    let cursor = null;
    let count = 0;

    do {
        let endpoint = `/blocks/${blockId}/children?page_size=100`;
        if (cursor) endpoint += `&start_cursor=${cursor}`;

        await delay(30);
        const res = await notionFetch(endpoint);
        if (!res?.results) break;

        for (const block of res.results) {
            if (count++ > 50) break;
            const type = block.type;
            const data = block[type];
            if (!data) continue;

            let text = '';
            if (data.rich_text) text = richTextToPlain(data.rich_text);
            else if (type === 'to_do') text = `${data.checked ? '☑' : '☐'} ${richTextToPlain(data.rich_text)}`;

            if (text) parts.push(text);
        }

        cursor = res.has_more ? res.next_cursor : null;
    } while (cursor && count < 50);

    return parts.join('\n');
}

async function getAllPages() {
    console.log('📡 전체 페이지 조회 중...\n');
    const allPages = [];
    let cursor = null;

    do {
        const body = { page_size: 100, filter: { property: 'object', value: 'page' } };
        if (cursor) body.start_cursor = cursor;

        const res = await notionFetch('/search', { method: 'POST', body: JSON.stringify(body) });
        if (!res) break;

        allPages.push(...(res.results || []));
        cursor = res.has_more ? res.next_cursor : null;
        console.log(`  ${allPages.length}개 발견...`);
        await delay(100);
    } while (cursor);

    console.log(`\n✅ 총 ${allPages.length}개 페이지\n`);
    return allPages;
}

// 1차: 모든 페이지의 제목과 카테고리 매핑 구축
function buildPageMappings(pages) {
    console.log('📋 페이지 매핑 구축 중...\n');

    for (const page of pages) {
        const title = getPageTitle(page);
        const id = page.id;
        pageIdToTitle[id] = title;

        const category = titleToCategory(title);
        if (category) {
            pageIdToCategory[id] = category;
        }
    }

    console.log(`  📊 카테고리 매핑: ${Object.keys(pageIdToCategory).length}개\n`);
}

// 부모 체인을 따라가며 카테고리 결정
function getCategoryForPage(page) {
    const title = getPageTitle(page);
    const id = page.id;

    // 1순위: 제목에서 직접 추출
    const directCategory = titleToCategory(title);
    if (directCategory) return directCategory;

    // 2순위: 부모 페이지의 카테고리 상속
    if (page.parent?.type === 'page_id') {
        const parentId = page.parent.page_id;
        if (pageIdToCategory[parentId]) {
            return pageIdToCategory[parentId];
        }
    }

    // 3순위: 부모 DB의 부모 페이지에서 상속
    if (page.parent?.type === 'database_id') {
        const dbId = page.parent.database_id;
        // DB의 부모 페이지 찾기
        if (pageIdToCategory[dbId]) {
            return pageIdToCategory[dbId];
        }
    }

    return 'uncategorized';
}

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

async function processAndSave(pages) {
    // 먼저 매핑 구축
    buildPageMappings(pages);

    console.log('📂 폴더별로 저장 중...\n');

    const categorized = {};
    const index = {
        generatedAt: new Date().toISOString(),
        totalPages: pages.length,
        categories: {}
    };

    for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        const title = getPageTitle(page);
        const icon = getPageIcon(page);

        process.stdout.write(`\r[${i + 1}/${pages.length}] ${title.slice(0, 30)}...`);
        stats.pages++;

        const content = await getBlockContent(page.id);
        const categoryPath = getCategoryForPage(page);

        if (!categorized[categoryPath]) {
            categorized[categoryPath] = [];
        }

        categorized[categoryPath].push({
            id: page.id,
            title: `${icon} ${title}`.trim(),
            content: content || `[${title}] - Notion에서 확인`,
            icon,
            lastUpdated: page.last_edited_time,
            notionUrl: `https://notion.so/${page.id.replace(/-/g, '')}`
        });

        await delay(50);
    }

    // 파일로 저장
    console.log('\n\n💾 파일 저장 중...\n');

    for (const [categoryPath, items] of Object.entries(categorized)) {
        const filePath = path.join(OUTPUT_DIR, `${categoryPath}.json`);
        const dirPath = path.dirname(filePath);
        ensureDir(dirPath);

        const fileData = {
            category: categoryPath,
            count: items.length,
            generatedAt: new Date().toISOString(),
            items
        };

        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');
        stats.files++;
        console.log(`  ✅ ${categoryPath}.json (${items.length}개)`);

        index.categories[categoryPath] = {
            file: `${categoryPath}.json`,
            count: items.length
        };
    }

    // 인덱스 파일 저장
    const indexPath = path.join(OUTPUT_DIR, 'index.json');
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
    console.log(`\n  📋 index.json 생성`);

    return index;
}

async function main() {
    console.log('🚀 Notion 계층적 백업 v4 시작...\n');

    // 출력 디렉토리 생성 (기존 파일 덮어쓰기)
    ensureDir(OUTPUT_DIR);

    // 모든 페이지 가져오기
    const pages = await getAllPages();

    // 처리 및 저장
    await processAndSave(pages);

    // 통계 출력
    console.log('\n📊 통계:');
    console.log(`   페이지: ${stats.pages}개`);
    console.log(`   파일: ${stats.files}개`);
    console.log(`   에러: ${stats.errors}개`);
    console.log(`\n📁 저장 위치: ${OUTPUT_DIR}`);
    console.log('\n✨ 완료!');
}

main().catch(console.error);
