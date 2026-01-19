// Notion API 엔드포인트
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

    try {
        console.log('📘 Notion 데이터 로드 중...');
        console.log('API Key exists:', !!NOTION_API_KEY);

        // 1. 메인 페이지의 하위 페이지 목록 가져오기
        const pagesRes = await fetch(`https://api.notion.com/v1/blocks/${MAIN_PAGE_ID}/children?page_size=100`, {
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': '2022-06-28'
            }
        });

        const pagesData = await pagesRes.json();

        // 디버그: API 응답 확인
        if (pagesData.object === 'error') {
            return res.status(200).json({
                success: false,
                error: pagesData.message,
                code: pagesData.code,
                debug: {
                    apiKeyExists: !!NOTION_API_KEY,
                    pageId: MAIN_PAGE_ID
                }
            });
        }

        const childPages = pagesData.results?.filter(b => b.type === 'child_page') || [];
        console.log('Child pages found:', childPages.length);

        // 2. 각 하위 페이지의 내용 가져오기
        const allQA = [];

        for (const page of childPages) {
            const pageTitle = page.child_page.title;

            const blocksRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children?page_size=100`, {
                headers: {
                    'Authorization': `Bearer ${NOTION_API_KEY}`,
                    'Notion-Version': '2022-06-28'
                }
            });

            const blocksData = await blocksRes.json();
            const qaItems = extractQA(blocksData.results || [], pageTitle);
            allQA.push(...qaItems);
        }

        console.log(`✅ Notion 데이터 로드 완료: ${allQA.length}개 항목`);

        return res.status(200).json({
            success: true,
            data: allQA,
            count: allQA.length,
            debug: {
                childPagesCount: childPages.length,
                pageId: MAIN_PAGE_ID
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

// 블록에서 Q&A 추출
function extractQA(blocks, pageTitle) {
    const items = [];
    let currentQuestion = null;
    let currentAnswer = [];

    for (const block of blocks) {
        const text = getBlockText(block);
        if (!text) continue;

        // heading을 질문으로 처리
        if (block.type === 'heading_1' || block.type === 'heading_2') {
            // 이전 Q&A 저장
            if (currentQuestion && currentAnswer.length > 0) {
                items.push({
                    question: currentQuestion,
                    answer: currentAnswer.join('\n'),
                    source: 'notion',
                    metadata: { field: pageTitle, topic: pageTitle }
                });
            }
            currentQuestion = text;
            currentAnswer = [];
        } else if (currentQuestion) {
            currentAnswer.push(text);
        }
    }

    // 마지막 항목 저장
    if (currentQuestion && currentAnswer.length > 0) {
        items.push({
            question: currentQuestion,
            answer: currentAnswer.join('\n'),
            source: 'notion',
            metadata: { field: pageTitle, topic: pageTitle }
        });
    }

    return items;
}

function getBlockText(block) {
    const type = block.type;
    const content = block[type];

    if (!content || !content.rich_text) return null;

    return content.rich_text.map(t => t.plain_text).join('');
}
