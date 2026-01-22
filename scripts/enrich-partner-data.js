/**
 * 파트너사 메타데이터 보강 스크립트
 * 
 * 노션에서 각 파트너사의 추가 속성(주요 진료과, 주요 추천 이유, 홈페이지)을 가져와서
 * 로컬 사본 데이터에 추가합니다.
 */

const fs = require('fs');
const path = require('path');

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = '2022-06-28';
const PARTNERS_DIR = path.join(__dirname, '..', 'data', 'notion', 'partners');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getPageProperties(pageId) {
    try {
        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
            headers: {
                'Authorization': `Bearer ${NOTION_API_KEY}`,
                'Notion-Version': NOTION_VERSION
            }
        });

        if (!response.ok) {
            console.log(`   ⚠️ API 오류: ${response.status}`);
            return null;
        }

        const page = await response.json();
        return page.properties;
    } catch (e) {
        console.log(`   ⚠️ 요청 실패: ${e.message}`);
        return null;
    }
}

function extractPropertyValues(properties) {
    const result = {
        specialties: [],  // 주요 진료과
        features: [],     // 주요 추천 이유
        website: null     // 홈페이지
    };

    if (!properties) return result;

    // 주요 진료과 (multi_select)
    const specialtiesKey = Object.keys(properties).find(k =>
        k.includes('진료과') || k.includes('특화') || k.includes('전문')
    );
    if (specialtiesKey && properties[specialtiesKey].multi_select) {
        result.specialties = properties[specialtiesKey].multi_select.map(s => s.name);
    }

    // 주요 추천 이유 (multi_select)
    const featuresKey = Object.keys(properties).find(k =>
        k.includes('추천') || k.includes('특징') || k.includes('장점')
    );
    if (featuresKey && properties[featuresKey].multi_select) {
        result.features = properties[featuresKey].multi_select.map(f => f.name);
    }

    // 홈페이지 (url)
    const websiteKey = Object.keys(properties).find(k =>
        k.includes('홈페이지') || k.includes('웹사이트') || k.includes('URL') || k.includes('링크')
    );
    if (websiteKey && properties[websiteKey].url) {
        result.website = properties[websiteKey].url;
    }

    return result;
}

async function processPartnerFile(filePath) {
    const relativePath = path.relative(PARTNERS_DIR, filePath);
    console.log(`\n📂 처리 중: ${relativePath}`);

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let updatedCount = 0;
    const updatedPartners = [];

    for (const item of data.items) {
        if (!item.pageId) {
            console.log(`   ⏭️ ${item.question}: pageId 없음, 건너뜀`);
            continue;
        }

        console.log(`   📄 ${item.question}...`);

        const properties = await getPageProperties(item.pageId);
        const extracted = extractPropertyValues(properties);

        // 메타데이터 업데이트
        let hasUpdate = false;

        if (extracted.specialties.length > 0) {
            item.metadata.specialties = extracted.specialties;
            hasUpdate = true;
        }

        if (extracted.features.length > 0) {
            item.metadata.features = extracted.features;
            hasUpdate = true;
        }

        if (extracted.website) {
            item.metadata.website = extracted.website;
            hasUpdate = true;
        }

        if (hasUpdate) {
            updatedCount++;
            updatedPartners.push({
                name: item.question,
                specialties: extracted.specialties,
                features: extracted.features,
                website: extracted.website
            });
            console.log(`      ✅ 업데이트됨 | 진료과: ${extracted.specialties.join(', ') || '없음'} | 특징: ${extracted.features.length}개`);
        } else {
            console.log(`      ⚪ 추가 속성 없음`);
        }

        await sleep(350); // Rate limit 방지
    }

    // 파일 저장
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`   💾 저장 완료: ${updatedCount}개 파트너사 업데이트됨`);

    return updatedPartners;
}

async function getAllPartnerFiles() {
    const files = [];

    function scanDir(dir) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                scanDir(fullPath);
            } else if (item.endsWith('.json')) {
                files.push(fullPath);
            }
        }
    }

    scanDir(PARTNERS_DIR);
    return files;
}

async function main() {
    console.log('====================================================');
    console.log('   파트너사 메타데이터 보강 스크립트');
    console.log('====================================================\n');

    const files = await getAllPartnerFiles();
    console.log(`📁 파트너사 파일: ${files.length}개 발견\n`);

    const allUpdatedPartners = [];

    for (const file of files) {
        const updated = await processPartnerFile(file);
        allUpdatedPartners.push(...updated);
    }

    console.log('\n====================================================');
    console.log('   ✅ 작업 완료!');
    console.log('====================================================');
    console.log(`\n📊 총 ${allUpdatedPartners.length}개 파트너사 업데이트됨:\n`);

    for (const p of allUpdatedPartners) {
        const specialtiesStr = p.specialties.length > 0 ? `[${p.specialties.join(', ')}]` : '';
        const featuresStr = p.features.length > 0 ? `특징 ${p.features.length}개` : '';
        console.log(`   • ${p.name} ${specialtiesStr} ${featuresStr}`);
    }

    // 리포트 저장
    fs.writeFileSync(
        path.join(__dirname, 'partner-enrichment-report.json'),
        JSON.stringify({ updatedAt: new Date().toISOString(), partners: allUpdatedPartners }, null, 2),
        'utf-8'
    );
    console.log('\n📋 리포트 저장: scripts/partner-enrichment-report.json');
}

main().catch(console.error);
