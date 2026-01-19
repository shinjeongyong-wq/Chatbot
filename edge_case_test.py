# -*- coding: utf-8 -*-
"""
챗봇 엣지케이스 테스트 자동화 스크립트
- 100개 엣지케이스 질문을 챗봇 API로 테스트
- 결과를 구글 시트 '엣지케이스 시트'에 기록
"""

import requests
import time
import json
import sys
import io

# Windows 콘솔 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stdout.reconfigure(line_buffering=True)  # 실시간 출력

# ============ 설정 ============
CHATBOT_API_URL = "https://chatbot-omega-ivory-22.vercel.app/api/chat"
SPREADSHEET_ID = "1-YZhxai1zHQOBspas4ivKBiNf8cFnq-JC7IXgFB0to4"
API_KEY = "AIzaSyACzOZzF6Wb2ZUYGEf_7GDa96dJKJSZdP4"
VERSION = "ver1.0"
SHEET_NAME = "엣지케이스 시트"

# Google Apps Script Web App URL (기존 피드백 시스템과 동일)
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzCPbV3COpzi0_8Ss2aqeAmx-KvkZHhaPjssLQ37I8ygpT-wiELLlfsTx5JRrPVvWt3/exec"
SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

# ============ 질문 리스트 (100개) ============
EDGE_CASE_QUESTIONS = [
    # 카테고리 1: 입지 및 부동산 (15개)
    "근처에 같은 진료과가 이미 3개나 있는데, 제가 들어가도 승산이 있을까요?",
    "건물이 너무 낡았는데, 누수나 층간소음 문제는 인테리어로 해결이 되나요?",
    "권리금이 없는 대신 월세가 너무 비싼데, 2층이어도 괜찮을까요?",
    "주차장이 기계식이라 SUV가 안 들어가는데, 이거 환자 이탈률에 영향 클까요?",
    "약국이 같은 층에 들어올 예정이라는데, 동선을 어떻게 짜야 할까요?",
    "임대인이 병원 개원 경험이 없어서 소방 설비 부담을 안 하려는데 어떡하죠?",
    "실평수는 40평인데 공용면적이 너무 커서 관리비가 걱정돼요.",
    "근처에 대단지 아파트가 들어온다는데, 입주 시기보다 미리 여는 게 낫나요?",
    "간판을 크게 달고 싶은데 지자체 조례 때문에 안 된다고 하네요. 방법 없나요?",
    "엘리베이터가 너무 좁아서 휠체어가 겨우 들어가는데, 허가 나올까요?",
    "테라스가 있는 상가인데 여기를 환자 대기실로 써도 되나요?",
    "근처 지하철역이랑 도보 10분 거리인데, 셔틀버스 운행해도 될까요?",
    "상가 번영회에서 간판 자리를 안 내주는데 법적으로 대응 가능한가요?",
    "전기 용량이 모자라서 승압 공사를 해야 한다는데 비용이 보통 얼마나 드나요?",
    "병원 입구 앞에 가로수가 있어서 간판이 가려지는데 가지치기 마음대로 해도 되나요?",
    
    # 카테고리 2: 인테리어 및 레이아웃 (20개)
    "요속검사실을 만들려고 하는데, 환자가 수치스럽지 않게 소음 차단 확실히 되나요?",
    "대기실을 카페처럼 만들고 싶은데, 그러면 의료법 위반인가요?",
    "진료실 창문이 너무 커서 밖에서 보일까 봐 걱정인데, 선팅지 추천해 주세요.",
    "수액실 베드를 5개 넣고 싶은데 간호사 동선이 너무 꼬이지 않을까요?",
    "인테리어 업체가 자꾸 중간에 자재비 올랐다고 추가금 달라고 하는데 어쩌죠?",
    "엑스레이실 납 차폐 공사, 보건소에서 검사 나올 때 엄청 까다롭게 보나요?",
    "바닥재를 타일로 하고 싶은데 환자들이 미끄러질까 봐 걱정돼요.",
    "조명을 너무 밝게 하면 눈이 피로할 것 같은데, 조도 조절 스위치 달 수 있나요?",
    "공사 기간이 예상보다 2주 늦어진다는데 임대료 지원받을 방법 있을까요?",
    "원장실 안에 개인 화장실이나 샤워실 만드는 거 비용 많이 드나요?",
    "천장에 시스템 에어컨 위치가 마음에 안 드는데 옮기면 비용 얼마나 깨질까요?",
    "내벽을 가벽으로 치면 옆 진료실 상담 내용이 다 들릴까 봐 걱정입니다.",
    "도면 보니까 환자 대기실이 너무 좁은 것 같아요. 카운터를 뒤로 밀 순 없나요?",
    "수술실 소독 규정이 바뀌었다는데 인테리어할 때 반영해야 할 게 뭐죠?",
    "장애인 편의시설 설치 안 하면 개설 허가 아예 안 나오나요?",
    "인테리어 하자 보수 기간은 보통 1년인가요? 계약서에 명시해야 할 문구는요?",
    "탕비실에 세탁기랑 건조기 넣고 싶은데 배수 공사 미리 말 안 해도 되나요?",
    "물리치료실 베드 사이에 커튼 말고 파티션으로 하면 답답해 보일까요?",
    "전기 콘센트 위치를 나중에 바꿀 수 있나요? 지금 장비 위치가 확실치 않아서요.",
    "인테리어 미팅 갈 때 제가 미리 준비해서 보여줘야 할 레퍼런스가 있을까요?",
    
    # 카테고리 3: 장비 및 EMR (10개)
    "중고 장비를 사려고 하는데, 나중에 감가상각이나 세금 혜택에서 손해인가요?",
    "EMR 프로그램이 너무 많은데, 우리 과에서 가장 많이 쓰는 게 뭔가요?",
    "리스로 장비를 들여오는 게 나을까요, 아니면 닥터론 받아서 일시불이 낫나요?",
    "장비가 너무 커서 엘리베이터로 안 옮겨지는데 사다리차 불러야 하나요?",
    "PACS 연동이 잘 안 되면 진료 볼 때 끊기지 않을까요?",
    "C-arm실 방사선 방어막을 이동식으로 해도 허가가 나오나요?",
    "장비 업체에서 유지보수비를 매달 받겠다는데 이게 보통인가요?",
    "태블릿으로 문진표 받으려는데 EMR이랑 실시간 연동 되나요?",
    "키오스크로 수납까지 다 하게 만들면 데스크 직원을 줄여도 될까요?",
    "검사 장비 들어오기 전에 전기 안정기(UPS) 꼭 설치해야 하나요?",
    
    # 카테고리 4: 노무 및 인사 (15개)
    "간호사가 면접 때는 다 한다고 해놓고 출근 첫날 안 나오면 어떡하죠?",
    "경력직 실장님 연봉을 얼마로 책정해야 주변 병원에 안 뺏길까요?",
    "오픈 멤버들 유니폼은 제가 직접 골라줘야 하나요, 아니면 고르게 하나요?",
    "주 5일 근무제로 하고 싶은데 토요일 진료는 로테이션으로 돌려도 될까요?",
    "점심시간에 전화 안 받게 돌려놓으면 환자들이 불친절하다고 할까요?",
    "직원이 사고를 쳐서 환자가 컴플레인 걸면 원장인 제가 책임져야 하나요?",
    "4대 보험 가입 안 하고 프리랜서로 계약하고 싶다는 직원이 있는데 괜찮나요?",
    "수습 기간에는 월급의 90%만 줘도 법적으로 문제없나요?",
    "가족을 데스크 직원으로 채용하면 세무상 불이익이 있을까요?",
    "직원들끼리 파벌 싸움이 생기면 원장이 개입해야 하나요?",
    "퇴직금 적립은 미리미리 해두는 게 좋은가요, 아니면 나중에 한 번에 주나요?",
    "야간 진료 수당은 시급의 몇 배를 줘야 하나요?",
    "근로계약서에 '무단퇴사 시 손해배상' 문구 넣으면 효력이 있나요?",
    "직원이 출산 휴가 간다는데 대체 인력 구하기가 너무 힘들어요.",
    "면접 볼 때 질문하면 안 되는 사적인 내용이 뭐가 있을까요?",
    
    # 카테고리 5: 마케팅 및 브랜드 (15개)
    "블로그 대행 업체가 너무 많은데 사기 안 당하려면 뭘 확인해야 하죠?",
    "네이버 플레이스 순위가 2페이지 뒤로 밀렸는데 다시 올릴 방법 없나요?",
    "병원 이름을 영어로 하면 환자들이 어렵게 느낄까요?",
    "개원 전단지를 돌리는 게 요즘 시대에 효과가 있긴 한가요?",
    "인스타그램 마케팅, 젊은 층 위주 과가 아니어도 해야 하나요?",
    "지역 맘카페에 제 병원 칭찬 글 올라오게 하는 거 걸리면 정지당하나요?",
    "로고 디자인을 외주 맡겼는데 마음에 안 들면 수정을 몇 번까지 해주나요?",
    "지하철 광고비가 생각보다 비싼데, 가성비 좋은 광고가 뭐가 있을까요?",
    "개원 기념품으로 떡이나 수건 말고 센스 있는 거 추천해 주세요.",
    "홈페이지 꼭 만들어야 하나요? 그냥 블로그만 운영하면 안 되나요?",
    "진료 시간에 제가 직접 유튜브 촬영하는 거 환자들이 안 좋아할까요?",
    "네이버 예약 시스템 쓰면 노쇼 환자가 많아지지 않을까요?",
    "영수증 리뷰에 악플이 달렸는데 삭제 요청 가능한가요?",
    "우리 동네 1등 병원은 마케팅비를 한 달에 얼마 정도 쓸까요?",
    "병원 외벽 현수막 광고, 구청에 허가 안 받고 달면 벌금 얼마인가요?",
    
    # 카테고리 6: 세무 및 금융 (10개)
    "닥터론 대출 한도가 제가 생각한 것보다 적게 나왔는데 증액 방법 있나요?",
    "공동 개원을 하려는데 지분 나누는 거 나중에 싸움 안 나게 하려면 어쩌죠?",
    "사업용 신용카드는 개원 전부터 써도 세액 공제 되나요?",
    "개원 비용 중에서 비용 처리가 아예 안 되는 항목도 있나요?",
    "현금영수증 의무 발행 안 하면 과태료가 얼마나 무겁나요?",
    "세무사 사무실은 병원 전문으로 하는 곳이 따로 있나요?",
    "개설 신고 전에 산 컴퓨터나 비품들도 비용 인정받을 수 있나요?",
    "종합소득세 낼 때 세금을 조금이라도 줄일 수 있는 '꿀팁' 좀 알려주세요.",
    "인테리어 비용을 현금으로 주면 깎아준다는데, 부가세 안 내는 게 이득인가요?",
    "직원 복지비로 쓴 돈(회식비 등) 한도가 정해져 있나요?",
    
    # 카테고리 7: 행정 및 기타 (15개)
    "보건소 개설 신고하러 갈 때 준비물 빠뜨리면 다시 가야 하나요?",
    "의료 사고 보험(배상책임보험)은 꼭 들어야 하나요?",
    "마약류 관리 대장 쓰는 거 너무 복잡해 보이는데 교육 따로 해주나요?",
    "의사 면허 정지 상태인데 개원 준비는 미리 해도 되나요?",
    "개원하고 나서 진료 과목을 추가하거나 바꾸려면 절차가 어떻게 되나요?",
    "간판에 '전문의' 글자 크기를 이름보다 작게 해야 한다는 규정이 있나요?",
    "폐기물 처리 업체 계약은 개원 전날에 해도 늦지 않나요?",
    "건강검진 기관 지정받으려면 시설 기준이 따로 있나요?",
    "병원 내부 게시판에 비급여 진료비 고지 안 하면 벌금인가요?",
    "원외 처방전 발행할 때 약국이랑 협의해야 하는 게 있나요?",
    "개원 축하 화환이 너무 많이 들어왔는데 복도에 둬도 소방법 위반인가요?",
    "병원 이름이 근처 병원이랑 너무 비슷한데 상표권 분쟁 생길까요?",
    "야간 진료를 일주일에 2번만 하고 싶은데 진료 시간표에 명시해야 하나요?",
    "개원식 때 지역 유지분들을 초대해야 하나요? 요즘 트렌드는 어떤가요?",
    "이 모든 과정을 혼자 하려니 너무 벅찬데, 컨설팅 비용은 보통 얼마인가요?",
]


def call_chatbot_api(question: str) -> dict:
    """챗봇 API 호출"""
    try:
        response = requests.post(
            CHATBOT_API_URL,
            json={
                "userQuery": question,
                "systemPrompt": ""  # 시스템 프롬프트는 서버에서 처리
            },
            headers={"Content-Type": "application/json"},
            timeout=60
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                return {
                    "success": True,
                    "answer": data.get("text", ""),
                    "model": data.get("modelName", "Unknown")
                }
            else:
                return {
                    "success": False,
                    "answer": data.get("error", "응답 실패"),
                    "model": None
                }
        else:
            return {
                "success": False,
                "answer": f"HTTP Error: {response.status_code}",
                "model": None
            }
    except Exception as e:
        return {
            "success": False,
            "answer": f"Error: {str(e)}",
            "model": None
        }


def create_sheet_if_not_exists():
    """시트가 없으면 생성 (Sheets API 사용)"""
    url = f"{SHEETS_API_BASE}/{SPREADSHEET_ID}?key={API_KEY}"
    response = requests.get(url)
    
    if response.status_code == 200:
        data = response.json()
        sheets = [s.get("properties", {}).get("title") for s in data.get("sheets", [])]
        print(f"[INFO] 현재 시트 목록: {sheets}")
        
        if SHEET_NAME not in sheets:
            print(f"[WARN] '{SHEET_NAME}' 시트가 없습니다. 수동으로 생성해주세요.")
            return False
        return True
    else:
        print(f"[ERROR] 시트 조회 실패: {response.status_code}")
        return False


def run_edge_case_tests():
    """엣지케이스 테스트 실행"""
    print("=" * 60)
    print("[START] 챗봇 엣지케이스 테스트 시작")
    print(f"[INFO] 총 질문 수: {len(EDGE_CASE_QUESTIONS)}개")
    print(f"[INFO] 버전: {VERSION}")
    print("=" * 60)
    
    results = []
    
    for idx, question in enumerate(EDGE_CASE_QUESTIONS, 1):
        print(f"\n[{idx:3d}/{len(EDGE_CASE_QUESTIONS)}] 테스트 중...")
        print(f"  Q: {question[:50]}...")
        
        response = call_chatbot_api(question)
        
        if response["success"]:
            answer = response["answer"]
            # 태그 제거
            answer = answer.replace("[OFF_TOPIC]", "").replace("[NO_DATA]", "")
            print(f"  A: {answer[:50]}...")
            print(f"  Model: {response['model']}")
        else:
            answer = f"[ERROR] {response['answer']}"
            print(f"  [ERROR] {response['answer']}")
        
        results.append({
            "question": question,
            "answer": answer,
            "version": VERSION,
            "model": response.get("model", "Unknown")
        })
        
        # API Rate Limit 방지
        time.sleep(1)
    
    print("\n" + "=" * 60)
    print("[DONE] 테스트 완료!")
    print("=" * 60)
    
    return results


def save_results_to_csv(results: list, filename: str = "edge_case_results.csv"):
    """결과를 CSV 파일로 저장"""
    import csv
    
    with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=["question", "answer", "version", "model"])
        writer.writeheader()
        writer.writerows(results)
    
    print(f"[SAVED] 결과가 '{filename}'에 저장되었습니다.")


if __name__ == "__main__":
    # 시트 존재 확인
    print("[INFO] 구글 시트 확인 중...")
    create_sheet_if_not_exists()
    
    # 테스트 실행
    results = run_edge_case_tests()
    
    # CSV로 저장 (구글 시트 수동 업로드용)
    save_results_to_csv(results)
    
    # 결과 요약
    print("\n" + "=" * 60)
    print("[SUMMARY] 결과 요약")
    print("=" * 60)
    print(f"총 테스트: {len(results)}개")
    success_count = sum(1 for r in results if not r["answer"].startswith("[ERROR]"))
    print(f"성공: {success_count}개")
    print(f"실패: {len(results) - success_count}개")
    print(f"\n결과 파일: edge_case_results.csv")
    print("이 파일을 구글 시트 '엣지케이스 시트'에 붙여넣으세요.")
