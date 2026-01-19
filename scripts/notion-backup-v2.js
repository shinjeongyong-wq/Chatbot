/**
 * Notion 전체 백업 스크립트 v2
 * 
 * 사용법: node scripts/notion-backup-v2.js
 * 
 * Notion Search API로 전체 페이지를 가져온 후
 * 각 페이지의 블록 내용을 추출합니다.
 */

const fs = require('fs');
const path = require('path');

// .env 파일 직접 읽기
function loadEnv() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                process.env[key.trim()] = valueParts.join('=').trim();
            }
        });
    }
}
loadEnv();

const NOTION_API_KEY = process.env.NOTION_API_KEY;

if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY가 설정되지 않았습니다.');
    process.exit(1);
}

const headers = {
    'Authorization': `Bearer ${NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
};

const results = [];
let stats = { pages: 0, blocks: 0, errors: 0 };

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Notion API 호출 (재시도 포함)
 */
async function notionFetch(endpoint, options = {}, retries = 3) {
    const url = `https://api.notion.com/v1${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: { ...headers, ...options.headers }
            });

            if (response.status === 429) {
                const waitTime = 2000 * attempt;
                console.log(`  ⏳ Rate Limit, ${waitTime}ms 대기...`);
                await delay(waitTime);
                continue;
            }

            if (!response.ok) {
                if (attempt < retries) {
                    await delay(1000 * attempt);
                    continue;
                }
                stats.errors++;
                return null;
            }

            return await response.json();
        } catch (error) {
            if (attempt < retries) {
                await delay(1000 * attempt);
                continue;
            }
            stats.errors++;
            return null;
        }
    }
    return null;
}

/**
 * 리치 텍스트 → 일반 텍스트
 */
function richTextToPlain(richText) {
    if (!richText || !Array.isArray(richText)) return '';
    return richText.map(rt => rt.plain_text || '').join('');
}

/**
 * 블록 → 텍스트
 */
function blockToText(block) {
    const type = block.type;
    const data = block[type];

    if (!data) return '';

    switch (type) {
        case 'paragraph':
        case 'heading_1':
        case 'heading_2':
        case 'heading_3':
        case 'bulleted_list_item':
        case 'numbered_list_item':
        case 'toggle':
        case 'quote':
        case 'callout':
            return richTextToPlain(data.rich_text);
        case 'to_do':
            const check = data.checked ? '☑' : '☐';
            return `${check} ${richTextToPlain(data.rich_text)}`;
        case 'code':
            return richTextToPlain(data.rich_text);
        case 'divider':
            return '---';
        case 'table_row':
            if (data.cells) {
                return data.cells.map(cell => richTextToPlain(cell)).join(' | ');
            }
            return '';
        default:
            return '';
    }
}

/**
 * 페이지 제목 추출
 */
function getPageTitle(page) {
    if (!page || !page.properties) return 'Untitled';

    for (const [key, prop] of Object.entries(page.properties)) {
        if (prop.type === 'title' && prop.title) {
            return richTextToPlain(prop.title);
        }
    }
    return 'Untitled';
}

/**
 * 페이지 아이콘 추출
 */
function getPageIcon(page) {
    if (!page || !page.icon) return '';
    if (page.icon.type === 'emoji') return page.icon.emoji;
    return '';
}

/**
 * 블록 자식 가져오기 (깊이 제한, 최대 블록 수 제한)
 */
async function getBlockContent(blockId, depth = 0) {
    if (depth > 2) return []; // 깊이 2까지만

    const contentParts = [];
    let cursor = null;
    let blockCount = 0;
    const MAX_BLOCKS = 50; // 페이지당 최대 50개 블록만

    do {
        let endpoint = `/blocks/${blockId}/children?page_size=100`;
        if (cursor) endpoint += `&start_cursor=${cursor}`;

        await delay(30);
        const response = await notionFetch(endpoint);

        if (!response || !response.results) break;

        for (const block of response.results) {
            if (blockCount >= MAX_BLOCKS) break;

            stats.blocks++;
            blockCount++;

            const text = blockToText(block);
            if (text) contentParts.push(text);

            // 중요한 블록만 자식 탐색 (toggle, callout)
            if (block.has_children && (block.type === 'toggle' || block.type === 'callout')) {
                const childContent = await getBlockContent(block.id, depth + 1);
                contentParts.push(...childContent.map(c => `  ${c}`));
            }
        }

        if (blockCount >= MAX_BLOCKS) break;
        cursor = response.has_more ? response.next_cursor : null;
    } while (cursor);

    return contentParts;
}

/**
 * Search API로 모든 페이지 가져오기
 */
async function getAllPages() {
    console.log('📡 Notion Search API로 전체 페이지 조회 중...\n');

    const allPages = [];
    let cursor = null;

    do {
        const body = {
            page_size: 100,
            filter: { property: 'object', value: 'page' }
        };
        if (cursor) body.start_cursor = cursor;

        const response = await notionFetch('/search', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (!response) break;

        allPages.push(...(response.results || []));
        cursor = response.has_more ? response.next_cursor : null;

        console.log(`  현재까지: ${allPages.length}개 페이지`);
        await delay(100);
    } while (cursor);

    console.log(`\n✅ 총 ${allPages.length}개 페이지 발견\n`);
    return allPages;
}

/**
 * 각 페이지의 콘텐츠 수집
 */
async function processPage(page, index, total) {
    const title = getPageTitle(page);
    const icon = getPageIcon(page);
    const pageId = page.id;

    process.stdout.write(`\r[${index + 1}/${total}] ${icon} ${title.slice(0, 30)}...`);
    stats.pages++;

    // 블록 콘텐츠 가져오기
    const contentParts = await getBlockContent(pageId);
    const content = contentParts.join('\n').trim();

    // 부모 정보로 경로 추정
    let field = '플래너 AI';
    let category = '';

    if (page.parent) {
        if (page.parent.type === 'database_id') {
            category = 'DB 레코드';
        } else if (page.parent.type === 'page_id') {
            category = '하위 페이지';
        }
    }

    results.push({
        id: `notion-${pageId.replace(/-/g, '').slice(0, 12)}`,
        source: 'notion',
        pageId: pageId,
        question: `${icon} ${title}`.trim(),
        answer: content || `[${title}] - Notion에서 상세 내용 확인`,
        metadata: {
            field: field,
            topic: title,
            category: category,
            icon: icon,
            lastUpdated: page.last_edited_time,
            parentType: page.parent?.type || 'unknown'
        }
    });
}

/**
 * 결과 저장
 */
function saveResults() {
    const timestamp = new Date().toISOString();

    const fileContent = `/**
 * Notion 데이터 백업 파일 (자동 생성 v2)
 * 
 * 백업 일시: ${timestamp}
 * 총 항목 수: ${results.length}개
 * 탐색 페이지: ${stats.pages}개
 * 탐색 블록: ${stats.blocks}개
 * 에러: ${stats.errors}개
 * 
 * 업데이트 방법: node scripts/notion-backup-v2.js
 */

const NOTION_DATA = ${JSON.stringify(results, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NOTION_DATA };
}
`;

    const outputPath = path.join(__dirname, '..', 'notionData.js');
    fs.writeFileSync(outputPath, fileContent, 'utf-8');
    console.log(`\n\n✅ 저장 완료: ${outputPath}`);
}

/**
 * 메인 실행
 */
async function main() {
    console.log('🚀 Notion 전체 백업 v2 시작...\n');

    // 1. 모든 페이지 가져오기
    const allPages = await getAllPages();

    // 2. 각 페이지 처리
    console.log('📄 페이지별 콘텐츠 수집 중...\n');

    for (let i = 0; i < allPages.length; i++) {
        await processPage(allPages[i], i, allPages.length);
        await delay(100); // Rate Limit 방지
    }

    // 3. 통계 출력
    console.log('\n\n📊 통계:');
    console.log(`   페이지: ${stats.pages}개`);
    console.log(`   블록: ${stats.blocks}개`);
    console.log(`   에러: ${stats.errors}개`);
    console.log(`   추출 항목: ${results.length}개`);

    // 4. 저장
    saveResults();

    console.log('\n✨ 백업 완료!');
}

main().catch(console.error);
