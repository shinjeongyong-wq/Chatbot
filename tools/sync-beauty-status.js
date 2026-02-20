const fs = require('fs');
const path = require('path');

const MANUAL_SPLITS_PATH = 'data_testing/manual_splits.json';
const targetFile = 'data_testing/notion/advanced/medical-device-beauty.json';

function syncAutoSplitToManual() {
    // 1. 미용 의료기기 파일을 읽어서 제가 아까 나눴던 로직 그대로 "절단 지점" 인덱스를 계산합니다.
    const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    const item = data.items[0];
    const lines = item.answer.split('\n');
    let splits = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        let shouldSplit = false;

        if (trimmed.startsWith('## ') || trimmed.startsWith('### ')) {
            if (i > 3) shouldSplit = true; // 대략적인 로직 재현
        }
        if (trimmed.startsWith('# ') && i > 0) shouldSplit = true;
        if (trimmed.includes('### ') && (trimmed.includes('레이저') || trimmed.includes('써마지') || trimmed.includes('인모드') || trimmed.includes('울쎄라'))) {
            shouldSplit = true;
        }

        if (shouldSplit) {
            // 바로 이전 라인 인덱스가 절단 지점
            splits.push(i - 1);
        }
    }

    // 2. manual_splits.json 업데이트
    let manualSplits = JSON.parse(fs.readFileSync(MANUAL_SPLITS_PATH, 'utf8'));
    manualSplits["advanced/medical-device-beauty.json"] = splits;

    fs.writeFileSync(MANUAL_SPLITS_PATH, JSON.stringify(manualSplits, null, 2));
    console.log('✅ 미용 의료기기 분할 지점을 웹사이트(manual_splits.json)에 동기화했습니다.');
}

syncAutoSplitToManual();
