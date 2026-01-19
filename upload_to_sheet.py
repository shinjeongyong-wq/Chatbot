# -*- coding: utf-8 -*-
"""
구글 시트 자동 업로드 스크립트
- 기존 Apps Script Web App을 활용하여 '엣지케이스 시트'에 데이터 업로드
"""

import csv
import json
import requests
import sys
import io
import time

# Windows 콘솔 인코딩 설정
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stdout.reconfigure(line_buffering=True)

# 구글 시트 설정 - 새로 배포된 Apps Script URL
GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbze5_uqIy0-UFmzOZBiGWF8F0VEe5zxyVTbHzpLrTwBAY0gK_4af5eRX0CZ8Uqv3BxD/exec"

def read_csv_data(filename="edge_case_results.csv"):
    """CSV 파일 읽기"""
    results = []
    with open(filename, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            results.append({
                "question": row["question"],
                "answer": row["answer"],
                "version": row["version"]
            })
    return results

def upload_single_item(item, idx, total):
    """단일 항목 업로드"""
    try:
        # Apps Script에 맞는 형식으로 전송
        # 기존 피드백 시스템과 유사한 형식 사용
        payload = {
            "sheetName": "EdgeCaseTest",  # 새 시트 이름
            "question": item["question"],
            "answer": item["answer"][:1000],  # 답변 길이 제한
            "version": item["version"],
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        
        response = requests.post(
            GOOGLE_APPS_SCRIPT_URL,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )
        
        return True
        
    except Exception as e:
        print(f"[ERROR] {idx}번째 항목 업로드 실패: {e}")
        return False

def upload_to_sheet(data):
    """구글 시트에 데이터 업로드"""
    print(f"[INFO] {len(data)}개 데이터를 구글 시트에 업로드 중...")
    print("[INFO] Apps Script Web App을 통해 업로드합니다.")
    print("[INFO] 시트 이름: EdgeCaseTest")
    print("")
    
    success_count = 0
    fail_count = 0
    
    for idx, item in enumerate(data, 1):
        if upload_single_item(item, idx, len(data)):
            success_count += 1
        else:
            fail_count += 1
        
        if idx % 10 == 0:
            print(f"[PROGRESS] {idx}/{len(data)} 완료 (성공: {success_count}, 실패: {fail_count})")
        
        # Rate limit 방지
        time.sleep(0.5)
    
    print("")
    print("=" * 50)
    print(f"[DONE] 업로드 완료!")
    print(f"  - 성공: {success_count}개")
    print(f"  - 실패: {fail_count}개")
    print("=" * 50)

if __name__ == "__main__":
    print("=" * 50)
    print("[START] 구글 시트 자동 업로드 시작")
    print("=" * 50)
    print("")
    
    # CSV 데이터 로드
    data = read_csv_data()
    print(f"[INFO] CSV에서 {len(data)}개 데이터 로드 완료")
    print("")
    
    # 구글 시트 업로드
    upload_to_sheet(data)
