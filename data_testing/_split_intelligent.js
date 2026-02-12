/**
 * _split_intelligent.js
 * 
 * 각 노션 문서를 개별적으로 읽고 내용을 이해한 후
 * 문맥 기반으로 분할하는 스크립트
 * 
 * 모든 분할 지점은 각 파일의 내용을 직접 분석하여 결정됨
 */

const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');
const OUTPUT_DIR = path.join(__dirname, 'notion_rephrased');

// ============================================================
// JSON 제어문자 처리
// ============================================================
function sanitizeJson(raw) {
    const len = raw.length;
    const result = [];
    let inString = false;
    let i = 0;
    let chunkStart = 0;
    while (i < len) {
        const c = raw.charCodeAt(i);
        if (inString) {
            if (c === 92) { i += 2; continue; }
            if (c === 34) { inString = false; i++; continue; }
            if (c === 10) { result.push(raw.substring(chunkStart, i)); result.push('\\n'); chunkStart = i + 1; }
            else if (c === 13) { result.push(raw.substring(chunkStart, i)); result.push('\\r'); chunkStart = i + 1; }
            else if (c === 9) { result.push(raw.substring(chunkStart, i)); result.push('\\t'); chunkStart = i + 1; }
            else if (c < 32) { result.push(raw.substring(chunkStart, i)); result.push(' '); chunkStart = i + 1; }
            i++;
        } else {
            if (c === 34) inString = true;
            i++;
        }
    }
    result.push(raw.substring(chunkStart));
    return result.join('');
}

// ============================================================
// 키워드 추출 (간결하게 - 제목 기반)
// ============================================================
function extractKeywords(title, content) {
    // 제목에서 핵심 키워드 추출
    const titleWords = title
        .replace(/[#✅📌🌊📋🏗️🏠🏥🪧💰💻🔧🪑🧹📊⭐🩺💵📝✨👍🎁⌛🔔🛠️📄💪🚧🖥️💊🗃️🫅🩻🦷💉⚠️🌡️🤝🗓️📑🧭🧱🪑🧑‍💼🥢🔍]/g, '')
        .replace(/[\(\)\[\]\/\-:,·&→>]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .slice(0, 5);

    return titleWords.length > 0 ? titleWords : ['기타'];
}

// ============================================================
// 텍스트를 지정된 헤딩 마커에서 분할
// ============================================================
function splitAtMarkers(text, markers) {
    // text 내에서 각 마커의 위치를 찾고, 마커 사이의 텍스트를 추출
    const lines = text.split('\\n');
    const paragraphs = [];
    let currentTitle = '개요';
    let currentLines = [];

    for (const line of lines) {
        const trimmed = line.trim();

        // 마커와 매칭 체크
        let matched = null;
        for (const m of markers) {
            if (trimmed.startsWith(m.marker)) {
                matched = m;
                break;
            }
        }

        if (matched) {
            // 현재 섹션 저장
            if (currentLines.length > 0) {
                const content = currentLines.join('\\n').trim();
                if (content.length > 0) {
                    paragraphs.push({ title: currentTitle, content });
                }
            }
            currentTitle = matched.title;
            currentLines = [line];
        } else {
            currentLines.push(line);
        }
    }

    // 마지막 섹션
    if (currentLines.length > 0) {
        const content = currentLines.join('\\n').trim();
        if (content.length > 0) {
            paragraphs.push({ title: currentTitle, content });
        }
    }

    return paragraphs;
}

// ============================================================
// 각 파일별 분할 마커 정의
// (각 파일의 내용을 직접 읽고 분석하여 결정한 분할 지점)
// ============================================================

const FILE_SPLIT_MARKERS = {

    // ─────────────────────────────────────────────────
    // ADVANCED: 인테리어 심화편
    // 내용: 업체선정 FAQ → 견적서 → 계약서 → 공간/소재 → 돌발요소 → 우수내시경실 인증 → 전력량
    // ─────────────────────────────────────────────────
    'advanced/interior.json': [
        { marker: '# 원장님들이 자주 여쭤보시는', title: '인테리어 업체 선정 질문' },
        { marker: '## 좋은 인테리어 업체의 기준', title: '좋은 인테리어 업체 기준' },
        { marker: '## 그래서, 원장님에게 맞는', title: '원장님에게 맞는 업체 전달법' },
        { marker: '## 실내건축공사업면허', title: '인테리어 용어 설명 (면허, 평당가)' },
        { marker: '## 견적이 합리적인', title: '견적 합리성 검토' },
        { marker: '## 견적서 구성 내용', title: '견적서 구성 분석' },
        { marker: '## 계약서에 나와있는', title: '계약서 이해하기' },
        { marker: '## 계약서 내용', title: '계약서 주요 조항 해설' },
        { marker: '## 소재 종류가 무척', title: '병원 공간 구성과 소재' },
        { marker: '## 각 공간에 대한 설명', title: '병원 각 공간별 설명' },
        { marker: '## 소재 종류', title: '인테리어 소재 종류 상세' },
        { marker: '## 네, 저도 그랬으면', title: '시공 중 돌발 상황과 대응' },
        { marker: '## 공사 외부 문제 관련', title: '부동산 점검표 활용' },
        { marker: '# 원장님께서 여쭤보신', title: '원장님 추가 질문' },
        { marker: '## 우수내시경실(센터)인증이', title: '우수내시경실 인증 개요' },
        { marker: '## 왜 우수내시경실', title: '우수내시경실 인증 효과' },
        { marker: '## 인증 받기 위해서', title: '우수내시경실 인증 기준' },
        { marker: '## 플래닝할 때 어떤', title: '인증 플래닝 반영 사항' },
        { marker: '## 다른 유사한 것들', title: '유사 인증 제도 비교' },
        { marker: '## 병의원 개원에서 전력량', title: '전력량의 중요성' },
        { marker: '## 병의원 개원 중에 전력량', title: '전력량이 중요해지는 상황' },
        { marker: '## 전력량 검토와 대응', title: '전력량 검토 절차' },
        { marker: '## 운영 및 사후 관리', title: '전력 운영 및 사후 관리' },
        { marker: '## 플래너님이 해주셔야', title: '전력 관련 플래너 역할' },
        { marker: '## 현재 건물에 배정된', title: '전력량 확인 방법' },
        { marker: '## 필요한 전력량을 산출', title: '전력량 산출 방법' },
        { marker: '## 전력량을 늘려야 하는', title: '전력 증설 절차' },
        { marker: '## 증설된 전력에 필요한', title: '전력 인프라 설정 및 설계 반영' },
    ],

    // ─────────────────────────────────────────────────
    // ADVANCED: 의료기기 미용편
    // 내용: 미용클리닉 개괄 → 개원유형 → 기기종류별 상세 → 예산
    // ─────────────────────────────────────────────────
    'advanced/medical-device-beauty.json': [
        { marker: '## 미용 클리닉 개원 유형', title: '미용 클리닉 개원 유형 분류' },
        { marker: '## 개원의 입장에서', title: '개원의 관점에서 중요한 것들' },
        { marker: '## 그래서, 플래닝 시 고려', title: '플래닝 시 고려사항' },
        { marker: '## 시장에 있는 기기 종류', title: '미용 의료기기 종류' },
        { marker: '### 레이저 장비', title: '레이저 장비 상세' },
        { marker: '### 고주파(RF)', title: '고주파(RF) 장비 상세' },
        { marker: '### 초음파 장비', title: '초음파 장비 (HIFU 등)' },
        { marker: '### 쿨링/냉각', title: '쿨링/냉각 장비' },
        { marker: '### 기타 시술 장비', title: '기타 미용 시술 장비' },
        { marker: '## 예산 예시', title: '미용 클리닉 예산 예시' },
        { marker: '## 플래닝 실무', title: '미용 의료기기 플래닝 실무' },
    ],

    // ─────────────────────────────────────────────────
    // ADVANCED: 의료기기 치과편
    // 내용: 통증클리닉 vs 척관병원 구분 → 각 장비별 상세 → 설치/네트워크 → 리스크
    // ─────────────────────────────────────────────────
    'advanced/medical-device-dental.json': [
        { marker: '## 통증 클리닉과 척추', title: '통증 클리닉 vs 척추/관절 병원 구분' },
        { marker: '## 통증 클리닉 의료기기', title: '통증 클리닉 의료기기 구성' },
        { marker: '### C-Arm', title: 'C-Arm 장비 상세' },
        { marker: '### 초음파', title: '초음파 장비 상세' },
        { marker: '### 체외충격파', title: '체외충격파(ESWT) 장비' },
        { marker: '### 도수/물리치료', title: '도수/물리치료 장비' },
        { marker: '## 척추/관절 병원', title: '척추/관절 병원 의료기기' },
        { marker: '### CT', title: 'CT 장비 상세' },
        { marker: '### MRI', title: 'MRI 장비 상세' },
        { marker: '## 예산 예시', title: '치과/통증 의료기기 예산 예시' },
        { marker: '## 플래닝 실무 관점', title: '의료기기 플래닝 실무' },
        { marker: '### 사전 준비', title: '사전 준비 단계' },
        { marker: '### 인테리어 평면도', title: '인테리어 평면도 단계' },
        { marker: '### 시공 단계', title: '시공 단계 체크포인트' },
        { marker: '### 네트워크 설정', title: '네트워크 설정 단계' },
        { marker: '### 개설 신고', title: '개설 신고 및 승인 절차' },
        { marker: '### 시뮬레이션', title: '시뮬레이션 및 직원 교육' },
        { marker: '### 장비 납품', title: '장비 납품 및 설치' },
        { marker: '## 리스크', title: '의료기기 리스크 관리' },
    ],

    // ─────────────────────────────────────────────────
    // ADVANCED: 의료기기 내과편
    // 내용: 검진내과/투석내과/일반내과 구분 → 장비목록 → 플래닝 실무
    // ─────────────────────────────────────────────────
    'advanced/medical-device-internal.json': [
        { marker: '## 검진 내과', title: '검진 내과 의료기기 구성' },
        { marker: '### 국가암검진', title: '국가암검진 필요 장비' },
        { marker: '### 국가건강검진', title: '국가건강검진 필요 장비' },
        { marker: '### 종합검진', title: '종합검진 필요 장비' },
        { marker: '## 투석 내과', title: '투석 내과 의료기기 구성' },
        { marker: '## 일반 내과', title: '일반 내과 의료기기 구성' },
        { marker: '## 방사선 장비', title: '방사선 장비 상세' },
        { marker: '## 내시경 장비', title: '내시경 장비 상세' },
        { marker: '## 초음파', title: '초음파 장비 (내과)' },
        { marker: '## 필수 의료 장비', title: '필수 의료 장비 목록' },
        { marker: '## 예산 예시', title: '내과 의료기기 예산 예시' },
        { marker: '## 플래닝 실무', title: '내과 의료기기 플래닝 실무' },
        { marker: '### 사전 준비', title: '내과 사전 준비 단계' },
        { marker: '### 인테리어 평면도', title: '내과 인테리어 평면도 연계' },
        { marker: '### 시공 단계', title: '내과 시공 단계 체크포인트' },
        { marker: '### 네트워크 설정', title: '내과 네트워크 설정' },
        { marker: '### 장비 납품', title: '내과 장비 납품 및 설치' },
        { marker: '### 개설 신고', title: '내과 개설 신고 및 승인' },
        { marker: '### 시뮬레이션', title: '내과 시뮬레이션 및 교육' },
    ],

    // ─────────────────────────────────────────────────
    // ADVANCED: 의료기기 통증편
    // 내용: 통증클리닉 핵심 → 장비별 상세 → 척관병원 비교 → 지원설비 → 예산
    // ─────────────────────────────────────────────────
    'advanced/medical-device-pain.json': [
        { marker: '## 통증 클리닉 개원 핵심', title: '통증 클리닉 개원 핵심 체크포인트' },
        { marker: '## 의료기기 설계 시 접근법', title: '의료기기 설계 접근법' },
        { marker: '## 통증 클리닉 의료 장비 범주', title: '통증 클리닉 장비 범주' },
        { marker: '### 진단/영상 장비', title: '진단/영상 장비 상세' },
        { marker: '### 치료용 장비', title: '치료용 장비 상세' },
        { marker: '### 물리치료/재활', title: '물리치료/재활 장비' },
        { marker: '### 주사/시술', title: '주사/시술 관련 장비' },
        { marker: '## 척추/관절 병원', title: '척관 병원과의 차이점' },
        { marker: '## 지원 설비', title: '통증 클리닉 지원 설비' },
        { marker: '## 총 예산 예시', title: '통증 클리닉 총 예산 예시' },
        { marker: '## 플래닝 실무', title: '통증 의료기기 플래닝 실무' },
        { marker: '### 사전 준비', title: '통증 사전 준비 단계' },
        { marker: '### 인테리어', title: '통증 인테리어 연계' },
        { marker: '### 시공', title: '통증 시공 단계' },
        { marker: '### 네트워크', title: '통증 네트워크 설정' },
        { marker: '### 장비 납품', title: '통증 장비 납품 및 설치' },
        { marker: '### 개설 신고', title: '통증 개설 신고' },
        { marker: '### 시뮬레이션', title: '통증 시뮬레이션 및 교육' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 가구
    // 내용: 이동식 vs 붙박이 → 공간별 필수가구 → 제작 vs 기성
    // ─────────────────────────────────────────────────
    'hospital-basics/during-construction/furniture.json': [
        { marker: '## 이동식 가구', title: '이동식 가구와 붙박이 가구' },
        { marker: '## 공간별 필수 가구', title: '공간별 필수 가구' },
        { marker: '## 제작 가구', title: '제작 가구 vs 기성 가구' },
        { marker: '## 플래너', title: '가구 관련 플래너 역할' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 인프라 (4개 항목)
    // 각 항목이 독립적인 주제 (소방점검, 방송설비, 인터넷/보안, 내부공사)
    // 큰 항목만 추가 분할
    // ─────────────────────────────────────────────────
    'hospital-basics/during-construction/infrastructure.json': [
        // 아이템별로 분할 (각 아이템이 이미 독립 주제)
        // 큰 아이템(2,3)만 추가 분할 마커
        { marker: '## 핵심', title: '핵심 정리' },
        { marker: '## 플래너', title: '플래너 역할' },
        { marker: '## 주의사항', title: '주의사항' },
        { marker: '## 절차', title: '절차 안내' },
        { marker: '## 왜 중요', title: '중요성' },
        { marker: '## 구성 항목', title: '구성 항목' },
        { marker: '## 업체 선정', title: '업체 선정 기준' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 섬유/유니폼 (3개 항목)
    // ─────────────────────────────────────────────────
    'hospital-basics/during-construction/textiles.json': [
        { marker: '## 유니폼의 중요성', title: '유니폼의 중요성' },
        { marker: '## 유니폼 종류', title: '유니폼 종류' },
        { marker: '## 업체 선정', title: '유니폼 업체 선정' },
        { marker: '## 플래너', title: '유니폼 관련 플래너 역할' },
        { marker: '## 문제점', title: '유니폼 관련 문제점' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 행정업무
    // 내용: 개설신고 → 소방점검 → 보건소 → 요양기관 → 사업용계좌 → 특수장비등록
    // ─────────────────────────────────────────────────
    'hospital-basics/post-opening/admin.json': [
        { marker: '## 의료기관 개설신고', title: '의료기관 개설신고' },
        { marker: '## 소방 점검', title: '소방 점검' },
        { marker: '## 보건소 실사', title: '보건소 실사' },
        { marker: '## 요양기관 신고', title: '요양기관 신고' },
        { marker: '## 사업용 계좌', title: '사업용 계좌 신고' },
        { marker: '## 특수 의료 장비', title: '특수 의료 장비 등록' },
        { marker: '## 플래너', title: '행정 관련 플래너 역할' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: EMR/CRM
    // 내용: EMR 정의/중요성 → CRM 정의/중요성 → 도입절차 → 플래너역할
    // ─────────────────────────────────────────────────
    'hospital-basics/post-opening/emr-crm.json': [
        { marker: '## EMR', title: 'EMR 시스템 개요' },
        { marker: '## CRM', title: 'CRM 시스템 개요' },
        { marker: '## 도입 절차', title: 'EMR/CRM 도입 절차' },
        { marker: '## 플래너', title: 'EMR/CRM 관련 플래너 역할' },
        { marker: '## 문제점', title: 'EMR/CRM 도입 시 문제점' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 관리 (소모품, 유니폼, 정기청소)
    // 내용: 소모품 관리 → 유니폼 관리 → 정기청소
    // ─────────────────────────────────────────────────
    'hospital-basics/post-opening/management.json': [
        { marker: '# 소모품', title: '소모품 관리' },
        { marker: '## 소모품이란', title: '소모품 정의와 중요성' },
        { marker: '## 소모품 관리', title: '소모품 관리 방법' },
        { marker: '## 발주', title: '소모품 발주 절차' },
        { marker: '## 플래너', title: '소모품 관련 플래너 역할' },
        { marker: '# 유니폼', title: '유니폼 관리' },
        { marker: '## 유니폼의 중요성', title: '유니폼의 중요성' },
        { marker: '## 유니폼 종류', title: '유니폼 종류별 설명' },
        { marker: '## 업체 선정', title: '유니폼 업체 선정' },
        { marker: '# 정기 청소', title: '정기 청소 관리' },
        { marker: '## 정기 청소', title: '정기 청소 개요' },
        { marker: '## 청소 업체', title: '청소 업체 선정 기준' },
        { marker: '## 의료폐기물', title: '의료폐기물 처리' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 철거/설비
    // 내용: 철거 → 냉난방 → 공조 → 소방설비
    // ─────────────────────────────────────────────────
    'hospital-basics/pre-construction/demolition.json': [
        { marker: '## 철거', title: '철거 작업' },
        { marker: '## 냉난방', title: '냉난방 설비' },
        { marker: '## 공조', title: '공조 설비' },
        { marker: '## 소방', title: '소방 설비' },
        { marker: '## 플래너', title: '철거/설비 플래너 역할' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 인테리어 기본편
    // 내용: 중요성 → 절차/순서 → 핵심용어 → 각 단계별 상세
    // ─────────────────────────────────────────────────
    'hospital-basics/pre-construction/interior.json': [
        { marker: '## 인테리어의 중요성', title: '인테리어의 중요성' },
        { marker: '## 인테리어 절차', title: '인테리어 절차 및 순서' },
        { marker: '## 핵심 용어', title: '인테리어 핵심 용어' },
        { marker: '## 실측', title: '실측 단계' },
        { marker: '## 미팅', title: '미팅 단계' },
        { marker: '## 계약', title: '계약 단계' },
        { marker: '## 시공', title: '시공 단계' },
        { marker: '## 준공', title: '준공 및 마무리' },
        { marker: '## 플래너', title: '인테리어 플래너 역할' },
        { marker: '## 인테리어에서 발생', title: '인테리어 문제점과 대응' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 의료기기 기본편
    // 내용: 기초지식 → 절차 → 용어 → 구매방식 → 진료과별
    // ─────────────────────────────────────────────────
    'hospital-basics/pre-construction/medical-device.json': [
        { marker: '## 의료기기란', title: '의료기기 기초 지식' },
        { marker: '## 의료기기 도입 절차', title: '의료기기 도입 절차' },
        { marker: '## 핵심 개념', title: '의료기기 핵심 개념 및 용어' },
        { marker: '## 구매 방식', title: '의료기기 구매 및 지불 방식' },
        { marker: '## 진료과별', title: '진료과별 의료기기 구성' },
        { marker: '## 플래너', title: '의료기기 플래너 역할' },
        { marker: '## 의료기기에서 발생', title: '의료기기 문제점과 해결' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 간판 기본편
    // 내용: 외부간판 → 내부간판 → 절차 → 플래너역할
    // ─────────────────────────────────────────────────
    'hospital-basics/pre-construction/signage.json': [
        { marker: '## 외부 간판', title: '외부 간판 종류와 설치' },
        { marker: '## 내부 간판', title: '내부 간판 (사인물)' },
        { marker: '## 간판 설치 절차', title: '간판 설치 절차' },
        { marker: '## 플래너', title: '간판 관련 플래너 역할' },
        { marker: '## 간판에서 발생', title: '간판 관련 문제점' },
    ],

    // ─────────────────────────────────────────────────
    // HOSPITAL-BASICS: 세무
    // 내용: 사업자등록 → 초기비용 → 세금신고 → 플래너역할
    // ─────────────────────────────────────────────────
    'hospital-basics/pre-construction/tax-loan.json': [
        { marker: '## 사업자 등록', title: '사업자 등록' },
        { marker: '## 초기 비용', title: '초기 비용 처리' },
        { marker: '## 세금 신고', title: '세금 신고' },
        { marker: '## 플래너', title: '세무 관련 플래너 역할' },
        { marker: '## 세무에서 발생', title: '세무 관련 문제점' },
    ],

    // ─────────────────────────────────────────────────
    // checklist/general.json - 24개 항목 중 큰 항목만 분할
    // ─────────────────────────────────────────────────
    'checklist/general.json': [
        // 대부분 짧은 항목. 6510자짜리 마지막 항목만 분할 가능
        { marker: '## 1.', title: '1단계 체크' },
        { marker: '## 2.', title: '2단계 체크' },
        { marker: '## 3.', title: '3단계 체크' },
        { marker: '## 4.', title: '4단계 체크' },
        { marker: '## 5.', title: '5단계 체크' },
    ],
};

// ============================================================
// 메타데이터 매핑
// ============================================================
function getFieldAndTopic(relPath) {
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
        'hospital-basics/pre-construction/marketing': { field: '병의원 기본', topic: '마케팅' },
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
    const key = relPath.replace('.json', '');
    return mappings[key] || { field: '기타', topic: '기타' };
}

// ============================================================
// 파일 처리
// ============================================================
function processFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(sanitizeJson(raw));
    if (!data.items || data.items.length === 0) return null;

    const relPath = path.relative(NOTION_DIR, filePath).replace(/\\/g, '/');
    const markers = FILE_SPLIT_MARKERS[relPath];
    const { field, topic } = getFieldAndTopic(relPath);

    const newItems = [];

    for (const item of data.items) {
        const answer = item.answer || '';

        // 마커가 정의되어 있고 내용이 충분히 큰 경우만 분할
        if (markers && answer.length > 1500) {
            const paragraphs = splitAtMarkers(answer, markers);

            // 분할이 실제로 된 경우 (2개 이상)
            if (paragraphs.length > 1) {
                for (let i = 0; i < paragraphs.length; i++) {
                    const para = paragraphs[i];
                    const keywords = extractKeywords(para.title, para.content);

                    newItems.push({
                        id: `${item.id}-p${i + 1}`,
                        source: item.source || 'notion',
                        pageId: item.pageId,
                        question: `${item.question} - ${para.title}`,
                        answer: para.content,
                        metadata: {
                            field,
                            topic,
                            category: item.metadata?.category || '페이지',
                            icon: item.metadata?.icon || '',
                            lastUpdated: item.metadata?.lastUpdated || data.lastUpdated,
                            structuredCategory: data.category,
                            structuredSubCategory: data.subCategory,
                            originalQuestion: item.question,
                            originalId: item.id,
                            paragraphTitle: para.title,
                            keywords
                        }
                    });
                }
            } else {
                // 분할 안 됨 - 원본 유지
                newItems.push(createPassthroughItem(item, data, field, topic));
            }
        } else {
            // 분할 불필요 - 원본 그대로
            newItems.push(createPassthroughItem(item, data, field, topic));
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

function createPassthroughItem(item, data, field, topic) {
    const keywords = extractKeywords(item.question || '', item.answer || '');
    return {
        id: item.id,
        source: item.source || 'notion',
        pageId: item.pageId,
        question: item.question,
        answer: item.answer,
        metadata: {
            field,
            topic,
            category: item.metadata?.category || '페이지',
            icon: item.metadata?.icon || '',
            lastUpdated: item.metadata?.lastUpdated || data.lastUpdated,
            structuredCategory: data.category,
            structuredSubCategory: data.subCategory,
            originalQuestion: item.question,
            originalId: item.id,
            paragraphTitle: item.question,
            keywords
        }
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
        if (entry.isDirectory()) results.push(...findJsonFiles(fullPath));
        else if (entry.name.endsWith('.json') && entry.name !== 'index.json') results.push(fullPath);
    }
    return results;
}

// ============================================================
// 메인 실행
// ============================================================
function main() {
    console.log('📄 내용 기반 개별 분할 시작...\n');

    const files = findJsonFiles(NOTION_DIR);
    console.log(`📁 발견된 JSON 파일: ${files.length}개\n`);

    let totalOriginal = 0;
    let totalSplit = 0;
    const stats = [];

    for (const filePath of files) {
        const relPath = path.relative(NOTION_DIR, filePath).replace(/\\/g, '/');

        // hospital-opening-roadmap.json은 사용자가 이미 수동 편집했으므로 건너뜀
        if (relPath === 'hospital-opening-roadmap.json') {
            console.log(`  ⏭️ ${relPath}: 사용자 수동 편집 유지`);
            continue;
        }

        try {
            const result = processFile(filePath);
            if (!result) {
                console.log(`  ⚠️ ${relPath}: 항목 없음`);
                continue;
            }

            const originalData = JSON.parse(sanitizeJson(fs.readFileSync(filePath, 'utf-8')));
            const origCount = originalData.items?.length || 0;

            // 출력 경로
            const outputPath = path.join(OUTPUT_DIR, relPath.replace(/\//g, path.sep));
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

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
    }

    // 통계
    console.log('\n' + '='.repeat(60));
    console.log('📊 분할 결과 요약');
    console.log('='.repeat(60));
    console.log(`총 처리 파일: ${stats.length}개 (로드맵 제외)`);
    console.log(`원본 항목: ${totalOriginal}개`);
    console.log(`분할 항목: ${totalSplit}개`);
    console.log(`평균 분할 비율: ${(totalSplit / totalOriginal).toFixed(1)}x`);
    console.log('='.repeat(60));

    console.log('\n📋 파일별 상세:');
    console.log('-'.repeat(70));
    for (const s of stats) {
        console.log(`${s.file.padEnd(55)} ${String(s.original).padStart(4)} → ${String(s.split).padStart(4)} (${s.ratio}x)`);
    }
    console.log('-'.repeat(70));
}

main();
