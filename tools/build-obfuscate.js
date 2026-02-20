/**
 * JavaScript 난독화 빌드 스크립트
 * 대상 파일: script.js, chat-history.js, sheets-loader.js
 * 결과물: dist/ 폴더에 난독화된 파일 생성
 */

const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// 난독화 대상 파일들
const targetFiles = [
    'script.js',
    'chat-history.js',
    'sheets-loader.js'
];

// dist 폴더 생성
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log('✅ dist/ 폴더 생성됨');
}

// 난독화 옵션 (보안 수준: 높음)
const obfuscatorOptions = {
    compact: true,                              // 압축
    controlFlowFlattening: true,                // 제어 흐름 평탄화
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,                    // 데드 코드 주입
    deadCodeInjectionThreshold: 0.4,
    debugProtection: false,                     // 디버그 보호 (로컬 테스트용으로 비활성화)
    disableConsoleOutput: false,                // 콘솔 출력 유지 (디버깅용)
    identifierNamesGenerator: 'hexadecimal',    // 변수명 16진수화
    log: false,
    numbersToExpressions: true,                 // 숫자를 표현식으로 변환
    renameGlobals: false,                       // 전역 변수명 유지 (다른 스크립트와 호환성)
    selfDefending: false,                       // 자체 방어 비활성화 (로컬 테스트용)
    simplify: true,
    splitStrings: true,                         // 문자열 분할
    splitStringsChunkLength: 10,
    stringArray: true,                          // 문자열 배열화
    stringArrayCallsTransform: true,
    stringArrayEncoding: ['base64'],            // 문자열 인코딩
    stringArrayIndexShift: true,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    stringArrayWrappersCount: 2,
    stringArrayWrappersChainedCalls: true,
    stringArrayWrappersParametersMaxCount: 4,
    stringArrayWrappersType: 'function',
    stringArrayThreshold: 0.75,
    unicodeEscapeSequence: false
};

console.log('🔐 JavaScript 난독화 시작...\n');

// 각 파일 난독화
targetFiles.forEach(filename => {
    const inputPath = path.join(__dirname, filename);
    const outputPath = path.join(distDir, filename);

    try {
        // 파일 읽기
        const code = fs.readFileSync(inputPath, 'utf8');
        console.log(`📄 ${filename} 읽기 완료 (${(code.length / 1024).toFixed(1)}KB)`);

        // 난독화 실행
        const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);

        // 결과 저장
        fs.writeFileSync(outputPath, obfuscatedCode.getObfuscatedCode(), 'utf8');

        const outputSize = fs.statSync(outputPath).size;
        console.log(`✅ ${filename} 난독화 완료 → dist/${filename} (${(outputSize / 1024).toFixed(1)}KB)\n`);

    } catch (error) {
        console.error(`❌ ${filename} 난독화 실패:`, error.message);
    }
});

console.log('🎉 모든 파일 난독화 완료!');
console.log('📁 결과물 위치: dist/ 폴더');
console.log('\n테스트하려면 index-obfuscated.html을 브라우저에서 열어주세요.');
