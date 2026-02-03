/**
 * 문서 임베딩 생성 스크립트
 * Gemini Embedding API를 사용하여 모든 문서를 768차원 벡터로 변환
 * 
 * 사용법: node generate-embeddings.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Gemini API 키 (환경변수 또는 직접 입력)
const API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyBBkdLW38OJKXPbnzb1oWzXA1fWip0rb78';
const EMBEDDING_MODEL = 'text-embedding-004';

// 임베딩 API 호출
function getEmbedding(text) {
    return new Promise((resolve, reject) => {
        // 텍스트가 너무 길면 앞부분만 사용 (최대 10000자)
        const truncatedText = text.substring(0, 10000);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${API_KEY}`;

        const requestBody = JSON.stringify({
            model: `models/${EMBEDDING_MODEL}`,
            content: {
                parts: [{ text: truncatedText }]
            }
        });

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(requestBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error(json.error.message));
                    } else if (json.embedding?.values) {
                        resolve(json.embedding.values);
                    } else {
                        reject(new Error('No embedding in response'));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);
        req.write(requestBody);
        req.end();
    });
}

// JSON 파일 재귀 탐색
function findJsonFiles(dirPath, files = []) {
    if (!fs.existsSync(dirPath)) return files;

    const items = fs.readdirSync(dirPath);
    for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            findJsonFiles(fullPath, files);
        } else if (item.endsWith('.json') && item !== 'index.json' && item !== 'topics.json') {
            files.push(fullPath);
        }
    }
    return files;
}

// 딜레이 함수 (Rate Limit 방지)
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 메인 실행
async function main() {
    console.log('🚀 문서 임베딩 생성 시작...\n');

    const dataPath = path.join(process.cwd(), 'data');
    const jsonFiles = findJsonFiles(dataPath);

    console.log(`📁 발견된 JSON 파일: ${jsonFiles.length}개\n`);

    let totalItems = 0;
    let processedItems = 0;
    let skippedItems = 0;

    for (const filePath of jsonFiles) {
        const relativePath = path.relative(dataPath, filePath);
        console.log(`📄 처리 중: ${relativePath}`);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);

            // items 배열이 있는 경우
            if (data.items && Array.isArray(data.items)) {
                let modified = false;

                for (let i = 0; i < data.items.length; i++) {
                    const item = data.items[i];
                    totalItems++;

                    // 이미 임베딩이 있으면 스킵
                    if (item.embedding && item.embedding.length > 0) {
                        skippedItems++;
                        continue;
                    }

                    // 임베딩 생성
                    const textToEmbed = `${item.question || ''} ${item.answer || ''}`;
                    if (!textToEmbed.trim()) {
                        skippedItems++;
                        continue;
                    }

                    try {
                        const embedding = await getEmbedding(textToEmbed);
                        data.items[i].embedding = embedding;
                        processedItems++;
                        modified = true;

                        process.stdout.write(`   ✅ [${i + 1}/${data.items.length}] 임베딩 완료\r`);

                        // Rate Limit 방지 (분당 60회 제한)
                        await delay(1100);
                    } catch (err) {
                        console.error(`\n   ❌ 임베딩 실패: ${err.message}`);
                    }
                }

                if (modified) {
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
                    console.log(`\n   💾 저장 완료`);
                }
            }
        } catch (err) {
            console.error(`   ❌ 파일 처리 실패: ${err.message}`);
        }

        console.log('');
    }

    console.log('\n========================================');
    console.log(`✅ 임베딩 생성 완료!`);
    console.log(`   총 문서: ${totalItems}개`);
    console.log(`   처리됨: ${processedItems}개`);
    console.log(`   스킵됨: ${skippedItems}개`);
    console.log('========================================');
}

main().catch(console.error);
