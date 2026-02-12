/**
 * _split_intelligent.js
 * 
 * 각 노션 문서를 개별적으로 읽고 내용 파악 후
 * 문맥 기반으로 분할하는 스크립트
 * 
 * 원본 data/notion 파일 사용 (정상 JSON 포맷)
 */

const fs = require('fs');
const path = require('path');

const NOTION_DIR = path.join(__dirname, 'notion');
const OUTPUT_DIR = path.join(__dirname, 'notion_rephrased');

// ============================================================
// 키워드 추출 (제목 기반, 간결하게)
// ============================================================
function extractKeywords(title) {
    return title
        .replace(/[#✅📌🌊📋🏗️🏠🏥🪧💰💻🔧🪑🧹📊⭐🩺💵📝✨👍🎁⌛🔔🛠️📄💪🚧🖥️💊🗃️🫅🩻🦷💉⚠️🌡️🤝🗓️📑🧭🧱🪑🧑‍💼🥢🔍🎯🏦🛎️😀]/gu, '')
        .replace(/[\(\)\[\]\/\-:,·&→>]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 2)
        .slice(0, 5);
}

// ============================================================
// 헤딩 마커에서 분할
// ============================================================
function splitAtMarkers(text, markers) {
    const lines = text.split('\n');
    const paragraphs = [];
    let currentTitle = '개요';
    let currentLines = [];

    for (const line of lines) {
        const trimmed = line.trim();
        let matched = null;
        for (const m of markers) {
            if (trimmed.startsWith(m.marker)) {
                matched = m;
                break;
            }
        }

        if (matched) {
            if (currentLines.length > 0) {
                const content = currentLines.join('\n').trim();
                if (content.length > 10) {
                    paragraphs.push({ title: currentTitle, content });
                }
            }
            currentTitle = matched.title;
            currentLines = [line];
        } else {
            currentLines.push(line);
        }
    }

    if (currentLines.length > 0) {
        const content = currentLines.join('\n').trim();
        if (content.length > 10) {
            paragraphs.push({ title: currentTitle, content });
        }
    }

    return paragraphs;
}

// ============================================================
// 각 파일별 분할 마커 (내용을 직접 읽고 결정)
// ============================================================
const FILE_SPLIT_MARKERS = {

    // ── 인테리어 심화편 ──
    // 업체선정 FAQ → 견적서 → 계약서 → 공간/소재 → 돌발요소 → 우수내시경실 → 전력량
    'advanced/interior.json': [
        { marker: '# 원장님들이 자주 여쭤보시는', title: '인테리어 FAQ 소개' },
        { marker: '## 인테리어 업체는 어떤', title: '인테리어 업체 선택 기준' },
        { marker: '## 좋은 인테리어 업체의 기준', title: '좋은 인테리어 업체 확인법' },
        { marker: '## 그래서, 원장님에게 맞는', title: '원장님 맞춤 업체 전달법' },
        { marker: '## 실내건축공사업면허', title: '인테리어 용어 (면허, 평당가)' },
        { marker: '## 견적이 합리적인', title: '견적 합리성 판단' },
        { marker: '## 일단, 견적서를 봅시다', title: '견적서 보는 법' },
        { marker: '## 견적서 구성 내용', title: '견적서 구성 분석 (직접/간접 공사비)' },
        { marker: '## 계약서에 나와있는', title: '계약서 용어 이해' },
        { marker: '## 계약서는 보통 어떻게', title: '계약서 구성 방식' },
        { marker: '## 계약서 내용 심구', title: '계약서 핵심 조항 (현장대리인, 보증, 지체상금)' },
        { marker: '## 소재 종류가 무척', title: '인테리어 소재 선택 가이드' },
        { marker: '## 병원 인테리어 공간 구성', title: '병원 공간 구성 개요' },
        { marker: '## 각 공간에 대한 설명', title: '병원 각 공간별 상세 설명' },
        { marker: '## 소재 종류', title: '인테리어 소재 종류 상세' },
        { marker: '## 플래너님, 잘 진행되고', title: '시공 진행 상황 체크' },
        { marker: '## 네, 저도 그랬으면', title: '시공 중 돌발 상황 안내' },
        { marker: '## 원장님들이 걱정하실만한', title: '돌발 요소 정리 (내/외부)' },
        { marker: '## 공사 외부 문제 관련', title: '부동산 점검표 활용법' },
        { marker: '# 원장님께서 여쭤보신', title: '원장님 추가 질문 목록' },
        { marker: '## 저 우수내시경실', title: '우수내시경실 인증 가능 여부' },
        { marker: '## 우수내시경실(센터)인증이', title: '우수내시경실 인증 개요' },
        { marker: '## 왜 우수내시경실', title: '우수내시경실 인증 효과' },
        { marker: '## 인증 받기 위해서', title: '인증 기준 및 자가평가' },
        { marker: '## 플래닝할 때 어떤', title: '인증 반영 사항 (인테리어 등)' },
        { marker: '## 다른 유사한 것들', title: '유사 인증 제도 비교' },
        { marker: '## 전력량이 문제가', title: '전력량 문제 소개' },
        { marker: '## 병의원 개원에서 전력량의', title: '전력량의 중요성' },
        { marker: '## 병의원 개원 중에 전력량이', title: '전력량이 중요해지는 구체 상황' },
        { marker: '## 전력량 검토와 대응', title: '전력량 검토 절차' },
        { marker: '## 운영 및 사후 관리', title: '전력 운영 및 사후 관리' },
        { marker: '## 플래너님이 해주셔야', title: '전력 관련 플래너 역할' },
        { marker: '## 현재 건물에 배정된', title: '현재 전력량 확인 방법' },
        { marker: '## 필요한 전력량을 산출', title: '필요 전력량 산출법' },
        { marker: '## 전력량을 늘려야', title: '전력 증설 절차' },
        { marker: '## 증설된 전력에 필요한', title: '전력 인프라 설정 및 설계 반영' },
        { marker: '# 원장님들이 여쭤보실 수도', title: '추가 참고 사항' },
    ],

    // ── 의료기기 미용편 ──
    // 개괄 → 클리닉유형 → 기기별 상세 → 예산 → 플래닝
    'advanced/medical-device-beauty.json': [
        { marker: '## 미용 클리닉 개원 유형', title: '미용 클리닉 개원 유형 분류' },
        { marker: '## 개원의 입장에서', title: '개원의 관점 주요 고려사항' },
        { marker: '## 그래서, 플래닝 시', title: '플래닝 시 고려사항' },
        { marker: '## 시장에 있는 기기 종류', title: '미용 의료기기 종류 개요' },
        { marker: '### 레이저 장비', title: '레이저 장비 상세' },
        { marker: '### 고주파(RF)', title: '고주파(RF) 장비 상세' },
        { marker: '### 초음파 장비', title: '초음파 장비 (HIFU 등)' },
        { marker: '### 쿨링', title: '쿨링/냉각 장비' },
        { marker: '### 기타 시술', title: '기타 미용 시술 장비' },
        { marker: '## 예산 예시', title: '미용 클리닉 예산 예시' },
        { marker: '## 플래닝 실무', title: '미용 의료기기 플래닝 실무' },
    ],

    // ── 의료기기 치과편 ──
    // 통증 vs 척관 → 장비별 상세 → 예산 → 플래닝
    'advanced/medical-device-dental.json': [
        { marker: '## 통증 클리닉과 척추', title: '통증 클리닉 vs 척관 병원 구분' },
        { marker: '## 통증 클리닉 의료기기', title: '통증 클리닉 의료기기 구성' },
        { marker: '### C-Arm', title: 'C-Arm 장비 상세' },
        { marker: '### 초음파', title: '초음파 장비 상세' },
        { marker: '### 체외충격파', title: '체외충격파(ESWT) 장비' },
        { marker: '### 도수', title: '도수/물리치료 장비' },
        { marker: '## 척추/관절 병원', title: '척관 병원 의료기기' },
        { marker: '### CT', title: 'CT 장비 상세' },
        { marker: '### MRI', title: 'MRI 장비 상세' },
        { marker: '## 예산 예시', title: '예산 예시' },
        { marker: '## 플래닝 실무', title: '플래닝 실무 관점' },
        { marker: '### 사전 준비', title: '사전 준비 단계' },
        { marker: '### 인테리어 평면도', title: '인테리어 평면도 연계' },
        { marker: '### 시공 단계', title: '시공 단계 체크포인트' },
        { marker: '### 네트워크 설정', title: '네트워크 설정' },
        { marker: '### 개설 신고', title: '개설 신고 및 승인' },
        { marker: '### 시뮬레이션', title: '시뮬레이션 및 교육' },
        { marker: '### 장비 납품', title: '장비 납품 및 설치' },
        { marker: '## 리스크', title: '리스크 관리' },
    ],

    // ── 의료기기 내과편 ──
    // 검진/투석/일반 → 장비별 → 예산 → 플래닝
    'advanced/medical-device-internal.json': [
        { marker: '## 검진 내과', title: '검진 내과 의료기기' },
        { marker: '### 국가암검진', title: '국가암검진 장비' },
        { marker: '### 국가건강검진', title: '국가건강검진 장비' },
        { marker: '### 종합검진', title: '종합검진 장비' },
        { marker: '## 투석 내과', title: '투석 내과 의료기기' },
        { marker: '## 일반 내과', title: '일반 내과 의료기기' },
        { marker: '## 방사선 장비', title: '방사선 장비 상세' },
        { marker: '## 내시경 장비', title: '내시경 장비 상세' },
        { marker: '## 초음파', title: '초음파 장비 (내과)' },
        { marker: '## 필수 의료 장비', title: '필수 의료 장비 목록' },
        { marker: '## 예산 예시', title: '내과 예산 예시' },
        { marker: '## 플래닝 실무', title: '내과 플래닝 실무' },
        { marker: '### 사전 준비', title: '내과 사전 준비' },
        { marker: '### 인테리어', title: '내과 인테리어 연계' },
        { marker: '### 시공', title: '내과 시공 단계' },
        { marker: '### 네트워크', title: '내과 네트워크 설정' },
        { marker: '### 장비 납품', title: '내과 장비 납품' },
        { marker: '### 개설 신고', title: '내과 개설 신고' },
        { marker: '### 시뮬레이션', title: '내과 시뮬레이션' },
    ],

    // ── 의료기기 통증편 ──
    // 핵심 → 장비범주별 → 척관비교 → 지원설비 → 예산 → 플래닝
    'advanced/medical-device-pain.json': [
        { marker: '## 통증 클리닉 개원 핵심', title: '통증 클리닉 개원 핵심' },
        { marker: '## 의료기기 설계 시', title: '의료기기 설계 접근법' },
        { marker: '## 통증 클리닉 의료 장비 범주', title: '통증 장비 범주 개요' },
        { marker: '### 진단', title: '진단/영상 장비' },
        { marker: '### 치료용', title: '치료용 장비' },
        { marker: '### 물리치료', title: '물리치료/재활 장비' },
        { marker: '### 주사', title: '주사/시술 관련 장비' },
        { marker: '## 척추/관절 병원', title: '척관 병원 비교' },
        { marker: '### 필수 장비', title: '척관 필수 장비' },
        { marker: '### 선택적 확장', title: '선택적 확장 장비' },
        { marker: '## 지원 설비', title: '지원 설비' },
        { marker: '## 총 예산', title: '총 예산 예시' },
        { marker: '## 플래닝 실무', title: '통증 플래닝 실무' },
        { marker: '### 사전 준비', title: '통증 사전 준비' },
        { marker: '### 인테리어', title: '통증 인테리어 연계' },
        { marker: '### 시공', title: '통증 시공 단계' },
        { marker: '### 네트워크', title: '통증 네트워크 설정' },
        { marker: '### 장비 납품', title: '통증 장비 납품' },
        { marker: '### 개설 신고', title: '통증 개설 신고' },
        { marker: '### 시뮬레이션', title: '통증 시뮬레이션' },
    ],

    // ── 가구 ──
    'hospital-basics/during-construction/furniture.json': [
        { marker: '## 가구는 어떤게', title: '가구의 중요성' },
        { marker: '## 이동식 가구', title: '이동식 가구 vs 고정 가구' },
        { marker: '## 공간별로 꼭 필요한', title: '공간별 필수 가구' },
        { marker: '## 기성가구 vs 제작가구', title: '기성 가구 vs 제작 가구' },
        { marker: '# 플래너', title: '가구 관련 플래너 역할' },
        { marker: '## 가구에서 발생', title: '가구 관련 문제점' },
        { marker: '## 플래너님이 해주셔야', title: '가구 관련 플래너 업무' },
    ],

    // ── 인프라 (PC/네트워크/보안 등 4개 아이템) ──
    'hospital-basics/during-construction/infrastructure.json': [
        { marker: '## 왜 중요', title: '왜 중요한가' },
        { marker: '## 구성 항목', title: '구성 항목' },
        { marker: '## 업체 선정', title: '업체 선정' },
        { marker: '## 플래너', title: '플래너 역할' },
        { marker: '## 핵심', title: '핵심 정리' },
        { marker: '## 주의사항', title: '주의사항' },
        { marker: '## 절차', title: '절차' },
        { marker: '# 플래너', title: '플래너의 역할' },
    ],

    // ── 섬유/유니폼 (3개 아이템) ──
    'hospital-basics/during-construction/textiles.json': [
        { marker: '## 유니폼의 중요성', title: '유니폼의 중요성' },
        { marker: '## 유니폼 종류', title: '유니폼 종류' },
        { marker: '## 업체 선정', title: '업체 선정' },
        { marker: '# 플래너', title: '플래너 역할' },
        { marker: '## 문제', title: '문제점' },
        { marker: '## 플래너님이 해주셔야', title: '플래너 업무' },
    ],

    // ── 행정업무 ──
    'hospital-basics/post-opening/admin.json': [
        { marker: '## 의료기관 개설신고', title: '의료기관 개설신고' },
        { marker: '## 소방', title: '소방 점검' },
        { marker: '## 보건소', title: '보건소 실사' },
        { marker: '## 요양기관', title: '요양기관 신고' },
        { marker: '## 사업용', title: '사업용 계좌 신고' },
        { marker: '## 특수', title: '특수 의료 장비 등록' },
        { marker: '# 플래너', title: '행정 관련 플래너 역할' },
        { marker: '## 행정 절차에서 발생', title: '행정 절차 문제점' },
        { marker: '## 플래너님이 해주셔야', title: '플래너 업무' },
    ],

    // ── EMR/CRM ──
    'hospital-basics/post-opening/emr-crm.json': [
        { marker: '## EMR', title: 'EMR 시스템' },
        { marker: '## CRM', title: 'CRM 시스템' },
        { marker: '## 절차 및 순서', title: 'EMR/CRM 도입 절차' },
        { marker: '## 핵심 개념', title: '핵심 개념' },
        { marker: '## 절차별 세부', title: '절차별 상세 설명' },
        { marker: '# 플래너', title: '플래너 역할' },
        { marker: '## EMR/CRM에서 발생', title: 'EMR/CRM 문제점' },
        { marker: '## 플래너님이 해주셔야', title: '플래너 업무' },
    ],

    // ── 관리 (소모품, 유니폼, 정기청소) ──
    'hospital-basics/post-opening/management.json': [
        { marker: '# 소모품', title: '소모품 관리' },
        { marker: '## 소모품이란', title: '소모품 정의' },
        { marker: '## 소모품 관리', title: '소모품 관리 방법' },
        { marker: '## 발주', title: '소모품 발주' },
        { marker: '## 플래너', title: '소모품 플래너 역할' },
        { marker: '# 유니폼', title: '유니폼 관리' },
        { marker: '## 유니폼의 중요성', title: '유니폼의 중요성' },
        { marker: '## 유니폼 종류', title: '유니폼 종류' },
        { marker: '## 업체 선정', title: '유니폼 업체 선정' },
        { marker: '# 정기 청소', title: '정기 청소' },
        { marker: '## 정기 청소', title: '정기 청소 이해' },
        { marker: '## 청소 업체', title: '청소 업체 선정' },
        { marker: '## 의료폐기물', title: '의료폐기물 처리' },
        { marker: '# 플래너의 역할', title: '관리 플래너 역할' },
        { marker: '## 관리에서 발생', title: '관리 문제점' },
        { marker: '## 플래너님이 해주셔야', title: '플래너 업무' },
    ],

    // ── 철거/설비 ──
    'hospital-basics/pre-construction/demolition.json': [
        { marker: '## 철거', title: '철거 작업 이해' },
        { marker: '## 냉난방', title: '냉난방 설비' },
        { marker: '## 공조', title: '공조 설비' },
        { marker: '## 소방', title: '소방 설비' },
        { marker: '# 플래너', title: '철거/설비 플래너 역할' },
        { marker: '## 철거 및 설비에서 발생', title: '문제점' },
        { marker: '## 플래너님이 해주셔야', title: '플래너 업무' },
    ],

    // ── 인테리어 기본편 ──
    'hospital-basics/pre-construction/interior.json': [
        { marker: '## 병의원 개원에서 인테리어', title: '인테리어의 중요성' },
        { marker: '# 병의원 인테리어 기초', title: '인테리어 기초 지식' },
        { marker: '## 절차 및 순서', title: '인테리어 절차 및 순서' },
        { marker: '## 플래너님이 꼭 아셔야 할 핵심', title: '인테리어 핵심 개념' },
        { marker: '## 절차별 세부', title: '절차별 상세 설명' },
        { marker: '### 1. 실측', title: '1. 실측 단계' },
        { marker: '### 2. 1차', title: '2. 1차 미팅' },
        { marker: '### 3. 비교', title: '3. 비교 및 업체 선정' },
        { marker: '### 4. 2차', title: '4. 2차 미팅' },
        { marker: '### 5. 3차', title: '5. 3차 계약 미팅' },
        { marker: '### 6. 착공', title: '6. 착공 단계' },
        { marker: '### 7. 중간', title: '7. 중간 점검' },
        { marker: '### 8. 준공', title: '8. 준공 및 마무리' },
        { marker: '# 플래너의 역할', title: '인테리어 플래너 역할' },
        { marker: '## 인테리어에서 발생', title: '인테리어 문제점' },
        { marker: '## 플래너님께서 해주셔야', title: '플래너 업무 정리' },
    ],

    // ── 의료기기 기본편 ──
    'hospital-basics/pre-construction/medical-device.json': [
        { marker: '## 병의원 개원에서 의료기기', title: '의료기기의 중요성' },
        { marker: '# 병의원 의료기기 기초', title: '의료기기 기초 지식' },
        { marker: '## 절차 및 순서', title: '의료기기 절차 및 순서' },
        { marker: '## 플래너님이 꼭 아셔야 할 핵심', title: '의료기기 핵심 개념' },
        { marker: '### 유통', title: '유통/판매 구조' },
        { marker: '### 계약', title: '계약/서비스 구조' },
        { marker: '### 구매', title: '구매/지불 방식' },
        { marker: '### 운영', title: '운영/재무 전략' },
        { marker: '## 절차별 세부', title: '절차별 상세 설명' },
        { marker: '### 1. 미팅 전', title: '1. 미팅 전 준비' },
        { marker: '### 2. 1차', title: '2. 1차 미팅' },
        { marker: '### 3. 비교', title: '3. 비교 및 체험' },
        { marker: '### 4. 2차', title: '4. 2차 미팅' },
        { marker: '### 5. 3차', title: '5. 3차 계약 미팅' },
        { marker: '### 6. 설치', title: '6. 설치 및 점검' },
        { marker: '### 7. 사후', title: '7. 사후 관리' },
        { marker: '# 플래너의 역할', title: '의료기기 플래너 역할' },
        { marker: '## 의료기기에서 발생', title: '의료기기 문제점' },
        { marker: '## 플래너님께서 해주셔야', title: '플래너 업무 정리' },
        { marker: '# 각 진료과별', title: '진료과별 각론' },
        { marker: '## 사전 준비', title: '사전 준비 단계' },
    ],

    // ── 간판 기본편 ──
    'hospital-basics/pre-construction/signage.json': [
        { marker: '## 병의원 개원 과정에서', title: '간판의 의미' },
        { marker: '### 외부 간판', title: '외부 간판 종류' },
        { marker: '### 내부 간판', title: '내부 간판 (사인물)' },
        { marker: '## 병의원 개원에서 간판이', title: '간판의 중요성' },
        { marker: '### 마케팅', title: '마케팅 효과' },
        { marker: '### 브랜딩', title: '브랜딩과 신뢰' },
        { marker: '### 환자 접근성', title: '환자 접근성' },
        { marker: '# 병의원 간판 기초 지식', title: '간판 기초 지식' },
        { marker: '## 절차 및 순서', title: '간판 절차 및 순서' },
        { marker: '## 플래너가 꼭 알아야', title: '간판 핵심 개념' },
        { marker: '## 절차별 세부', title: '절차별 상세' },
        { marker: '### 1. 실측', title: '1. 실측 결정' },
        { marker: '### 2. 1차', title: '2. 1차 미팅' },
        { marker: '### 3. 2차', title: '3. 2차 미팅' },
        { marker: '### 4. 내부 사인물', title: '4. 내부 사인물 계약' },
        { marker: '### 5. 최종', title: '5. 최종 견적/계약' },
        { marker: '# 플래너의 역할', title: '간판 플래너 역할' },
        { marker: '## 간판 영역에서 자주', title: '간판 문제점' },
        { marker: '## 그래서 플래너님께서', title: '플래너 업무 정리' },
    ],

    // ── 세무 ──
    'hospital-basics/pre-construction/tax-loan.json': [
        { marker: '## 개원 과정에서 세무', title: '세무 개요' },
        { marker: '## 병의원 개원에서 세무가', title: '세무의 중요성' },
        { marker: '### 막대한 초기', title: '초기 비용 처리' },
        { marker: '### 첫 신고', title: '첫 신고의 정확성' },
        { marker: '### 리스크', title: '리스크 예방' },
        { marker: '# 병의원 개원 세무 기초', title: '세무 기초 지식' },
        { marker: '## 오픈닥터에서 세무', title: '오픈닥터 세무 파트너' },
        { marker: '## 플래너님이 꼭 아셔야', title: '세무 핵심 개념' },
        { marker: '## 절차별 세부', title: '절차별 상세' },
        { marker: '# 플래너의 역할', title: '세무 플래너 역할' },
        { marker: '## 세무 영역에서 발생', title: '세무 문제점' },
        { marker: '## 플래너님이 해주셔야', title: '플래너 업무' },
    ],

    // ── 개원 로드맵 (사용자 수동 편집본 유지) ──
    // 'hospital-opening-roadmap.json': SKIP

    // ── 체크리스트 general - 마지막 큰 항목(6510자) 분할 ──
    'checklist/general.json': [
        { marker: '## 1.', title: '1단계' },
        { marker: '## 2.', title: '2단계' },
        { marker: '## 3.', title: '3단계' },
        { marker: '## 4.', title: '4단계' },
        { marker: '## 5.', title: '5단계' },
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
    return mappings[relPath.replace('.json', '')] || { field: '기타', topic: '기타' };
}

// ============================================================
// 파일 처리
// ============================================================
function processFile(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.items || data.items.length === 0) return null;

    const relPath = path.relative(NOTION_DIR, filePath).replace(/\\/g, '/');
    const markers = FILE_SPLIT_MARKERS[relPath];
    const { field, topic } = getFieldAndTopic(relPath);
    const newItems = [];

    for (const item of data.items) {
        const answer = item.answer || '';

        if (markers && answer.length > 800) {
            const paragraphs = splitAtMarkers(answer, markers);
            if (paragraphs.length > 1) {
                for (let i = 0; i < paragraphs.length; i++) {
                    const para = paragraphs[i];
                    const kw = extractKeywords(para.title);
                    newItems.push({
                        id: `${item.id}-p${i + 1}`,
                        source: item.source || 'notion',
                        pageId: item.pageId,
                        question: `${item.question} - ${para.title}`,
                        answer: para.content,
                        metadata: {
                            field, topic,
                            category: item.metadata?.category || '페이지',
                            icon: item.metadata?.icon || '',
                            lastUpdated: item.metadata?.lastUpdated || data.lastUpdated,
                            structuredCategory: data.category,
                            structuredSubCategory: data.subCategory,
                            originalQuestion: item.question,
                            originalId: item.id,
                            paragraphTitle: para.title,
                            keywords: kw
                        }
                    });
                }
                continue;
            }
        }
        // 분할 불필요 - 원본 유지
        const kw = extractKeywords(item.question || '');
        newItems.push({
            id: item.id,
            source: item.source || 'notion',
            pageId: item.pageId,
            question: item.question,
            answer: item.answer,
            metadata: {
                field, topic,
                category: item.metadata?.category || '페이지',
                icon: item.metadata?.icon || '',
                lastUpdated: item.metadata?.lastUpdated || data.lastUpdated,
                structuredCategory: data.category,
                structuredSubCategory: data.subCategory,
                originalQuestion: item.question,
                originalId: item.id,
                paragraphTitle: item.question,
                keywords: kw
            }
        });
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
        if (entry.isDirectory()) results.push(...findJsonFiles(fullPath));
        else if (entry.name.endsWith('.json') && entry.name !== 'index.json') results.push(fullPath);
    }
    return results;
}

// ============================================================
// 메인
// ============================================================
function main() {
    console.log('📄 내용 기반 개별 분할 시작...\n');
    const files = findJsonFiles(NOTION_DIR);
    console.log(`📁 JSON 파일: ${files.length}개\n`);

    let totalOrig = 0, totalSplit = 0;
    const stats = [];

    for (const filePath of files) {
        const relPath = path.relative(NOTION_DIR, filePath).replace(/\\/g, '/');

        // 사용자 수동 편집본 유지
        if (relPath === 'hospital-opening-roadmap.json') {
            console.log(`  ⏭️ ${relPath}: 사용자 수동 편집 유지`);
            continue;
        }

        try {
            const result = processFile(filePath);
            if (!result) { console.log(`  ⚠️ ${relPath}: 항목 없음`); continue; }

            const origData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            const origCount = origData.items?.length || 0;

            const outputPath = path.join(OUTPUT_DIR, relPath.replace(/\//g, path.sep));
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');

            totalOrig += origCount;
            totalSplit += result.itemCount;
            stats.push({ file: relPath, original: origCount, split: result.itemCount, ratio: (result.itemCount / origCount).toFixed(1) });
            console.log(`  ✅ ${relPath}: ${origCount} → ${result.itemCount} (${(result.itemCount / origCount).toFixed(1)}x)`);
        } catch (err) {
            console.error(`  ❌ ${relPath}: ${err.message}`);
        }
    }

    // index.json 복사
    const idxSrc = path.join(NOTION_DIR, 'index.json');
    const idxDst = path.join(OUTPUT_DIR, 'index.json');
    if (fs.existsSync(idxSrc)) fs.copyFileSync(idxSrc, idxDst);

    console.log('\n' + '='.repeat(60));
    console.log('📊 분할 결과 요약');
    console.log('='.repeat(60));
    console.log(`처리 파일: ${stats.length}개`);
    console.log(`원본 항목: ${totalOrig}개`);
    console.log(`분할 항목: ${totalSplit}개`);
    console.log(`평균 비율: ${(totalSplit / totalOrig).toFixed(1)}x`);
    console.log('='.repeat(60));
    console.log('\n파일별 상세:');
    for (const s of stats) {
        console.log(`  ${s.file.padEnd(55)} ${String(s.original).padStart(3)} → ${String(s.split).padStart(4)} (${s.ratio}x)`);
    }
}

main();
