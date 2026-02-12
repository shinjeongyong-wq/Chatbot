/**
 * 파트너사 문서의 metadata.field를 카테고리에 맞게 수정
 * 
 * 사용법: node data_testing/_fix_field.js [fix|restore]
 *   fix     = field를 카테고리명으로 수정
 *   restore = field를 "플래너 AI"로 복원
 */

const fs = require('fs');
const path = require('path');

const mode = process.argv[2] || 'fix';

// 파일명 → field 매핑
const FIELD_MAP = {
    'interior': '인테리어',
    'signage': '간판',
    'emr-crm': 'EMR/CRM',
    'furniture': '가구',
    'marketing': '마케팅',
    'bank': '세무·대출',
    'homepage': '홈페이지',
    'pc-network': 'PC/네트워크'
};

// basename에서 -tier1, -tier2, -tier3 접미사 제거
function getBaseCategory(filename) {
    const base = path.basename(filename, '.json');
    return base.replace(/-tier\d+$/, '');
}

let totalFixed = 0;

function processFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.items || !Array.isArray(data.items)) return 0;

    const baseCategory = getBaseCategory(filePath);
    const newField = FIELD_MAP[baseCategory];

    if (!newField && mode === 'fix') {
        return 0;
    }

    let count = 0;
    for (const item of data.items) {
        if (!item.metadata) continue;

        if (mode === 'fix') {
            if (item.metadata.field !== newField) {
                item.metadata.field = newField;
                count++;
            }
        } else if (mode === 'restore') {
            if (item.metadata.field !== '플래너 AI') {
                item.metadata.field = '플래너 AI';
                count++;
            }
        }
    }

    if (count > 0) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
    return count;
}

function scan(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f);
        if (fs.statSync(p).isDirectory()) {
            scan(p);
        } else if (f.endsWith('.json')) {
            const n = processFile(p);
            if (n > 0) {
                const rel = path.relative(path.resolve(__dirname, '..'), p);
                const icon = mode === 'fix' ? '✅' : '🔄';
                console.log(`  ${icon} ${rel}: ${n}개 수정`);
            }
            totalFixed += n;
        }
    }
}

console.log(`\n🔧 파트너사 field ${mode === 'fix' ? '수정' : '복원'} 중...\n`);

// partners + partners_backup 모두 수정
const partnersDir = path.resolve(__dirname, '../data/notion/partners');
const backupDir = path.resolve(__dirname, '../data/notion/partners_backup');

scan(partnersDir);
scan(backupDir);

console.log(`\n✅ 완료: 총 ${totalFixed}개 문서 ${mode === 'fix' ? '수정' : '복원'}됨`);
