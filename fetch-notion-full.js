// Notion 페이지 전체 내용 추출 스크립트 (v3 - 번호 연속 유지)
const https = require('https');
const fs = require('fs');

const NOTION_API_KEY = process.env.NOTION_API_KEY || 'YOUR_NOTION_API_KEY';
const PAGE_ID = '2fc62aded33680dab39cc1bcfeadcb47';

// Notion API 호출 함수
function notionRequest(path) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.notion.com',
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// 블록의 텍스트 추출
function extractText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return '';
    return richTextArray.map(t => t.plain_text || '').join('');
}

// 표 행을 마크다운으로 변환
function tableRowToMarkdown(cells) {
    if (!cells || !Array.isArray(cells)) return '';
    const cellTexts = cells.map(cell => extractText(cell));
    return '| ' + cellTexts.join(' | ') + ' |';
}

// 번호 리스트 카운터를 레벨별로 관리하는 클래스
class NumberedListTracker {
    constructor() {
        this.counters = {}; // 레벨별 카운터
        this.lastNumberedLevel = null; // 마지막 numbered_list_item의 레벨
    }

    getNextNumber(level) {
        // 해당 레벨의 카운터 증가
        if (!this.counters[level]) {
            this.counters[level] = 0;
        }
        this.counters[level]++;
        this.lastNumberedLevel = level;
        return this.counters[level];
    }

    // 다른 타입의 블록이 나왔을 때 - 카운터 리셋하지 않음 (같은 레벨 내에서)
    // heading이나 divider 등 "리스트 그룹을 나누는" 블록이 나오면 리셋
    resetIfNeeded(blockType, level) {
        const listBreakers = ['heading_1', 'heading_2', 'heading_3', 'divider'];
        if (listBreakers.includes(blockType)) {
            // heading이나 divider가 나오면 해당 레벨 이하의 모든 카운터 리셋
            for (const key of Object.keys(this.counters)) {
                if (parseInt(key) <= level) {
                    this.counters[key] = 0;
                }
            }
        }
    }
}

// 블록을 마크다운으로 변환
function blockToMarkdown(block, context) {
    const type = block.type;
    const indent = context.indent || '';
    let text = '';

    switch (type) {
        case 'paragraph':
            text = extractText(block.paragraph?.rich_text);
            return text ? `${indent}${text}` : '';
        case 'heading_1':
            text = extractText(block.heading_1?.rich_text);
            return `${indent}# ${text}`;
        case 'heading_2':
            text = extractText(block.heading_2?.rich_text);
            return `${indent}## ${text}`;
        case 'heading_3':
            text = extractText(block.heading_3?.rich_text);
            return `${indent}### ${text}`;
        case 'bulleted_list_item':
            text = extractText(block.bulleted_list_item?.rich_text);
            return `${indent}- ${text}`;
        case 'numbered_list_item':
            text = extractText(block.numbered_list_item?.rich_text);
            const num = context.numberedListCounter || 1;
            return `${indent}${num}. ${text}`;
        case 'quote':
            text = extractText(block.quote?.rich_text);
            return `${indent}> ${text}`;
        case 'callout':
            text = extractText(block.callout?.rich_text);
            const icon = block.callout?.icon?.emoji || '💡';
            return `${indent}${icon} ${text}`;
        case 'divider':
            return `${indent}---`;
        case 'toggle':
            text = extractText(block.toggle?.rich_text);
            return `${indent}▸ ${text}`;
        case 'to_do':
            text = extractText(block.to_do?.rich_text);
            const checked = block.to_do?.checked ? '☑' : '☐';
            return `${indent}${checked} ${text}`;
        case 'code':
            text = extractText(block.code?.rich_text);
            return `${indent}\`\`\`\n${text}\n\`\`\``;
        case 'table':
            return 'TABLE_PLACEHOLDER';
        case 'table_row':
            return tableRowToMarkdown(block.table_row?.cells);
        default:
            return '';
    }
}

// 테이블 행 가져오기
async function fetchTableRows(tableBlockId) {
    const result = [];

    try {
        const response = await notionRequest(`/v1/blocks/${tableBlockId}/children?page_size=100`);

        if (!response.results) return result;

        let isFirstRow = true;
        for (const block of response.results) {
            if (block.type === 'table_row') {
                const rowMarkdown = tableRowToMarkdown(block.table_row?.cells);
                if (rowMarkdown) {
                    result.push(rowMarkdown);

                    if (isFirstRow) {
                        const cellCount = block.table_row?.cells?.length || 0;
                        const separator = '| ' + Array(cellCount).fill('---').join(' | ') + ' |';
                        result.push(separator);
                        isFirstRow = false;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching table rows:', tableBlockId, error.message);
    }

    return result;
}

// 인덴트 레벨 계산
function getIndentLevel(indent) {
    return (indent.match(/  /g) || []).length;
}

// 재귀적으로 모든 블록 가져오기 (글로벌 번호 추적)
async function fetchBlocksRecursively(blockId, indent = '', tracker = null) {
    const result = [];

    // 트래커가 없으면 새로 생성
    if (!tracker) {
        tracker = new NumberedListTracker();
    }

    const level = getIndentLevel(indent);

    try {
        const response = await notionRequest(`/v1/blocks/${blockId}/children?page_size=100`);

        if (!response.results) {
            console.error('No results for block:', blockId);
            return result;
        }

        for (const block of response.results) {
            const currentType = block.type;

            // heading이나 divider면 카운터 리셋
            tracker.resetIfNeeded(currentType, level);

            let numberedListCounter = 0;
            if (currentType === 'numbered_list_item') {
                numberedListCounter = tracker.getNextNumber(level);
            }

            const context = {
                indent: indent,
                numberedListCounter: numberedListCounter
            };

            // 테이블 처리
            if (currentType === 'table') {
                const tableRows = await fetchTableRows(block.id);
                if (tableRows.length > 0) {
                    result.push(...tableRows);
                }
            } else {
                const markdown = blockToMarkdown(block, context);
                if (markdown && markdown !== 'TABLE_PLACEHOLDER') {
                    result.push(markdown);
                }

                // 하위 블록이 있으면 재귀 호출
                if (block.has_children && currentType !== 'table') {
                    // 자식 블록을 위한 새 트래커 생성 (각 하위 레벨은 독립적인 번호)
                    const childTracker = new NumberedListTracker();
                    const children = await fetchBlocksRecursively(block.id, indent + '  ', childTracker);
                    result.push(...children);
                }
            }
        }
    } catch (error) {
        console.error('Error fetching block:', blockId, error.message);
    }

    return result;
}

// 페이지 메타데이터 가져오기
async function fetchPageMetadata(pageId) {
    const response = await notionRequest(`/v1/pages/${pageId}`);
    return {
        id: response.id,
        title: extractText(response.properties?.title?.title),
        createdTime: response.created_time,
        lastEditedTime: response.last_edited_time,
        url: response.url
    };
}

// 메인 실행
async function main() {
    console.log('Notion 페이지 전체 내용 추출 시작 (v3 - 번호 연속 유지)...\n');

    const metadata = await fetchPageMetadata(PAGE_ID);
    console.log('페이지 제목:', metadata.title);
    console.log('마지막 수정:', metadata.lastEditedTime);
    console.log('\n블록 추출 중...\n');

    const allContent = await fetchBlocksRecursively(PAGE_ID);

    const fullDocument = {
        id: `notion-${PAGE_ID}`,
        type: 'guide',
        title: metadata.title,
        content: allContent.join('\n'),
        metadata: {
            source: 'notion',
            pageId: PAGE_ID,
            url: metadata.url,
            createdTime: metadata.createdTime,
            lastEditedTime: metadata.lastEditedTime
        }
    };

    fs.writeFileSync('notion_full_content.json', JSON.stringify(fullDocument, null, 2), 'utf8');
    fs.writeFileSync('notion_roadmap.md', `# ${metadata.title}\n\n${allContent.join('\n')}`, 'utf8');

    console.log('\n=== 추출 완료 ===');
    console.log('총 블록 수:', allContent.length);
    console.log('저장 위치: notion_full_content.json, notion_roadmap.md');

    // 번호 리스트 미리보기 (2차 웨이브 부분 확인)
    console.log('\n=== 2차 웨이브 부분 미리보기 ===');
    const wave2Start = allContent.findIndex(line => line.includes('2차 웨이브'));
    if (wave2Start >= 0) {
        console.log(allContent.slice(wave2Start, wave2Start + 25).join('\n'));
    }
}

main().catch(console.error);
