// Notion API 데이터 로더
// 노션 데이터를 가져와서 Google Sheets와 함께 RAG에 사용

class NotionLoader {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.notion.com/v1';
        this.cache = [];
        this.isLoaded = false;
    }

    async loadData() {
        try {
            console.log('📘 Notion 데이터 로딩 중...');

            // 메인 페이지 ID (플래너 AI)
            const mainPageId = '2ed62ade-d336-8064-a192-e1269201fbd2';

            // 모든 하위 페이지 가져오기
            const pages = await this.getAllPages(mainPageId);

            // 각 페이지의 내용을 Q&A 형태로 변환
            for (const page of pages) {
                const blocks = await this.getPageBlocks(page.id);
                const qaItems = this.extractQA(blocks, page.title);
                this.cache.push(...qaItems);
            }

            this.isLoaded = true;
            console.log(`✅ Notion 데이터 로드 완료: ${this.cache.length}개 항목`);
            return this.cache;
        } catch (error) {
            console.error('Notion 로드 오류:', error);
            return [];
        }
    }

    async getAllPages(pageId) {
        const response = await fetch(`${this.baseUrl}/blocks/${pageId}/children`, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        const data = await response.json();
        const pages = [];

        for (const block of data.results || []) {
            if (block.type === 'child_page') {
                pages.push({
                    id: block.id,
                    title: block.child_page.title
                });
            }
        }

        return pages;
    }

    async getPageBlocks(pageId) {
        const response = await fetch(`${this.baseUrl}/blocks/${pageId}/children`, {
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Notion-Version': '2022-06-28'
            }
        });

        const data = await response.json();
        return data.results || [];
    }

    extractQA(blocks, pageTitle) {
        const items = [];
        let currentQuestion = null;
        let currentAnswer = [];

        for (const block of blocks) {
            const text = this.getBlockText(block);
            if (!text) continue;

            // heading_1, heading_2를 질문으로 처리
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
                // paragraph, bullet 등을 답변으로 처리
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

    getBlockText(block) {
        const type = block.type;
        const content = block[type];

        if (!content || !content.rich_text) return null;

        return content.rich_text.map(t => t.plain_text).join('');
    }

    // RAG 검색
    searchRelatedContext(query, maxResults = 5) {
        if (!this.isLoaded || this.cache.length === 0) {
            return [];
        }

        const keywords = query.toLowerCase().split(/\s+/);

        const results = this.cache.map(item => {
            const text = `${item.question} ${item.answer}`.toLowerCase();
            let score = 0;

            for (const keyword of keywords) {
                if (text.includes(keyword)) {
                    score += 1;
                }
            }

            return { ...item, score };
        })
            .filter(r => r.score > 0)
            .sort((a, b) => b.score - a.score);

        return results.slice(0, maxResults);
    }
}

// 전역 인스턴스 (Google Sheets와 함께 사용)
// API 키는 서버에서 관리
