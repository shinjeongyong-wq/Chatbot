# Edge Case Test Report (Staging)
날짜: 2026. 2. 12. 오후 12:20:21
URL: http://localhost:3003
PASS: 16 | WARN: 0 | FAIL: 0
소요시간: 146.0초

══════════════════════════════════════════════════

## [1] ✅ PASS 인테리어 파트너사 추천해주세요
카테고리: partner-tier | 진료과: 피부과
기대: tier:1 인테리어 파트너사 다수 추천
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["인테리어"]
  subIntent: ["파트너사목록"]
  coreKeywords: 인테리어, 파트너사, 추천, 피부과
커트라인: 2.7500 (top=3.1750)
검색 결과 12개:
  [1] score=3.1750 tier:2 cat:partners | 네스트디자인 
  [2] score=3.1750 tier:- cat:partners | 🛠️ 오픈닥터 인테리어 파트너사 (1)
  [3] score=3.1125 tier:3 cat:partners | 플랜디자인
  [4] score=3.0500 tier:1 cat:partners | 인투익스
  [5] score=3.0500 tier:3 cat:partners | 더 코나 메디스페이스
  [6] score=3.0000 tier:3 cat:partners | 써드스페이스
  [7] score=2.8750 tier:1 cat:partners | 무아디자인
  [8] score=2.8000 tier:3 cat:partners | JWC그룹
  [9] score=2.8000 tier:2 cat:partners | 톤앤무드
  [10] score=2.7500 tier:3 cat:partners | 플럭스
  [11] score=2.7500 tier:3 cat:partners | 씨투와이
  [12] score=2.7500 tier:1 cat:partners | 메이드바이

──────────────────────────────────────────────────

## [2] ✅ PASS 간판 업체 추천해줘
카테고리: partner-tier | 진료과: 내과
기대: tier:1 간판 파트너사 추천
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["간판"]
  subIntent: ["파트너사목록","정보요청"]
  coreKeywords: 간판, 업체, 추천, 내과
커트라인: 2.9000 (top=3.2250)
검색 결과 11개:
  [1] score=3.2250 tier:2 cat:partners | 디온에이(D.on.A)
  [2] score=3.1625 tier:2 cat:partners | 더프라임
  [3] score=3.1625 tier:1 cat:partners | 디자인캐프
  [4] score=3.0375 tier:- cat:partners | 🚧 오픈닥터 간판 파트너사 (1)
  [5] score=2.9625 tier:3 cat:partners | 동부기업
  [6] score=2.9000 tier:- cat:partners | 📊 CRM/EMR 파트너사 (원장님용) (1)
  [7] score=2.9000 tier:- cat:partners | 💪 중후반  프로세스 파트너사 (원장님용) (1)
  [8] score=2.9000 tier:- cat:partners | 💺 오픈닥터 가구 파트너사 (1)
  [9] score=2.9000 tier:- cat:partners | 🖥️ 오픈닥터 PC&네트워크, 통신&보안 파트너사 (1)
  [10] score=2.9000 tier:- cat:partners | 🏠 오픈닥터 홈페이지 파트너사 (1)
  [11] score=2.9000 tier:- cat:partners | 🏦 은행 파트너사 (원장님용) (1)

──────────────────────────────────────────────────

## [3] ✅ PASS 의료기기 업체 알려줘
카테고리: partner-tier | 진료과: 정형외과
기대: tier:1 의료기기 파트너사 추천
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["의료기기"]
  subIntent: ["파트너사목록"]
  coreKeywords: 의료기기, 업체
커트라인: 2.3500 (top=2.5000)
검색 결과 15개:
  [1] score=2.5000 tier:2 cat:partners | 더프라임
  [2] score=2.4500 tier:1 cat:partners | 원프레임
  [3] score=2.4500 tier:1 cat:partners | 무아디자인
  [4] score=2.4500 tier:3 cat:partners | 동부기업
  [5] score=2.4000 tier:2 cat:partners | 바우스가구
  [6] score=2.4000 tier:- cat:partners | 📊 CRM/EMR 파트너사 (원장님용) (1)
  [7] score=2.4000 tier:- cat:partners | 🏦 은행 파트너사 (원장님용) (1)
  [8] score=2.3500 tier:1 cat:partners | 루벨루테
  [9] score=2.3500 tier:1 cat:partners | 플랜티
  [10] score=2.3500 tier:1 cat:partners | YourDev:유어데브
  [11] score=2.3500 tier:- cat:partners | 🛠️ 오픈닥터 인테리어 파트너사 (1)
  [12] score=2.3500 tier:- cat:partners | 💪 중후반  프로세스 파트너사 (원장님용) (1)
  [13] score=2.3500 tier:- cat:partners | 💺 오픈닥터 가구 파트너사 (1)
  [14] score=2.3500 tier:- cat:partners | 🖥️ 오픈닥터 PC&네트워크, 통신&보안 파트너사 (1)
  [15] score=2.3500 tier:- cat:partners | 🏠 오픈닥터 홈페이지 파트너사 (1)

──────────────────────────────────────────────────

## [4] ⚠️ 검색 스킵됨 (확인 필요) 세무사 추천해줄 수 있어?
카테고리: partner-tier | 진료과: 피부과
기대: 세무사 파트너사 추천 또는 관련 정보
Plan: intent=OUT_OF_SCOPE, requiresSearch=false
  topic: undefined
  subIntent: undefined
  coreKeywords: undefined

──────────────────────────────────────────────────

## [5] ✅ PASS 병원 홈페이지 만들어주는 업체 있어?
카테고리: partner-tier | 진료과: 내과
기대: 홈페이지/마케팅 파트너사 추천
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["홈페이지"]
  subIntent: ["파트너사목록","정보요청"]
  coreKeywords: 병원 홈페이지, 업체, 제작, 구축
커트라인: 2.2833 (top=3.0917)
검색 결과 10개:
  [1] score=3.0917 tier:1 cat:partners | 원프레임
  [2] score=2.9417 tier:1 cat:partners | BUD
  [3] score=2.9417 tier:2 cat:partners | 파인애플피티엘
  [4] score=2.9417 tier:1 cat:partners | YourDev:유어데브
  [5] score=2.7917 tier:- cat:partners | 🏠 오픈닥터 홈페이지 파트너사 (1)
  [6] score=2.3417 tier:2 cat:partners | 바우스가구
  [7] score=2.3417 tier:1 cat:partners | 루벨루테
  [8] score=2.3000 tier:3 cat:partners | 메종비퍼니처
  [9] score=2.3000 tier:3 cat:partners | 동부기업
  [10] score=2.2833 tier:2 cat:partners | 네스트디자인 

──────────────────────────────────────────────────

## [6] ✅ PASS 개원 절차가 어떻게 되나요?
카테고리: general | 진료과: 내과
기대: 개원 절차/로드맵 안내
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["개원로드맵"]
  subIntent: ["절차안내"]
  coreKeywords: 개원 절차, 개원 과정, 개원 로드맵
커트라인: 0.3375 (top=0.4500)
검색 결과 3개:
  [1] score=0.4500 tier:- cat:hospital-basics | 💰 세무
  [2] score=0.4000 tier:- cat:hospital-basics | 🏠 인테리어 (기본편)
  [3] score=0.3500 tier:- cat:hospital-basics | 🏢 관리 관련 업체 

──────────────────────────────────────────────────

## [7] ✅ PASS 병원 인테리어 비용이 어느 정도 드나요?
카테고리: cost | 진료과: 피부과
기대: 인테리어 비용 정보 (평당가 등)
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["인테리어"]
  subIntent: ["비용","정보요청"]
  coreKeywords: 인테리어, 비용, 견적, 피부과
커트라인: 1.2357 (top=1.4071)
검색 결과 12개:
  [1] score=1.4071 tier:3 cat:partners | 플랜디자인
  [2] score=1.4071 tier:3 cat:partners | 더 코나 메디스페이스
  [3] score=1.3393 tier:- cat:advanced | 🏗️ 인테리어 심화편 (1)
  [4] score=1.3393 tier:- cat:hospital-basics | 🏠 인테리어 (기본편)
  [5] score=1.2964 tier:- cat:- | 전열교환기는 어떤 공간에 설치하고 비용은 얼마인가요?
  [6] score=1.2714 tier:- cat:- | 병원 인테리어 총 비용과 평당 단가는 보통 어느 정도인가요?
  [7] score=1.2607 tier:- cat:- | 병원 전기 증설은 언제 필요하고 비용은 얼마나 드나요?
  [8] score=1.2571 tier:2 cat:partners | 네스트디자인 
  [9] score=1.2357 tier:- cat:- | 도면에는 포함되어 있으나 견적서 내역에서 누락된 항목에 대해 시공사가 추가 비용을
  [10] score=1.2357 tier:- cat:- | 인테리어 견적에서 천장 공사비가 포함되어 있는지 꼭 확인해야 하나요?
  [11] score=1.2357 tier:- cat:- | 병원 인테리어 견적에서 별도 항목으로 빠지는 비용은 무엇인가요?
  [12] score=1.2357 tier:- cat:- | 인테리어 계약금 외에 추가로 발생하는 비용 항목은 무엇인가요?

──────────────────────────────────────────────────

## [8] ✅ PASS 의료기기 리스 vs 구매 뭐가 유리해?
카테고리: equipment | 진료과: 내과
기대: 리스/구매 장단점 비교
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["의료기기"]
  subIntent: ["정보요청","비용"]
  coreKeywords: 의료기기, 리스, 구매, 비교, 내과
커트라인: 0.9600 (top=1.3438)
검색 결과 12개:
  [1] score=1.3438 tier:- cat:advanced | 💉 의료기기 통증 편 (1)
  [2] score=1.2838 tier:- cat:advanced | 🦷 의료기기 치과 편 (1)
  [3] score=1.2813 tier:- cat:hospital-basics | 🏥 의료기기 (기본편)
  [4] score=1.2500 tier:- cat:- | 내과 초음파 장비를 중고로 구매할 때 주의할 점은 무엇인가요?
  [5] score=1.2238 tier:- cat:advanced | 🩻 의료기기 내과 편 (1)
  [6] score=1.0800 tier:- cat:- | 의료기기 구매 시 리베이트 규정은 어떻게 되나요?
  [7] score=1.0700 tier:- cat:- | 맘모그라피(유방촬영기) 구매를 보류해도 되나요?
  [8] score=1.0513 tier:- cat:- | 치과 장비재료 구매 시 오스템과 메가젠 패키지만 사용하면 되나요?
  [9] score=1.0200 tier:- cat:advanced | 🫅 의료기기 미용 편 (1)
  [10] score=0.9600 tier:- cat:- | 치과 레진 수복 기구를 선택할 때 어떤 점을 고려해야 하나요?
  [11] score=0.9600 tier:- cat:- | 의료기기 구매 시 턴키 업체와 제조사 직접 구매의 차이는 무엇인가요?
  [12] score=0.9600 tier:- cat:- | PACS(의료영상저장전송시스템)는 일시불과 월 구독 중 어떤 게 유리한가요?

──────────────────────────────────────────────────

## [9] ✅ PASS 개원할 때 대출은 어떻게 받아?
카테고리: finance | 진료과: 피부과
기대: 개원 대출 정보
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["세무·대출"]
  subIntent: ["비용","정보요청"]
  coreKeywords: 대출, 개원, 병원, 피부과
커트라인: 0.5917 (top=0.7917)
검색 결과 10개:
  [1] score=0.7917 tier:2 cat:partners | 부산은행
  [2] score=0.7917 tier:1 cat:partners | [하나은행] 닥터플래티늄
  [3] score=0.7917 tier:3 cat:partners | [경남은행] 메디칼론
  [4] score=0.7833 tier:- cat:hospital-opening-roadmap | 병의원 개업의 전반적 로드맵
  [5] score=0.7000 tier:- cat:- | 병원 개원 시 PC 수량은 어떻게 산정하나요?
  [6] score=0.6833 tier:- cat:- | 병원 개원 대출 실행 일정과 인테리어 계약금 납부 시점이 맞지 않을 때, 계약 조
  [7] score=0.6833 tier:- cat:- | 병원 개원 대출 실행일과 인테리어 계약금 납부 일정이 맞지 않을 �� 자금을 유연
  [8] score=0.6833 tier:- cat:- | 병원 개원 대출(닥터론)은 어떤 구조로 받나요?
  [9] score=0.6000 tier:- cat:- | 신용보증기금(신보) 대출은 병원 개원 시 얼마까지 받을 수 있나요?
  [10] score=0.5917 tier:- cat:hospital-basics | 💰 세무

──────────────────────────────────────────────────

## [10] ✅ PASS 사업자등록은 어떻게 하나요?
카테고리: admin | 진료과: 내과
기대: 사업자등록 절차 안내
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["세무·대출"]
  subIntent: ["정보요청","절차안내"]
  coreKeywords: 사업자등록, 개원
커트라인: 0.6438 (top=0.8583)
검색 결과 5개:
  [1] score=0.8583 tier:- cat:checklist | 🗃️ 행정업무 체크리스트 (원장님용) (1)
  [2] score=0.8167 tier:- cat:advanced | 🏗️ 인테리어 심화편 (1)
  [3] score=0.8167 tier:- cat:hospital-basics | 💰 세무
  [4] score=0.8167 tier:- cat:hospital-opening-roadmap | 병의원 개업의 전반적 로드맵
  [5] score=0.7667 tier:- cat:hospital-basics | 📋 행정 업무

──────────────────────────────────────────────────

## [11] ✅ PASS 피부과 개원 시 필수 장비가 뭐야?
카테고리: specialty | 진료과: 피부과
기대: 피부과 장비 리스트
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["의료기기"]
  subIntent: ["정보요청"]
  coreKeywords: 필수 장비, 의료기기, 피부과
커트라인: 1.0500 (top=1.4000)
검색 결과 5개:
  [1] score=1.4000 tier:- cat:hospital-basics | 🏥 의료기기 (기본편)
  [2] score=1.3000 tier:- cat:advanced | 🦷 의료기기 치과 편 (1)
  [3] score=1.3000 tier:- cat:advanced | 💉 의료기기 통증 편 (1)
  [4] score=1.2500 tier:- cat:advanced | 🫅 의료기기 미용 편 (1)
  [5] score=1.2500 tier:- cat:- | 피부과 수면 마취 시술을 위한 공간은 어떻게 구성해야 하나요?

──────────────────────────────────────────────────

## [12] ✅ PASS 정형외과 인테리어 주의사항
카테고리: specialty | 진료과: 정형외과
기대: 정형외과 특화 인테리어 정보
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["인테리어"]
  subIntent: ["정보요청"]
  coreKeywords: 정형외과, 인테리어, 주의사항
커트라인: 0.9682 (top=1.1227)
검색 결과 11개:
  [1] score=1.1227 tier:1 cat:partners | 무아디자인
  [2] score=1.1227 tier:3 cat:partners | 플랜디자인
  [3] score=1.1227 tier:- cat:- | 입원실 허가를 받기 위해 반드시 설치해야 하는 특수 소방 설비와 주의사항은 무엇인
  [4] score=1.1000 tier:1 cat:partners | 메이드바이
  [5] score=1.1000 tier:- cat:- | 강제 배수 방식의 펌프형 위생 기기를 설치할 경우 발생할 수 있는 주요 고장 원인
  [6] score=1.1000 tier:- cat:- | 서버실과 세탁기/건조기 공간 사이에 칸막이를 설치할 때 주의사항은 무엇인가요?
  [7] score=1.1000 tier:- cat:- | 병원 외부 파사드(전면 유리) 공사 시 비용과 주의사항은 무엇인가요?
  [8] score=1.0591 tier:- cat:advanced | 🏗️ 인테리어 심화편 (1)
  [9] score=0.9909 tier:- cat:hospital-basics | 🏠 인테리어 (기본편)
  [10] score=0.9682 tier:- cat:- | 인테리어 마감에서 도장과 벽지를 어떻게 나눠 사용하면 비용을 절감할 수 있나요?
  [11] score=0.9682 tier:- cat:- | 병원 인테리어에서 바리솔(투광) 벽체란 무엇이고 설계 시 주의점은?

──────────────────────────────────────────────────

## [13] ✅ PASS 내과 개원 비용 총정리
카테고리: specialty | 진료과: 내과
기대: 내과 개원 비용 정보
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["개원로드맵","기타"]
  subIntent: ["비용","정보요청"]
  coreKeywords: 개원 비용, 내과, 총정리
커트라인: 0.4625 (top=0.6167)
검색 결과 3개:
  [1] score=0.6167 tier:- cat:advanced | 💉 의료기기 통증 편 (1)
  [2] score=0.5750 tier:- cat:hospital-basics | 🏥 의료기기 (기본편)
  [3] score=0.5250 tier:- cat:advanced | 🩻 의료기기 내과 편 (1)

──────────────────────────────────────────────────

## [14] ⚠️ 검색 스킵됨 (확인 필요) 오늘 날씨 어때?
카테고리: off-topic | 진료과: 미선택
기대: OUT_OF_SCOPE 또는 [OFF_TOPIC] 응답
Plan: intent=OFF_TOPIC, requiresSearch=false
  topic: undefined
  subIntent: undefined
  coreKeywords: undefined

──────────────────────────────────────────────────

## [15] ✅ PASS 안녕하세요
카테고리: greeting | 진료과: 미선택
기대: GREETING 응답 (검색 불필요)
Plan: intent=GREETING, requiresSearch=false
  topic: undefined
  subIntent: undefined
  coreKeywords: undefined

──────────────────────────────────────────────────

## [16] ⚠️ 검색 스킵됨 (확인 필요) 건설업등록증이 뭐야?
카테고리: general-info | 진료과: 미선택
기대: 건설업등록증 설명
Plan: intent=OUT_OF_SCOPE, requiresSearch=false
  topic: undefined
  subIntent: undefined
  coreKeywords: undefined

──────────────────────────────────────────────────

## [17] ✅ PASS 인테리어 평당가가 얼마야?
카테고리: cost-detail | 진료과: 피부과
기대: 평당가 정보 (일반 정보, 파트너사 아님)
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["인테리어"]
  subIntent: ["비용"]
  coreKeywords: 인테리어, 평당가, 비용, 견적, 피부과
커트라인: 1.1617 (top=1.4250)
검색 결과 11개:
  [1] score=1.4250 tier:3 cat:partners | 플랜디자인
  [2] score=1.4250 tier:3 cat:partners | 더 코나 메디스페이스
  [3] score=1.3467 tier:2 cat:partners | 네스트디자인 
  [4] score=1.3067 tier:- cat:advanced | 🏗️ 인테리어 심화편 (1)
  [5] score=1.3067 tier:- cat:hospital-basics | 🏠 인테리어 (기본편)
  [6] score=1.3050 tier:1 cat:partners | 인투익스
  [7] score=1.2450 tier:- cat:- | 병원 전기 증설은 언제 필요하고 비용은 얼마나 드나요?
  [8] score=1.2233 tier:- cat:- | 병원 인테리어 견적에서 별도 항목으로 빠지는 비용은 무엇인가요?
  [9] score=1.1817 tier:- cat:- | 인테리어 견적이 예산보다 높게 나왔는데 비용을 줄일 방법이 있나요?
  [10] score=1.1617 tier:- cat:- | 피부과 시술실마다 세면대(수전)를 설치할 필요가 있나요?
  [11] score=1.1617 tier:- cat:- | 전열교환기는 어떤 공간에 설치하고 비용은 얼마인가요?

──────────────────────────────────────────────────

## [18] ⚠️ 검색 스킵됨 (확인 필요) 개원 1차파동이 뭐야?
카테고리: specific | 진료과: 내과
기대: 1차파동 관련 정보
Plan: intent=OUT_OF_SCOPE, requiresSearch=false
  topic: undefined
  subIntent: undefined
  coreKeywords: undefined

──────────────────────────────────────────────────

## [19] ✅ PASS 병원 마케팅 어떻게 해?
카테고리: marketing | 진료과: 피부과
기대: 병원 마케팅 관련 정보
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["마케팅"]
  subIntent: ["정보요청"]
  coreKeywords: 마케팅, 병원, 피부과
커트라인: 1.1625 (top=1.3313)
검색 결과 14개:
  [1] score=1.3313 tier:- cat:- | 병원 간판에 영문 로고와 한글 병원명을 함께 넣는 전략은 어떻게 하나요?
  [2] score=1.2937 tier:- cat:- | 개원 초기 병원 경영의 안정성을 확보하기 위해 권장되는 적정 마케팅 예산 비중은 
  [3] score=1.2625 tier:- cat:- | 인테리어 완공 전 병원의 CI(로고)와 BI(브랜드 이미지)를 확정하는 것이 마케
  [4] score=1.2000 tier:- cat:- | 피부과 전문의 빨간 딱지(전문의 표시)는 간판에 꼭 넣어야 하나요?
  [5] score=1.2000 tier:- cat:- | 마케팅 성과와 직결되는 병원 홈페이지를 제작할 때 중복 투자를 방지하고 브랜드 가
  [6] score=1.1938 tier:1 cat:partners | 플랜티
  [7] score=1.1938 tier:- cat:- | 개원 초기에 지역 사회에 병원의 존재를 빠르게 알리기 위한 오프라인 광고 매체 활
  [8] score=1.1938 tier:- cat:- | 대형 교회나 성당을 중심으로 병원을 홍보할 때 가장 전환율이 높은 방법은 무엇인가
  [9] score=1.1938 tier:- cat:- | 병원 명칭이 확정되지 않은 상태에서 개원 전 인지도 확보와 온라인 유입을 동시에 
  [10] score=1.1625 tier:- cat:- | 온라인상에서 병원 이름을 검색했을 때 환자들에게 첫 방문의 확신을 줄 수 있는 정
  [11] score=1.1625 tier:- cat:- | 병원의 온라인 평판을 관리하기 위해 블로그 운영과 포털 사이트 리뷰를 관리할 때 
  [12] score=1.1625 tier:- cat:- | 개원 초기 병원의 지역 내 신뢰도를 높이고 고정 고객층을 확보하기 위한 효율적인 
  [13] score=1.1625 tier:- cat:- | 지역 내 전문의가 많은 환경에서 우리 병원만의 강점을 구축하고 저수가 경쟁을 피할
  [14] score=1.1625 tier:- cat:- | 거주 지역 내 남성 잠재 환자를 확보하기 위해 여성(배우자)의 의사결정 영향력을 

──────────────────────────────────────────────────

## [20] ✅ PASS 직원 채용은 언제부터 해야 해?
카테고리: hr | 진료과: 내과
기대: 직원 채용 시기/방법 정보
Plan: intent=SPECIFIC, requiresSearch=true
  topic: ["노무","개원로드맵"]
  subIntent: ["절차안내","정보요청"]
  coreKeywords: 직원 채용, 시기, 언제부터
커트라인: 0.6548 (top=1.2909)
검색 결과 6개:
  [1] score=1.2909 tier:- cat:- | 병원 개원 시 직원 채용은 언제부터 시작해야 하나요?
  [2] score=0.9682 tier:- cat:- | 치과 직원 채용 공고는 어디에 올려야 하나요?
  [3] score=0.7136 tier:- cat:- | 대규모 구인과 채용을 앞둔 개원 초기 단계에서 법적 분쟁을 예방하기 위해 노무 상
  [4] score=0.6909 tier:- cat:- | 병원 직원 관리에서 노무사가 필요한 상황은 어떤 경우인가요?
  [5] score=0.6682 tier:- cat:- | 병원 개원 시 세무대리인과 노무사 중 누구를 먼저 선임해야 하나요?
  [6] score=0.6682 tier:- cat:- | 현재 직장에 퇴사를 알리기 전에 채용 공고를 올릴 수 있나요?

──────────────────────────────────────────────────
