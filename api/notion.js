// Notion API 엔드포인트 - 모든 콘텐츠 추출
export default async function handler(req, res) {
    // CORS 헤더
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const NOTION_API_KEY = process.env.NOTION_API_KEY;
    const MAIN_PAGE_ID = '2ed62ade-d336-8064-a192-e1269201fbd2';

    if (!NOTION_API_KEY) {
        return res.status(200).json({
            success: false,
            error: 'NOTION_API_KEY not configured',
            debug: { apiKeyExists: false }
        });
    }

    try {
        console.log('📘 Notion 전체 데이터 로드 중...');
        const allDocuments = [];

        // 1. 메인 페이지 콘텐츠 가져오기
        const mainContent = await getPageFullContent(MAIN_PAGE_ID, '플래너 AI (메인)', NOTION_API_KEY);
        if (mainContent.content) {
            allDocuments.push(mainContent);
        }

        // 2. 메인 페이지의 하위 페이지 목록 가져오기
        const mainBlocks = await fetchBlocks(MAIN_PAGE_ID, NOTION_API_KEY);
        const childPages = mainBlocks.filter(b => b.type === 'child_page');

        console.log(`📄 하위 페이지 ${childPages.length}개 발견`);

        // 3. 각 하위 페이지의 전체 콘텐츠 가져오기
        for (const page of childPages) {
            const pageTitle = page.child_page.title;
            const pageContent = await getPageFullContent(page.id, pageTitle, NOTION_API_KEY);
            if (pageContent.content) {
                allDocuments.push(pageContent);
            }

            // 하위 페이지의 하위 페이지도 가져오기 (2단계 깊이)
            if (page.has_children) {
                const subBlocks = await fetchBlocks(page.id, NOTION_API_KEY);
                const subPages = subBlocks.filter(b => b.type === 'child_page');

                for (const subPage of subPages) {
                    const subTitle = `${pageTitle} > ${subPage.child_page.title}`;
                    const subContent = await getPageFullContent(subPage.id, subTitle, NOTION_API_KEY);
                    if (subContent.content) {
                        allDocuments.push(subContent);
                    }
                }
            }
        }

        // 4. 문서를 RAG용 청크로 분할
        const chunks = [];
        for (const doc of allDocuments) {
            const docChunks = splitIntoChunks(doc.content, doc.title, 500);
            chunks.push(...docChunks);
        }

        console.log(`✅ Notion 데이터 로드 완료: ${allDocuments.length}개 문서, ${chunks.length}개 청크`);

        return res.status(200).json({
            success: true,
            data: chunks,
            count: chunks.length,
            debug: {
                documentsCount: allDocuments.length,
                pageId: MAIN_PAGE_ID,
                documentTitles: allDocuments.map(d => d.title)
            }
        });

    } catch (error) {
        console.error('Notion API 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
}

// 블록 목록 가져오기
async function fetchBlocks(blockId, apiKey) {
    const response = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': '2022-06-28'
        }
    });
    const data = await response.json();
    return data.results || [];
}

// 페이지의 전체 콘텐츠를 텍스트로 추출
async function getPageFullContent(pageId, title, apiKey) {
    const blocks = await fetchBlocks(pageId, apiKey);
    const textParts = [];

    for (const block of blocks) {
        const text = await extractBlockContent(block, apiKey);
        if (text) {
            textParts.push(text);
        }
    }

    return {
        id: pageId,
        title: title,
        content: textParts.join('\n')
    };
}

// 블록에서 텍스트 추출 (재귀적으로 하위 블록도 처리)
async function extractBlockContent(block, apiKey) {
    const type = block.type;
    let text = '';

    // 블록 타입별 텍스트 추출
    switch (type) {
        case 'paragraph':
        case 'heading_1':
        case 'heading_2':
        case 'heading_3':
        case 'bulleted_list_item':
        case 'numbered_list_item':
        case 'quote':
        case 'callout':
        case 'toggle':
            text = getRichText(block[type]?.rich_text);
            break;
        case 'to_do':
            const checked = block.to_do?.checked ? '✓' : '○';
            text = `${checked} ${getRichText(block.to_do?.rich_text)}`;
            break;
        case 'code':
            text = `[코드] ${getRichText(block.code?.rich_text)}`;
            break;
        case 'table_row':
            text = block.table_row?.cells?.map(cell => getRichText(cell)).join(' | ') || '';
            break;
        case 'child_page':
            // 하위 페이지는 별도로 처리됨
            return null;
        case 'divider':
            return '---';
        default:
            // 기타 타입은 rich_text가 있으면 추출
            if (block[type]?.rich_text) {
                text = getRichText(block[type].rich_text);
            }
    }

    // heading에는 라벨 추가
    if (type === 'heading_1') text = `## ${text}`;
    if (type === 'heading_2') text = `### ${text}`;
    if (type === 'heading_3') text = `#### ${text}`;
    if (type === 'bulleted_list_item' || type === 'numbered_list_item') text = `• ${text}`;

    // 하위 블록이 있으면 재귀적으로 추출
    if (block.has_children && type !== 'child_page') {
        try {
            const childBlocks = await fetchBlocks(block.id, apiKey);
            const childTexts = [];
            for (const child of childBlocks) {
                const childText = await extractBlockContent(child, apiKey);
                if (childText) childTexts.push('  ' + childText);
            }
            if (childTexts.length > 0) {
                text += '\n' + childTexts.join('\n');
            }
        } catch (e) {
            // 하위 블록 가져오기 실패 시 무시
        }
    }

    return text || null;
}

// rich_text 배열에서 텍스트 추출
function getRichText(richTextArray) {
    if (!richTextArray || !Array.isArray(richTextArray)) return '';
    return richTextArray.map(t => t.plain_text || '').join('');
}

// 긴 콘텐츠를 RAG용 청크로 분할
function splitIntoChunks(content, title, maxLength = 500) {
    if (!content) return [];

    const chunks = [];
    const paragraphs = content.split('\n').filter(p => p.trim());

    let currentChunk = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
        if ((currentChunk + '\n' + para).length > maxLength && currentChunk) {
            chunks.push({
                id: `notion-${title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}-${chunkIndex}`,
                question: title,  // 검색용 제목
                answer: currentChunk.trim(),
                content: currentChunk.trim(),  // 전체 콘텐츠
                source: 'notion',
                metadata: {
                    field: title.split('>')[0]?.trim() || title,
                    topic: title,
                    chunkIndex: chunkIndex
                }
            });
            currentChunk = para;
            chunkIndex++;
        } else {
            currentChunk += (currentChunk ? '\n' : '') + para;
        }
    }

    // 마지막 청크
    if (currentChunk.trim()) {
        chunks.push({
            id: `notion-${title.replace(/[^a-zA-Z0-9가-힣]/g, '_')}-${chunkIndex}`,
            question: title,
            answer: currentChunk.trim(),
            content: currentChunk.trim(),
            source: 'notion',
            metadata: {
                field: title.split('>')[0]?.trim() || title,
                topic: title,
                chunkIndex: chunkIndex
            }
        });
    }

    return chunks;
}
