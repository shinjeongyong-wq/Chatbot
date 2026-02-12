/**
 * _split_contextual.js
 * 
 * 문맥 기반 문단 분할 스크립트
 * - 마크다운 헤딩(#, ##) 기반으로 주제 경계를 감지
 * - 각 문단이 독립적인 Q&A 단위가 되도록 분할
 * - 원본 메타데이터 보존 + 분할 메타데이터 추가
 * 
 * 사용법: node _split_contextual.js
 */

const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');
const OUTPUT_DIR = path.join(__dirname, 'notion_rephrased');

// ============================================================
// 핵심: 문맥 기반 분할 로직
// ============================================================

/**
 * answer 텍스트를 의미 단위 문단으로 분할
 * 1단계: # (H1) 레벨로 큰 섹션 분리
 * 2단계: 각 섹션 내에서 ## (H2) 레벨로 세부 분리
 * 3단계: 너무 큰 문단(3000자 초과)은 ### (H3) 레벨로 추가 분리
 * 4단계: 너무 작은 문단(200자 이하)은 인접 문단과 병합
 */
function splitByContext(answer, question) {
    if (!answer || answer.trim().length === 0) return [{ title: question, content: answer }];

    // 특수 케이스: 매우 짧은 내용 (1500자 이하)은 분할하지 않음
    if (answer.length <= 1500) {
        return [{ title: question, content: answer }];
    }

    // 줄 단위로 분리
    const lines = answer.split('\n');

    // 1단계: 헤딩 기반 섹션 분리
    const sections = [];
    let currentSection = { title: '', lines: [], level: 0 };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // 헤딩 레벨 감지
        const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);

        if (headingMatch) {
            const level = headingMatch[1].length; // 1, 2, or 3
            const headingTitle = headingMatch[2].trim();

            // # (H1) 또는 ## (H2)에서 새 섹션 시작
            if (level <= 2) {
                // 현재 섹션이 비어있지 않으면 저장
                if (currentSection.lines.length > 0 || currentSection.title) {
                    sections.push({ ...currentSection });
                }
                currentSection = {
                    title: headingTitle,
                    lines: [line],
                    level: level
                };
            } else {
                // ### (H3)는 현재 섹션에 포함
                currentSection.lines.push(line);
            }
        } else {
            currentSection.lines.push(line);
        }
    }

    // 마지막 섹션 추가
    if (currentSection.lines.length > 0 || currentSection.title) {
        sections.push(currentSection);
    }

    // 2단계: 너무 작은 섹션 병합
    const merged = mergeSections(sections);

    // 3단계: 너무 큰 섹션 분할 (### 기준)
    const final = [];
    for (const section of merged) {
        const content = section.lines.join('\n');
        if (content.length > 3500) {
            const subSections = splitLargeSection(section);
            final.push(...subSections);
        } else {
            final.push(section);
        }
    }

    // 4단계: 최종 병합 (여전히 너무 작은 섹션)
    const result = finalMerge(final);

    // 결과 형식화
    return result.map((s, i) => ({
        title: s.title || question,
        content: s.lines.join('\n').trim()
    })).filter(p => p.content.length > 0);
}

/**
 * 작은 섹션들을 인접 섹션과 병합
 * - 200자 이하인 섹션은 다음 섹션과 병합
 * - 첫 번째 섹션이 짧으면 도입부로 간주하고 그대로 유지
 */
function mergeSections(sections) {
    if (sections.length <= 1) return sections;

    const result = [];
    let i = 0;

    while (i < sections.length) {
        const current = sections[i];
        const contentLen = current.lines.join('\n').trim().length;

        // 첫 번째 섹션은 도입부로 유지 (단, 비어있지 않다면)
        if (i === 0 && contentLen > 0) {
            result.push(current);
            i++;
            continue;
        }

        // 너무 짧은 섹션은 다음 섹션과 병합
        if (contentLen < 200 && i + 1 < sections.length) {
            const next = sections[i + 1];
            const merged = {
                title: current.title || next.title,
                lines: [...current.lines, ...next.lines],
                level: Math.min(current.level, next.level)
            };
            result.push(merged);
            i += 2;
        } else {
            result.push(current);
            i++;
        }
    }

    return result;
}

/**
 * 큰 섹션을 ### 기준으로 분할
 */
function splitLargeSection(section) {
    const lines = section.lines;
    const subSections = [];
    let current = { title: section.title, lines: [], level: section.level };

    for (const line of lines) {
        const trimmed = line.trim();
        const h3Match = trimmed.match(/^###\s+(.+)/);

        if (h3Match && current.lines.join('\n').trim().length > 300) {
            subSections.push({ ...current });
            current = {
                title: h3Match[1].trim(),
                lines: [line],
                level: 3
            };
        } else {
            current.lines.push(line);
        }
    }

    if (current.lines.length > 0) {
        subSections.push(current);
    }

    // 분할 결과가 여전히 하나면 원본 반환
    if (subSections.length <= 1) return [section];

    // 작은 서브섹션 병합
    return mergeSections(subSections);
}

/**
 * 최종 병합: 150자 이하 파편 제거
 */
function finalMerge(sections) {
    if (sections.length <= 1) return sections;

    const result = [];

    for (let i = 0; i < sections.length; i++) {
        const current = sections[i];
        const contentLen = current.lines.join('\n').trim().length;

        if (contentLen < 150 && result.length > 0) {
            // 이전 섹션에 병합
            result[result.length - 1].lines.push(...current.lines);
        } else if (contentLen < 150 && i + 1 < sections.length) {
            // 다음 섹션에 병합
            sections[i + 1].lines = [...current.lines, ...sections[i + 1].lines];
            if (!sections[i + 1].title) {
                sections[i + 1].title = current.title;
            }
        } else {
            result.push(current);
        }
    }

    return result;
}

// ============================================================
// 키워드 추출
// ============================================================

function extractKeywords(text, maxKeywords = 15) {
    // 불용어
    const stopWords = new Set([
        '이', '그', '저', '것', '수', '등', '때', '중', '및', '또는', '또한',
        '위한', '대한', '통한', '위해', '대해', '통해', '의해', '에서', '으로',
        '하는', '있는', '되는', '없는', '같은', '이런', '그런', '저런',
        '합니다', '합니다.', '해요', '해요.', '돼요', '돼요.',
        '있습니다', '됩니다', '있어요', '없어요', '필요해요',
        '경우', '부분', '정도', '이상', '이하', '이내', '이후',
        '가능', '필요', '중요', '관련', '확인', '진행', '처리',
        'the', 'is', 'a', 'an', 'and', 'or', 'to', 'in', 'of', 'for',
        '해야', '하면', '되면', '않은', '않는', '에요'
    ]);

    // 의미있는 단어 추출
    const words = text
        .replace(/[#*\-\[\]\(\)>💡⚠️✅📌🌊📋🏗️🏠🏥🪧💰💻🔧🪑🧑‍💼🥢🧹📊📁⭐🩺💵📝✨👍🎁⌛🔔🛠️📄💪🚧🖥️💊🗃️🫅🩻🦷💉]/g, ' ')
        .replace(/\[이미지\]|\[표\]|\[파일\]/g, '')
        .replace(/https?:\/\/[^\s]+/g, '')
        .replace(/[^\w\sㄱ-ㅎ가-힣]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2 && !stopWords.has(w));

    // 빈도수 계산
    const freq = {};
    for (const word of words) {
        freq[word] = (freq[word] || 0) + 1;
    }

    // 상위 키워드 반환
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxKeywords)
        .map(([word]) => word);
}

// ============================================================
// 메타데이터 매핑 (카테고리별 field/topic)
// ============================================================

function getFieldAndTopic(filePath, question) {
    const rel = path.relative(NOTION_DIR, filePath).replace(/\\/g, '/');

    const mappings = {
        'advanced/interior': { field: '플래너 AI', topic: '인테리어 심화편' },
        'advanced/medical-device-beauty': { field: '플래너 AI', topic: '의료기기 미용편' },
        'advanced/medical-device-dental': { field: '플래너 AI', topic: '의료기기 치과편' },
        'advanced/medical-device-internal': { field: '플래너 AI', topic: '의료기기 내과편' },
        'advanced/medical-device-pain': { field: '플래너 AI', topic: '의료기기 통증편' },
        'advanced/signage': { field: '플래너 AI', topic: '간판 심화편' },
        'hospital-basics/pre-construction/interior': { field: '병의원 기본', topic: '인테리어 기본편' },
        'hospital-basics/pre-construction/medical-device': { field: '병의원 기본', topic: '의료기기 기본편' },
        'hospital-basics/pre-construction/signage': { field: '병의원 기본', topic: '간판 기본편' },
        'hospital-basics/pre-construction/tax-loan': { field: '병의원 기본', topic: '세무' },
        'hospital-basics/pre-construction/demolition': { field: '병의원 기본', topic: '철거/설비' },
        'hospital-basics/during-construction/furniture': { field: '병의원 기본', topic: '가구' },
        'hospital-basics/during-construction/infrastructure': { field: '병의원 기본', topic: '인프라' },
        'hospital-basics/during-construction/textiles': { field: '병의원 기본', topic: '섬유/유니폼' },
        'hospital-basics/during-construction/waste': { field: '병의원 기본', topic: '폐기물' },
        'hospital-basics/post-opening/admin': { field: '병의원 기본', topic: '행정업무' },
        'hospital-basics/post-opening/emr-crm': { field: '병의원 기본', topic: 'EMR/CRM' },
        'hospital-basics/post-opening/management': { field: '병의원 기본', topic: '관리' },
        'hospital-basics/post-opening/pharmacy': { field: '병의원 기본', topic: '약국' },
        'hospital-opening-roadmap': { field: '개업 로드맵', topic: '전체 로드맵' },
        'checklist/general': { field: '체크리스트', topic: '일반' },
        'checklist/facilities': { field: '체크리스트', topic: '시설' },
        'checklist/regulations': { field: '체크리스트', topic: '규정' },
        'partners/pre-construction/interior': { field: '파트너사', topic: '인테리어' },
        'partners/pre-construction/homepage': { field: '파트너사', topic: '홈페이지' },
        'partners/pre-construction/pc-network': { field: '파트너사', topic: 'PC/네트워크' },
        'partners/pre-construction/signage': { field: '파트너사', topic: '간판' },
        'partners/pre-construction/bank': { field: '파트너사', topic: '은행' },
        'partners/post-construction/emr-crm': { field: '파트너사', topic: 'EMR/CRM' },
        'partners/post-construction/furniture': { field: '파트너사', topic: '가구' },
        'partners/post-construction/marketing': { field: '파트너사', topic: '마케팅' },
        'portfolio/customers': { field: '포트폴리오', topic: '고객사례' },
    };

    const key = rel.replace('.json', '');
    return mappings[key] || { field: '기타', topic: question };
}

// ============================================================
// 파일 처리
// ============================================================

function sanitizeJson(raw) {
    // 빠른 방법: 문자열 내부의 실제 줄바꿈만 처리
    // JSON에서 줄바꿈은 키/값 구조 바깥에서만 합법적
    // Buffer char-by-char (빠른 인덱스 기반)
    const len = raw.length;
    const result = [];
    let inString = false;
    let i = 0;
    let chunkStart = 0;

    while (i < len) {
        const c = raw.charCodeAt(i);

        if (inString) {
            if (c === 92) { // backslash
                i += 2; // skip escaped char
                continue;
            }
            if (c === 34) { // closing quote
                inString = false;
                i++;
                continue;
            }
            if (c === 10) { // \n inside string
                result.push(raw.substring(chunkStart, i));
                result.push('\\n');
                chunkStart = i + 1;
            } else if (c === 13) { // \r inside string
                result.push(raw.substring(chunkStart, i));
                result.push('\\r');
                chunkStart = i + 1;
            } else if (c === 9) { // \t inside string
                result.push(raw.substring(chunkStart, i));
                result.push('\\t');
                chunkStart = i + 1;
            } else if (c < 32) { // other control chars
                result.push(raw.substring(chunkStart, i));
                result.push(' ');
                chunkStart = i + 1;
            }
            i++;
        } else {
            if (c === 34) { // opening quote
                inString = true;
            }
            i++;
        }
    }

    result.push(raw.substring(chunkStart));
    return result.join('');
}

function processFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const sanitized = sanitizeJson(raw);
    const data = JSON.parse(sanitized);

    if (!data.items || data.items.length === 0) return null;

    const newItems = [];
    const { field, topic } = getFieldAndTopic(filePath, data.items[0]?.question || '');

    for (const item of data.items) {
        const paragraphs = splitByContext(item.answer, item.question);

        for (let i = 0; i < paragraphs.length; i++) {
            const para = paragraphs[i];
            const keywords = extractKeywords(para.content);

            const newItem = {
                id: `${item.id}-p${i + 1}`,
                source: item.source || 'notion',
                pageId: item.pageId,
                question: paragraphs.length > 1
                    ? `${item.question} - ${para.title}`
                    : item.question,
                answer: para.content,
                metadata: {
                    field: field,
                    topic: topic,
                    category: item.metadata?.category || '페이지',
                    icon: item.metadata?.icon || '',
                    lastUpdated: item.metadata?.lastUpdated || data.lastUpdated,
                    structuredCategory: data.category,
                    structuredSubCategory: data.subCategory,
                    originalQuestion: item.question,
                    originalId: item.id,
                    paragraphTitle: para.title,
                    paragraphIndex: i + 1,
                    totalParagraphs: paragraphs.length,
                    keywords: keywords
                }
            };

            newItems.push(newItem);
        }
    }

    return {
        category: data.category,
        subCategory: data.subCategory,
        itemCount: newItems.length,
        lastUpdated: new Date().toISOString(),
        items: newItems
    };
}

// ============================================================
// 재귀 파일 탐색
// ============================================================

function findJsonFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findJsonFiles(fullPath));
        } else if (entry.name.endsWith('.json') && entry.name !== 'index.json') {
            results.push(fullPath);
        }
    }

    return results;
}

// ============================================================
// 메인 실행
// ============================================================

function main() {
    console.log('📄 문맥 기반 문단 분할 시작...\n');

    const files = findJsonFiles(NOTION_DIR);
    console.log(`📁 발견된 JSON 파일: ${files.length}개\n`);

    let totalOriginal = 0;
    let totalSplit = 0;
    const stats = [];

    for (const filePath of files) {
        const relPath = path.relative(NOTION_DIR, filePath);

        try {
            const result = processFile(filePath);

            if (!result) {
                console.log(`  ⚠️ ${relPath}: 항목 없음, 건너뜀`);
                continue;
            }

            // 원본 항목 수 계산
            const originalData = JSON.parse(sanitizeJson(fs.readFileSync(filePath, 'utf-8')));
            const origCount = originalData.items?.length || 0;

            // 출력 경로 생성
            const outputPath = path.join(OUTPUT_DIR, relPath);
            const outputDir = path.dirname(outputPath);

            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // 파일 저장
            fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

            totalOriginal += origCount;
            totalSplit += result.itemCount;

            stats.push({
                file: relPath,
                original: origCount,
                split: result.itemCount,
                ratio: (result.itemCount / origCount).toFixed(1)
            });

            console.log(`  ✅ ${relPath}: ${origCount}개 → ${result.itemCount}개 (${(result.itemCount / origCount).toFixed(1)}x)`);
        } catch (err) {
            console.error(`  ❌ ${relPath}: ${err.message}`);
        }
    }

    // index.json 복사
    const indexSrc = path.join(NOTION_DIR, 'index.json');
    const indexDst = path.join(OUTPUT_DIR, 'index.json');
    if (fs.existsSync(indexSrc)) {
        fs.copyFileSync(indexSrc, indexDst);
        console.log(`\n  📋 index.json 복사 완료`);
    }

    // 통계 출력
    console.log('\n' + '='.repeat(60));
    console.log('📊 분할 결과 요약');
    console.log('='.repeat(60));
    console.log(`총 파일: ${files.length}개`);
    console.log(`원본 항목: ${totalOriginal}개`);
    console.log(`분할 항목: ${totalSplit}개`);
    console.log(`평균 분할 비율: ${(totalSplit / totalOriginal).toFixed(1)}x`);
    console.log('='.repeat(60));

    // 상세 통계 테이블
    console.log('\n📋 파일별 상세 통계:');
    console.log('-'.repeat(70));
    console.log(`${'파일'.padEnd(50)} ${'원본'.padStart(5)} ${'분할'.padStart(5)} ${'비율'.padStart(6)}`);
    console.log('-'.repeat(70));
    for (const s of stats) {
        console.log(`${s.file.padEnd(50)} ${String(s.original).padStart(5)} ${String(s.split).padStart(5)} ${(s.ratio + 'x').padStart(6)}`);
    }
    console.log('-'.repeat(70));
}

main();
