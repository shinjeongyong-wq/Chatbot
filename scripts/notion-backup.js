/**
 * Notion 전체 백업 스크립트
 * 
 * 사용법: node scripts/notion-backup.js
 * 
 * 루트 페이지부터 재귀적으로 모든 하위 페이지를 탐색하고
 * 블록 내용을 추출하여 notionData.js 파일로 저장합니다.
 */

const fs = require('fs');
const path = require('path');

// .env 파일 직접 읽기 (dotenv 없이)
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
const ROOT_PAGE_ID = '2ed62ade-d336-8064-a192-e1269201fbd2'; // 플래너 AI 루트 페이지

if (!NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
    process.exit(1);
}

const headers = {
    'Authorization': `Bearer ${NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28'
};

// 탐색된 페이지 ID 추적 (중복 방지)
const exploredPages = new Set();
// 최종 결과 저장
const results = [];
// 통계
let stats = { pages: 0, blocks: 0, databases: 0 };

// API 요청 딜레이 (Rate Limit 방지)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Notion API 호출 (재시도 로직 포함)
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
                // Rate Limit - 잠시 대기 후 재시도
                const waitTime = 1000 * attempt;
                console.log(`  ⏳ Rate Limit, ${waitTime}ms 대기...`);
                await delay(waitTime);
                continue;
            }

            if (!response.ok) {
                if (attempt < retries) {
                    await delay(500 * attempt);
                    continue;
                }
                const error = await response.text();
                console.error(`API Error (${response.status}): ${error.slice(0, 100)}`);
                return null;
            }

            return await response.json();
        } catch (error) {
            if (attempt < retries) {
                await delay(500 * attempt);
                continue;
            }
            console.error(`Fetch Error: ${error.message}`);
            return null;
        }
    }
    return null;
}

/**
 * 페이지 메타데이터 조회
 */
async function getPage(pageId) {
    return await notionFetch(`/pages/${pageId}`);
}

/**
 * 블록 자식 조회
 */
async function getBlockChildren(blockId, startCursor = null) {
    let endpoint = `/blocks/${blockId}/children?page_size=100`;
    if (startCursor) endpoint += `&start_cursor=${startCursor}`;
    return await notionFetch(endpoint);
}

/**
 * 데이터베이스 쿼리
 */
async function queryDatabase(databaseId) {
    return await notionFetch(`/databases/${databaseId}/query`, {
        method: 'POST',
        body: JSON.stringify({ page_size: 100 })
    });
}

/**
 * 리치 텍스트를 일반 텍스트로 변환
 */
function richTextToPlainText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return '';
    return richTextArray.map(rt => rt.plain_text || '').join('');
}

/**
 * 블록 내용을 텍스트로 변환
 */
function blockToText(block) {
    const type = block.type;

    switch (type) {
        case 'paragraph':
            return richTextToPlainText(block.paragraph?.rich_text);
        case 'heading_1':
            return `# ${richTextToPlainText(block.heading_1?.rich_text)}`;
        case 'heading_2':
            return `## ${richTextToPlainText(block.heading_2?.rich_text)}`;
        case 'heading_3':
            return `### ${richTextToPlainText(block.heading_3?.rich_text)}`;
        case 'bulleted_list_item':
            return `• ${richTextToPlainText(block.bulleted_list_item?.rich_text)}`;
        case 'numbered_list_item':
            return `1. ${richTextToPlainText(block.numbered_list_item?.rich_text)}`;
        case 'to_do':
            const checked = block.to_do?.checked ? '☑' : '☐';
            return `${checked} ${richTextToPlainText(block.to_do?.rich_text)}`;
        case 'toggle':
            return `▶ ${richTextToPlainText(block.toggle?.rich_text)}`;
        case 'callout':
            const emoji = block.callout?.icon?.emoji || '💡';
            return `${emoji} ${richTextToPlainText(block.callout?.rich_text)}`;
        case 'quote':
            return `> ${richTextToPlainText(block.quote?.rich_text)}`;
        case 'divider':
            return '---';
        case 'code':
            return `\`\`\`\n${richTextToPlainText(block.code?.rich_text)}\n\`\`\``;
        default:
            return '';
    }
}

/**
 * 페이지 제목 추출
 */
function getPageTitle(page) {
    if (!page || !page.properties) return 'Untitled';

    // title 타입 속성 찾기
    for (const [key, prop] of Object.entries(page.properties)) {
        if (prop.type === 'title' && prop.title) {
            return richTextToPlainText(prop.title);
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
 * 재귀적으로 페이지 탐색
 */
async function crawlPage(pageId, path = [], depth = 0, categoryName = '') {
    // 중복 방지
    if (exploredPages.has(pageId)) return;
    exploredPages.add(pageId);

    // 깊이 제한 (무한 루프 방지)
    if (depth > 10) {
        console.log(`  ⚠️ 최대 깊이 초과: ${pageId}`);
        return;
    }

    await delay(100); // Rate Limit 방지

    // 페이지 메타데이터 조회
    const page = await getPage(pageId);
    if (!page) return;

    const title = getPageTitle(page);
    const icon = getPageIcon(page);
    const indent = '  '.repeat(depth);

    console.log(`${indent}📄 ${icon} ${title}`);
    stats.pages++;

    // 블록 내용 수집
    const contentParts = [];
    let cursor = null;

    do {
        const blocksResponse = await getBlockChildren(pageId, cursor);
        if (!blocksResponse) break;

        for (const block of blocksResponse.results || []) {
            stats.blocks++;

            // 블록 텍스트 추출
            const text = blockToText(block);
            if (text) contentParts.push(text);

            // 컬럼/컬럼리스트 처리 (중요!)
            if (block.type === 'column_list' || block.type === 'column') {
                await delay(50);
                const columnBlocks = await getBlockChildren(block.id);
                if (columnBlocks && columnBlocks.results) {
                    for (const colBlock of columnBlocks.results) {
                        if (colBlock.type === 'child_page') {
                            await crawlPage(colBlock.id, [...path, title], depth + 1, categoryName || title);
                        } else if (colBlock.type === 'column') {
                            // 중첩 컬럼 처리
                            const innerBlocks = await getBlockChildren(colBlock.id);
                            if (innerBlocks && innerBlocks.results) {
                                for (const innerBlock of innerBlocks.results) {
                                    if (innerBlock.type === 'child_page') {
                                        await crawlPage(innerBlock.id, [...path, title], depth + 1, categoryName || title);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 토글 내부 탐색
            if (block.type === 'toggle' && block.has_children) {
                await delay(50);
                const toggleBlocks = await getBlockChildren(block.id);
                if (toggleBlocks && toggleBlocks.results) {
                    for (const tb of toggleBlocks.results) {
                        const toggleText = blockToText(tb);
                        if (toggleText) contentParts.push(`  ${toggleText}`);
                    }
                }
            }

            // 하위 페이지 재귀 탐색
            if (block.type === 'child_page') {
                await crawlPage(block.id, [...path, title], depth + 1, categoryName || title);
            }

            // 하위 데이터베이스 탐색
            if (block.type === 'child_database') {
                stats.databases++;
                await crawlDatabase(block.id, [...path, title], depth + 1);
            }
        }

        cursor = blocksResponse.has_more ? blocksResponse.next_cursor : null;
    } while (cursor);

    // 모든 페이지 저장 (빈 페이지도 제목은 저장)
    const content = contentParts.join('\n').trim();
    results.push({
        id: `notion-${pageId.replace(/-/g, '').slice(0, 12)}`,
        source: 'notion',
        pageId: pageId,
        question: `${icon} ${title}`.trim(),
        answer: content || `[${title}] 페이지 - 상세 내용은 Notion에서 확인`,
        metadata: {
            field: path[1] || '플래너 AI',
            topic: path.slice(1).join(' > ') || title,
            category: categoryName || path[1] || '',
            path: [...path, title],
            depth: depth,
            icon: icon,
            lastUpdated: page.last_edited_time
        }
    });
}

/**
 * 데이터베이스 레코드 탐색
 */
async function crawlDatabase(databaseId, path, depth) {
    await delay(100);

    const response = await queryDatabase(databaseId);
    if (!response || !response.results) return;

    console.log(`${'  '.repeat(depth)}📊 DB: ${response.results.length}개 레코드`);

    for (const page of response.results) {
        await crawlPage(page.id, path, depth + 1);
    }
}

/**
 * 결과를 JavaScript 파일로 저장
 */
function saveResults() {
    const timestamp = new Date().toISOString();

    const fileContent = `/**
 * Notion 데이터 백업 파일 (자동 생성)
 * 
 * 백업 일시: ${timestamp}
 * 총 항목 수: ${results.length}개
 * 탐색 페이지: ${stats.pages}개
 * 탐색 블록: ${stats.blocks}개
 * 탐색 DB: ${stats.databases}개
 * 
 * 소스: https://www.notion.so/opndoctor/AI-${ROOT_PAGE_ID.replace(/-/g, '')}
 * 
 * 업데이트 방법:
 * node scripts/notion-backup.js
 */

const NOTION_DATA = ${JSON.stringify(results, null, 2)};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NOTION_DATA };
}
`;

    const outputPath = path.join(__dirname, '..', 'notionData.js');

    fs.writeFileSync(outputPath, fileContent, 'utf-8');
    console.log(`\n✅ 저장 완료: ${outputPath}`);
}

/**
 * 메인 실행
 */
async function main() {
    console.log('🚀 Notion 전체 백업 시작...\n');
    console.log(`루트 페이지: ${ROOT_PAGE_ID}\n`);

    await crawlPage(ROOT_PAGE_ID, ['플래너 AI']);

    console.log('\n📊 통계:');
    console.log(`   페이지: ${stats.pages}개`);
    console.log(`   블록: ${stats.blocks}개`);
    console.log(`   DB: ${stats.databases}개`);
    console.log(`   추출 항목: ${results.length}개`);

    saveResults();

    console.log('\n✨ 백업 완료!');
}

main().catch(console.error);
