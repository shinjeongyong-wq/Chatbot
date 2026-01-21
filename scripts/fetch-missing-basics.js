const fs = require('fs');
const path = require('path');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2022-06-28';
const OUTPUT_DIR = path.join(__dirname, '..', 'data', 'notion');

async function notionAPI(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': 'Bearer ' + NOTION_API_KEY,
            'Notion-Version': NOTION_VERSION,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch('https://api.notion.com/v1' + endpoint, options);
    return await response.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getPageBlocksDeep(pageId, depth = 0) {
    if (depth >= 10) return [];
    const blocks = [];
    let hasMore = true, startCursor = undefined;

    while (hasMore) {
        const url = '/blocks/' + pageId + '/children?page_size=100' + (startCursor ? '&start_cursor=' + startCursor : '');
        const response = await notionAPI(url);
        if (!response.results) break;

        for (const block of response.results) {
            blocks.push(block);
            if (block.has_children && block.type !== 'child_page' && block.type !== 'child_database') {
                const children = await getPageBlocksDeep(block.id, depth + 1);
                block.children = children;
            }
            if (block.type === 'child_page') {
                const childPageBlocks = await getPageBlocksDeep(block.id, depth + 1);
                block.childPageContent = childPageBlocks;
                await sleep(200);
            }
        }
        hasMore = response.has_more;
        startCursor = response.next_cursor;
        await sleep(200);
    }
    return blocks;
}

function extractTextFromBlocksDeep(blocks, depth = 0) {
    const lines = [];
    for (const block of blocks) {
        const type = block.type;
        const content = block[type];
        let text = content?.rich_text?.map(t => t.plain_text).join('') || '';

        switch (type) {
            case 'heading_1': if (text) lines.push('# ' + text); break;
            case 'heading_2': if (text) lines.push('## ' + text); break;
            case 'heading_3': if (text) lines.push('### ' + text); break;
            case 'paragraph': if (text) lines.push(text); break;
            case 'bulleted_list_item': if (text) lines.push('• ' + text); break;
            case 'numbered_list_item': if (text) lines.push('1. ' + text); break;
            case 'toggle': if (text) lines.push('▸ ' + text); break;
            case 'callout': if (text) lines.push((content.icon?.emoji || '💡') + ' ' + text); break;
            case 'code': if (text) lines.push('```\n' + text + '\n```'); break;
            case 'child_page':
                if (content.title) lines.push('\n### 📄 ' + content.title);
                if (block.childPageContent?.length > 0) {
                    lines.push(extractTextFromBlocksDeep(block.childPageContent, depth + 1));
                }
                break;
        }
        if (block.children?.length > 0) {
            lines.push(extractTextFromBlocksDeep(block.children, depth + 1));
        }
    }
    return lines.join('\n');
}

// 누락된 페이지 매핑
const PAGE_MAPPINGS = {
    '인테리어 (기본편)': { category: 'hospital-basics', subCategory: 'pre-construction/interior', icon: '🏠' },
    '간판 (기본편)': { category: 'hospital-basics', subCategory: 'pre-construction/signage', icon: '🪧' },
    '의료기기 (기본편)': { category: 'hospital-basics', subCategory: 'pre-construction/medical-device', icon: '🏥' },
    '세무': { category: 'hospital-basics', subCategory: 'pre-construction/tax-loan', icon: '💰' },
    '철거 및 운영 필수 설비': { category: 'hospital-basics', subCategory: 'pre-construction/demolition', icon: '🔧' },
    '가구': { category: 'hospital-basics', subCategory: 'during-construction/furniture', icon: '🪑' },
    '행정 업무': { category: 'hospital-basics', subCategory: 'post-opening/admin', icon: '📋' },
    'EMR & CRM': { category: 'hospital-basics', subCategory: 'post-opening/emr-crm', icon: '💻' },
    '관리 관련 업체': { category: 'hospital-basics', subCategory: 'post-opening/management', icon: '🏢' }
};

async function main() {
    console.log('=== 누락된 기본편 페이지 수집 시작 ===\n');

    // 전체 검색
    const searchResult = await notionAPI('/search', 'POST', { page_size: 100 });
    const allPages = searchResult.results.filter(r => r.object === 'page');

    for (const [targetTitle, mapping] of Object.entries(PAGE_MAPPINGS)) {
        const page = allPages.find(p => {
            const title = p.properties?.title?.title?.[0]?.plain_text ||
                p.properties?.['이름']?.title?.[0]?.plain_text || '';
            return title.trim() === targetTitle || title.trim().startsWith(targetTitle);
        });

        if (!page) {
            console.log('❌ 찾을 수 없음:', targetTitle);
            continue;
        }

        const title = page.properties?.title?.title?.[0]?.plain_text ||
            page.properties?.['이름']?.title?.[0]?.plain_text || targetTitle;

        console.log('📄 수집 중:', title);

        // 콘텐츠 수집
        const blocks = await getPageBlocksDeep(page.id);
        const content = extractTextFromBlocksDeep(blocks);
        console.log('   → 콘텐츠 길이:', content.length + '자');

        // 파일 생성
        const item = {
            id: 'notion-' + page.id.replace(/-/g, '').slice(0, 12),
            source: 'notion',
            pageId: page.id,
            question: mapping.icon + ' ' + title,
            answer: content,
            metadata: {
                field: '플래너 AI',
                topic: title,
                category: '페이지',
                icon: mapping.icon,
                lastUpdated: page.last_edited_time,
                parentType: page.parent?.type,
                structuredCategory: mapping.category,
                structuredSubCategory: mapping.subCategory
            }
        };

        const filePath = path.join(OUTPUT_DIR, mapping.category, mapping.subCategory + '.json');

        const fileData = {
            category: mapping.category,
            subCategory: mapping.subCategory,
            itemCount: 1,
            lastUpdated: new Date().toISOString(),
            items: [item]
        };

        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2), 'utf-8');

        console.log('   ✅ 저장:', filePath.replace(OUTPUT_DIR + path.sep, ''));

        await sleep(500);
    }

    console.log('\n=== 완료 ===');
}

main().catch(console.error);
