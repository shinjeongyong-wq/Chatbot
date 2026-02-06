/**
 * 노션 데이터를 문단 단위로 분리하여 새 폴더에 저장
 * - 원본: data_testing/notion/
 * - 결과: data_testing/notion_rephrased/
 * - 챗봇 호환 형식 유지
 */

const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, 'notion');
const TARGET_DIR = path.join(__dirname, 'notion_rephrased');

// 디렉토리 생성 (재귀)
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// 모든 JSON 파일 찾기
function findAllJsonFiles(dir) {
    let results = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            results = results.concat(findAllJsonFiles(fullPath));
        } else if (item.endsWith('.json') && item !== 'index.json') {
            results.push(fullPath);
        }
    }

    return results;
}

// 마크다운을 문단으로 분리
function splitIntoParagraphs(content, originalQuestion, originalId) {
    const paragraphs = [];
    const lines = content.split('\n');

    let currentParagraph = null;
    let currentContent = [];
    let paragraphIndex = 0;

    // 웨이브 패턴 (특별 처리)
    const wavePattern = /^###\s+🌊\s+(1차|2차|3차)\s*웨이브/;
    // 헤더 패턴 (## 레벨에서 분리)
    const headerPattern = /^(#{1,2})\s+(.+)/;

    let inWaveSection = false;
    let currentWaveNum = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 웨이브 감지
        const waveMatch = line.match(wavePattern);
        if (waveMatch) {
            // 이전 문단 저장
            if (currentParagraph && currentContent.length > 0) {
                currentParagraph.content = currentContent.join('\n').trim();
                if (currentParagraph.content.length >= 50) {
                    currentParagraph.keywords = extractKeywords(currentParagraph.title, currentParagraph.content);
                    paragraphs.push(currentParagraph);
                }
            }

            inWaveSection = true;
            currentWaveNum = waveMatch[1];
            paragraphIndex++;

            currentParagraph = {
                id: `wave${currentWaveNum.replace('차', '')}`,
                title: line.replace(/^#+\s*/, '').trim(),
                content: '',
                keywords: [],
                originalQuestion: originalQuestion,
                originalId: originalId
            };
            currentContent = [];
            continue;
        }

        // 웨이브 섹션 종료 감지
        if (inWaveSection) {
            const nextWaveMatch = line.match(wavePattern);
            const isNewMajorSection = line.match(/^##\s+[^#]/);

            if (nextWaveMatch || isNewMajorSection) {
                if (currentParagraph && currentContent.length > 0) {
                    currentParagraph.content = currentContent.join('\n').trim();
                    if (currentParagraph.content.length >= 50) {
                        currentParagraph.keywords = extractKeywords(currentParagraph.title, currentParagraph.content);
                        paragraphs.push(currentParagraph);
                    }
                }
                inWaveSection = false;
                currentParagraph = null;
                currentContent = [];
                i--; // 다시 처리
                continue;
            } else {
                currentContent.push(line);
                continue;
            }
        }

        // 일반 헤더 처리 (## 레벨에서만 분리)
        const headerMatch = line.match(headerPattern);
        if (headerMatch) {
            const headerLevel = headerMatch[1].length;

            if (headerLevel <= 2) {
                // 이전 문단 저장
                if (currentParagraph && currentContent.length > 0) {
                    currentParagraph.content = currentContent.join('\n').trim();
                    if (currentParagraph.content.length >= 50) {
                        currentParagraph.keywords = extractKeywords(currentParagraph.title, currentParagraph.content);
                        paragraphs.push(currentParagraph);
                    }
                }

                paragraphIndex++;
                const headerText = headerMatch[2].trim();

                currentParagraph = {
                    id: `p${paragraphIndex}`,
                    title: headerText,
                    content: '',
                    keywords: [],
                    originalQuestion: originalQuestion,
                    originalId: originalId
                };
                currentContent = [];
            } else {
                // ### 이하는 현재 문단에 포함
                if (currentParagraph) {
                    currentContent.push(line);
                }
            }
        } else if (currentParagraph) {
            if (line.trim().length > 0 || currentContent.length > 0) {
                currentContent.push(line);
            }
        } else if (line.trim().length > 0) {
            // 헤더 없이 시작
            paragraphIndex++;
            currentParagraph = {
                id: 'intro',
                title: '개요',
                content: '',
                keywords: [],
                originalQuestion: originalQuestion,
                originalId: originalId
            };
            currentContent = [line];
        }
    }

    // 마지막 문단 저장
    if (currentParagraph && currentContent.length > 0) {
        currentParagraph.content = currentContent.join('\n').trim();
        if (currentParagraph.content.length >= 50) {
            currentParagraph.keywords = extractKeywords(currentParagraph.title, currentParagraph.content);
            paragraphs.push(currentParagraph);
        }
    }

    return paragraphs;
}

// 키워드 추출
function extractKeywords(title, content) {
    const keywords = new Set();
    const fullText = title + ' ' + content;

    // 웨이브 키워드
    if (fullText.includes('1차 웨이브') || fullText.includes('1차웨이브')) {
        keywords.add('1차 웨이브');
        keywords.add('개업 로드맵');
    }
    if (fullText.includes('2차 웨이브') || fullText.includes('2차웨이브')) {
        keywords.add('2차 웨이브');
        keywords.add('개업 로드맵');
    }
    if (fullText.includes('3차 웨이브') || fullText.includes('3차웨이브')) {
        keywords.add('3차 웨이브');
        keywords.add('개업 로드맵');
    }

    // 의료기기 키워드
    if (fullText.includes('C-Arm')) keywords.add('C-Arm');
    if (fullText.includes('초음파')) keywords.add('초음파');
    if (fullText.includes('고주파')) keywords.add('고주파');
    if (fullText.includes('체외충격파')) keywords.add('체외충격파');
    if (fullText.includes('레이저')) keywords.add('레이저');
    if (fullText.includes('MRI')) keywords.add('MRI');
    if (fullText.includes('CT')) keywords.add('CT');

    // 제목 키워드
    const cleanTitle = title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[#▸✅📌💰🏦🚧⚠️🧭🔧🧱🤝🗓️📑🖥️🌡️🪑💻🧹💉🌊\s]+/gu, '').trim();
    if (cleanTitle.length > 1) {
        keywords.add(cleanTitle);
    }

    // 한글 명사 추출
    const koreanWords = fullText.match(/[가-힣]{2,}/g) || [];
    const wordCount = {};
    const stopwords = ['하면', '되면', '경우', '때문', '있습니다', '합니다', '입니다', '것입니다', '있음', '없음', '필요', '가능', '진행', '확인', '관련', '해당', '통해', '위해', '대한', '따라', '있는', '하는', '되는'];

    koreanWords.forEach(word => {
        if (!stopwords.includes(word) && word.length >= 2) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    });

    Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .forEach(([word]) => keywords.add(word));

    return Array.from(keywords);
}

// 메인 실행
async function main() {
    console.log('📂 노션 데이터 문단 분리 시작...\n');
    console.log(`   원본: ${SOURCE_DIR}`);
    console.log(`   결과: ${TARGET_DIR}\n`);

    // 타겟 디렉토리 생성
    ensureDir(TARGET_DIR);

    const jsonFiles = findAllJsonFiles(SOURCE_DIR);
    console.log(`📄 총 ${jsonFiles.length}개 JSON 파일 발견\n`);

    let totalOriginalItems = 0;
    let totalParagraphItems = 0;

    for (const filePath of jsonFiles) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const relativePath = path.relative(SOURCE_DIR, filePath);
            const targetPath = path.join(TARGET_DIR, relativePath);

            // 타겟 디렉토리 생성
            ensureDir(path.dirname(targetPath));

            // 새 items 배열 생성
            const newItems = [];

            if (data.items && Array.isArray(data.items)) {
                for (const item of data.items) {
                    totalOriginalItems++;

                    if (item.answer) {
                        const paragraphs = splitIntoParagraphs(
                            item.answer,
                            item.question || '',
                            item.id || ''
                        );

                        // 각 문단을 별도 아이템으로 저장
                        for (const para of paragraphs) {
                            newItems.push({
                                id: `${item.id}-${para.id}`,
                                source: item.source || 'notion',
                                pageId: item.pageId || '',
                                question: `${item.question} - ${para.title}`,
                                answer: para.content,
                                metadata: {
                                    ...item.metadata,
                                    originalQuestion: item.question,
                                    originalId: item.id,
                                    paragraphTitle: para.title,
                                    keywords: para.keywords
                                }
                            });
                            totalParagraphItems++;
                        }
                    }
                }
            }

            // 단일 answer인 경우
            if (data.answer && !data.items) {
                totalOriginalItems++;
                const paragraphs = splitIntoParagraphs(
                    data.answer,
                    data.question || '',
                    data.id || ''
                );

                for (const para of paragraphs) {
                    newItems.push({
                        id: `${data.id}-${para.id}`,
                        source: data.source || 'notion',
                        pageId: data.pageId || '',
                        question: `${data.question} - ${para.title}`,
                        answer: para.content,
                        metadata: {
                            originalQuestion: data.question,
                            originalId: data.id,
                            paragraphTitle: para.title,
                            keywords: para.keywords
                        }
                    });
                    totalParagraphItems++;
                }
            }

            // 새 파일 저장
            const newData = {
                category: data.category || '',
                subCategory: data.subCategory || '',
                itemCount: newItems.length,
                lastUpdated: new Date().toISOString(),
                items: newItems
            };

            fs.writeFileSync(targetPath, JSON.stringify(newData, null, 2), 'utf-8');
            console.log(`  ✅ ${relativePath} (${newItems.length}개 문단)`);

        } catch (err) {
            console.error(`  ❌ ${filePath}: ${err.message}`);
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ 문단 분리 완료!`);
    console.log(`   원본 문서: ${totalOriginalItems}개`);
    console.log(`   분리된 문단: ${totalParagraphItems}개`);
    console.log(`   저장 위치: ${TARGET_DIR}`);
    console.log('='.repeat(50));
}

main().catch(console.error);
