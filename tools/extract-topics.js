// 주제 추출 스크립트 - Node.js에서 실행
const fs = require('fs');
const path = require('path');

const NOTION_DATA_PATH = './data/notion';
const OUTPUT_FILE = './topics.json';

async function extractTopics() {
    const topics = [];
    const categories = new Set();

    // 1. 노션 index.json 읽기
    const indexPath = path.join(NOTION_DATA_PATH, 'index.json');
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

    console.log(`📚 노션 데이터: ${indexData.totalItems}개 아이템`);

    // 2. 각 카테고리별 JSON 파일 읽기
    for (const [categoryPath, categoryInfo] of Object.entries(indexData.categories)) {
        const parts = categoryPath.split('/');
        const folder = parts.slice(0, -1).join('/') || parts[0];
        const fileName = categoryInfo.file;

        // 파일 경로 구성
        let filePath;
        if (parts.length === 2) {
            filePath = path.join(NOTION_DATA_PATH, parts[0], fileName);
        } else if (parts.length === 3) {
            filePath = path.join(NOTION_DATA_PATH, parts[0], parts[1], fileName);
        } else if (parts.length === 4) {
            filePath = path.join(NOTION_DATA_PATH, parts[0], parts[1], parts[2], fileName);
        } else {
            filePath = path.join(NOTION_DATA_PATH, parts[0], fileName);
        }

        try {
            if (fs.existsSync(filePath)) {
                const fileData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

                if (fileData.items && Array.isArray(fileData.items)) {
                    for (const item of fileData.items) {
                        const topic = {
                            id: item.id || `notion-${topics.length}`,
                            title: item.question || item.metadata?.topic || 'Untitled',
                            category: fileData.category || categoryPath.split('/')[0],
                            subCategory: fileData.subCategory || categoryPath,
                            keywords: extractKeywords(item.question, item.answer),
                            source: 'notion'
                        };
                        topics.push(topic);
                        categories.add(topic.category);
                    }
                }
            }
        } catch (err) {
            console.warn(`⚠️ 파일 읽기 실패: ${filePath}`, err.message);
        }
    }

    // 3. 결과 저장
    const result = {
        generatedAt: new Date().toISOString(),
        totalTopics: topics.length,
        categories: Array.from(categories),
        topics: topics
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');

    console.log(`\n✅ 주제 추출 완료!`);
    console.log(`📊 총 ${topics.length}개 주제`);
    console.log(`📁 카테고리: ${Array.from(categories).join(', ')}`);
    console.log(`💾 저장 위치: ${OUTPUT_FILE}`);

    // 샘플 10개 출력
    console.log(`\n📋 샘플 10개:`);
    topics.slice(0, 10).forEach((t, i) => {
        console.log(`  ${i + 1}. [${t.category}] ${t.title.substring(0, 50)}...`);
    });

    return result;
}

function extractKeywords(question, answer) {
    const text = `${question || ''} ${answer || ''}`.substring(0, 500);

    // 주요 키워드 패턴 (한글 명사, 영문 등)
    const keywords = [];

    // 간단히 question에서 주요 단어 추출
    if (question) {
        const words = question.replace(/[^\w\s가-힣]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 2 && w.length <= 20);
        keywords.push(...words.slice(0, 5));
    }

    return [...new Set(keywords)];
}

// 실행
extractTopics().catch(console.error);
