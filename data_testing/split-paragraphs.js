/**
 * 노션 문서를 문단 단위로 분리하는 스크립트 v3
 * - 웨이브 섹션은 하나의 덩어리로 유지 (### 웨이브 ~ 다음 ### 또는 ---까지)
 * - 통증 의료기기 등 다른 문서도 적절한 단위로 분리
 */

const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');
const OUTPUT_FILE = path.join(__dirname, 'paragraphs.json');

// 모든 JSON 파일을 재귀적으로 찾기
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

// 마크다운 텍스트를 문단으로 분리 (개선된 버전 v3)
function splitIntoParagraphs(content, sourceDoc, originalQuestion, originalId) {
    const paragraphs = [];
    const lines = content.split('\n');

    let currentParagraph = null;
    let currentContent = [];
    let paragraphIndex = 0;

    // 웨이브 패턴 (특별 처리 - 하위 섹션 포함)
    const wavePattern = /^###\s+🌊\s+(1차|2차|3차)\s*웨이브/;
    // 일반 헤더 패턴
    const headerPattern = /^(#{1,4})\s+(.+)/;
    // 섹션 구분자
    const sectionDivider = /^---+$/;

    let inWaveSection = false;
    let currentWaveNum = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // 웨이브 시작 감지
        const waveMatch = line.match(wavePattern);
        if (waveMatch) {
            // 이전 문단 저장
            if (currentParagraph && currentContent.length > 0) {
                saveParagraph(currentParagraph, currentContent, paragraphs);
            }

            inWaveSection = true;
            currentWaveNum = waveMatch[1];
            paragraphIndex++;

            currentParagraph = {
                id: `wave${currentWaveNum.replace('차', '')}`,
                sourceDoc: path.relative(NOTION_DIR, sourceDoc).replace(/\\/g, '/'),
                title: line.replace(/^#+\s*/, '').trim(),
                headerLevel: 3,
                content: '',
                keywords: [],
                originalQuestion: originalQuestion || '',
                originalId: originalId || ''
            };
            currentContent = [];
            continue;
        }

        // 웨이브 섹션 종료 감지 (다음 ### 웨이브 또는 ---)
        if (inWaveSection) {
            const nextWaveMatch = line.match(wavePattern);
            const isDivider = sectionDivider.test(line);
            const isNewMajorSection = line.match(/^##\s+[^#]/);

            if (nextWaveMatch || isDivider || isNewMajorSection) {
                // 웨이브 섹션 저장
                if (currentParagraph && currentContent.length > 0) {
                    saveParagraph(currentParagraph, currentContent, paragraphs);
                }
                inWaveSection = false;
                currentParagraph = null;
                currentContent = [];

                // 다음 웨이브면 다시 처리
                if (nextWaveMatch) {
                    i--; // 다시 이 줄 처리
                    continue;
                }

                // 구분자는 스킵
                if (isDivider) continue;

                // 새 주요 섹션 시작
                if (isNewMajorSection) {
                    i--; // 다시 이 줄 처리
                    continue;
                }
            } else {
                // 웨이브 섹션 내부 - 하위 헤더(✅ 핵심 항목 등)도 포함
                currentContent.push(line);
                continue;
            }
        }

        // 일반 헤더 처리 (## 레벨 기준)
        const headerMatch = line.match(headerPattern);
        if (headerMatch) {
            const headerLevel = headerMatch[1].length;

            // ## 레벨에서만 새 문단 시작 (### 이하는 합침)
            if (headerLevel <= 2) {
                // 이전 문단 저장
                if (currentParagraph && currentContent.length > 0) {
                    saveParagraph(currentParagraph, currentContent, paragraphs);
                }

                paragraphIndex++;
                const headerText = headerMatch[2].trim();

                currentParagraph = {
                    id: `${path.basename(sourceDoc, '.json')}-p${paragraphIndex}`,
                    sourceDoc: path.relative(NOTION_DIR, sourceDoc).replace(/\\/g, '/'),
                    title: headerText,
                    headerLevel: headerLevel,
                    content: '',
                    keywords: [],
                    originalQuestion: originalQuestion || '',
                    originalId: originalId || ''
                };
                currentContent = [];
            } else {
                // ### 이하는 현재 문단에 포함
                if (currentParagraph) {
                    currentContent.push(line);
                }
            }
        } else if (currentParagraph) {
            // 현재 문단에 내용 추가
            if (line.trim().length > 0 || currentContent.length > 0) {
                currentContent.push(line);
            }
        } else if (line.trim().length > 0) {
            // 헤더 없이 시작하는 내용 (문서 시작 부분)
            paragraphIndex++;
            currentParagraph = {
                id: `${path.basename(sourceDoc, '.json')}-intro`,
                sourceDoc: path.relative(NOTION_DIR, sourceDoc).replace(/\\/g, '/'),
                title: '개요',
                headerLevel: 1,
                content: '',
                keywords: [],
                originalQuestion: originalQuestion || '',
                originalId: originalId || ''
            };
            currentContent = [line];
        }
    }

    // 마지막 문단 저장
    if (currentParagraph && currentContent.length > 0) {
        saveParagraph(currentParagraph, currentContent, paragraphs);
    }

    return paragraphs;
}

// 문단 저장 (키워드 추출 포함)
function saveParagraph(paragraph, contentLines, paragraphs) {
    paragraph.content = contentLines.join('\n').trim();

    // 너무 짧은 문단 제외 (50자 미만)
    if (paragraph.content.length < 50) return;

    paragraph.keywords = extractKeywords(paragraph.title, paragraph.content);
    paragraphs.push(paragraph);
}

// 키워드 추출 (개선된 버전)
function extractKeywords(title, content) {
    const keywords = new Set();
    const fullText = title + ' ' + content;

    // 웨이브 관련 키워드
    if (fullText.includes('1차 웨이브') || fullText.includes('1차웨이브')) {
        keywords.add('1차 웨이브');
        keywords.add('1차웨이브');
        keywords.add('개업 로드맵');
        keywords.add('개원 프로세스');
    }
    if (fullText.includes('2차 웨이브') || fullText.includes('2차웨이브')) {
        keywords.add('2차 웨이브');
        keywords.add('2차웨이브');
        keywords.add('개업 로드맵');
        keywords.add('개원 프로세스');
    }
    if (fullText.includes('3차 웨이브') || fullText.includes('3차웨이브')) {
        keywords.add('3차 웨이브');
        keywords.add('3차웨이브');
        keywords.add('개업 로드맵');
        keywords.add('개원 프로세스');
    }

    // 통증 의료기기 관련 키워드
    if (fullText.includes('통증') && (fullText.includes('의료기기') || fullText.includes('장비'))) {
        keywords.add('통증 의료기기');
        keywords.add('통증 장비');
    }
    if (fullText.includes('C-Arm') || fullText.includes('씨암')) {
        keywords.add('C-Arm');
        keywords.add('씨암');
        keywords.add('통증 의료기기');
    }
    if (fullText.includes('초음파')) {
        keywords.add('초음파');
        keywords.add('통증 의료기기');
    }
    if (fullText.includes('고주파') || fullText.includes('RF')) {
        keywords.add('고주파');
        keywords.add('RF');
        keywords.add('통증 의료기기');
    }
    if (fullText.includes('체외충격파') || fullText.includes('ESWT')) {
        keywords.add('체외충격파');
        keywords.add('ESWT');
        keywords.add('통증 의료기기');
    }
    if (fullText.includes('레이저') || fullText.includes('HILT')) {
        keywords.add('레이저');
        keywords.add('HILT');
        keywords.add('통증 의료기기');
    }

    // 제목 자체를 키워드로 추가 (이모지 제거)
    const cleanTitle = title.replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[#▸✅📌💰🏦🚧⚠️🧭🔧🧱🤝🗓️📑🖥️🌡️🪑💻🧹💉🌊\s]+/gu, '').trim();
    if (cleanTitle.length > 1) {
        keywords.add(cleanTitle);
    }

    // 핵심 명사 추출
    const koreanWords = fullText.match(/[가-힣]{2,}/g) || [];
    const wordCount = {};
    koreanWords.forEach(word => {
        const stopwords = ['하면', '되면', '경우', '때문', '있습니다', '합니다', '입니다', '것입니다', '있음', '없음', '필요', '가능', '진행', '확인', '관련', '해당', '통해', '위해', '대한', '따라', '있는', '하는', '되는', '이상', '정도', '수도', '부분', '항목', '단계', '구간', '그래서', '그리고', '하지만', '때문에'];
        if (!stopwords.includes(word) && word.length >= 2) {
            wordCount[word] = (wordCount[word] || 0) + 1;
        }
    });

    // 빈도순 정렬 후 상위 키워드 추가
    Object.entries(wordCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .forEach(([word]) => keywords.add(word));

    return Array.from(keywords);
}

// 메인 실행
async function main() {
    console.log('📂 노션 문서 문단 분리 v3 시작...\n');

    const jsonFiles = findAllJsonFiles(NOTION_DIR);
    console.log(`📄 총 ${jsonFiles.length}개 JSON 파일 발견\n`);

    const allParagraphs = [];
    let totalDocs = 0;

    for (const filePath of jsonFiles) {
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const relativePath = path.relative(NOTION_DIR, filePath);

            // items 배열이 있는 경우
            if (data.items && Array.isArray(data.items)) {
                for (const item of data.items) {
                    if (item.answer) {
                        const paragraphs = splitIntoParagraphs(
                            item.answer,
                            filePath,
                            item.question || '',
                            item.id || ''
                        );
                        allParagraphs.push(...paragraphs);
                        totalDocs++;
                    }
                }
            }

            // 단일 answer가 있는 경우
            if (data.answer && !data.items) {
                const paragraphs = splitIntoParagraphs(
                    data.answer,
                    filePath,
                    data.question || '',
                    data.id || ''
                );
                allParagraphs.push(...paragraphs);
                totalDocs++;
            }

            console.log(`  ✅ ${relativePath}`);
        } catch (err) {
            console.error(`  ❌ ${filePath}: ${err.message}`);
        }
    }

    // 결과 저장
    const output = {
        version: '3.0',
        generatedAt: new Date().toISOString(),
        totalDocuments: totalDocs,
        totalParagraphs: allParagraphs.length,
        paragraphs: allParagraphs
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

    console.log('\n' + '='.repeat(50));
    console.log(`✅ 문단 분리 완료!`);
    console.log(`   - 처리된 문서: ${totalDocs}개`);
    console.log(`   - 생성된 문단: ${allParagraphs.length}개`);
    console.log(`   - 저장 위치: ${OUTPUT_FILE}`);
    console.log('='.repeat(50));

    // 웨이브 문단 내용 확인
    console.log('\n📊 웨이브 문단 내용 확인:');

    for (const waveNum of ['1', '2', '3']) {
        const wavePara = allParagraphs.find(p => p.id === `wave${waveNum}`);
        if (wavePara) {
            console.log(`\n   🌊 ${waveNum}차 웨이브:`);
            console.log(`      제목: ${wavePara.title}`);
            console.log(`      내용 길이: ${wavePara.content.length}자`);
            console.log(`      키워드: ${wavePara.keywords.slice(0, 8).join(', ')}`);

            // 핵심 항목 포함 여부
            const content = wavePara.content;
            if (waveNum === '1') {
                const checks = ['대출', '세무', '인테리어', '간판', '홈페이지', 'PC', '마케팅', '채용'];
                const found = checks.filter(k => content.includes(k));
                console.log(`      핵심 항목 포함: ${found.length}/${checks.length} (${found.join(', ')})`);
            } else if (waveNum === '2') {
                const checks = ['가구', '가전', '정수기', '유니폼', 'EMR', 'CRM', '폐기물'];
                const found = checks.filter(k => content.includes(k));
                console.log(`      핵심 항목 포함: ${found.length}/${checks.length} (${found.join(', ')})`);
            } else if (waveNum === '3') {
                const checks = ['소방', '보건소', '심평원', '요양기관기호', '방사선', '간판'];
                const found = checks.filter(k => content.includes(k));
                console.log(`      핵심 항목 포함: ${found.length}/${checks.length} (${found.join(', ')})`);
            }
        } else {
            console.log(`   ❌ ${waveNum}차 웨이브 문단 없음`);
        }
    }

    // 통증 의료기기 문단 확인
    console.log('\n📊 통증 의료기기 관련 문단:');
    const painDeviceParagraphs = allParagraphs.filter(p =>
        p.keywords.some(k => k.includes('통증 의료기기') || k.includes('C-Arm') || k.includes('초음파'))
    );
    console.log(`   총 ${painDeviceParagraphs.length}개 문단`);
    painDeviceParagraphs.slice(0, 5).forEach(p => {
        console.log(`   - [${p.id}] ${p.title.slice(0, 40)}...`);
    });
}

main().catch(console.error);
