"""
노션 페이지를 LLM 최적화 Markdown으로 변환하는 스크립트.
Notion MCP 서버가 아닌 직접 API 호출로 모든 페이지/블록을 재귀적으로 추출.
"""
import os
import json
import re
import time
import requests
from pathlib import Path

# ──────────────── 설정 ────────────────
NOTION_TOKEN = os.environ.get("NOTION_TOKEN", "")
NOTION_VERSION = "2022-06-28"
BASE_URL = "https://api.notion.com/v1"
OUTPUT_DIR = Path(r"C:\Users\jeong\OneDrive\바탕 화면\chatbot\data\notion_optimized")

HEADERS = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
}

# ──────────────── 페이지 트리 정의 ────────────────
# 플래너 AI 메인 페이지
PLANNER_AI_PAGE = "2ed62ade-d336-8064-a192-e1269201fbd2"
# 플래너 온보딩 페이지
PLANNER_ONBOARDING_PAGE = "30d62ade-d336-812e-b25e-ffb019945bb6"

# ──────────────── API 호출 ────────────────
def notion_get(endpoint, params=None):
    """Notion API GET 요청"""
    url = f"{BASE_URL}/{endpoint}"
    resp = requests.get(url, headers=HEADERS, params=params or {})
    resp.raise_for_status()
    return resp.json()

def get_block_children(block_id):
    """블록의 모든 자식을 페이지네이션으로 확보"""
    all_results = []
    cursor = None
    while True:
        params = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        data = notion_get(f"blocks/{block_id}/children", params)
        all_results.extend(data.get("results", []))
        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")
        time.sleep(0.35)
    return all_results

def get_page(page_id):
    """페이지 메타데이터 가져오기"""
    return notion_get(f"pages/{page_id}")

# ──────────────── 블록 → 텍스트 변환 ────────────────
def extract_rich_text(rich_text_list):
    """rich_text 배열 → 일반 텍스트"""
    parts = []
    for rt in rich_text_list:
        text = rt.get("plain_text", "")
        ann = rt.get("annotations", {})
        if ann.get("bold"):
            text = f"**{text}**"
        if ann.get("italic"):
            text = f"*{text}*"
        if ann.get("code"):
            text = f"`{text}`"
        parts.append(text)
    return "".join(parts)

def block_to_markdown(block, depth=0):
    """단일 블록 → Markdown 문자열 변환 (재귀적으로 자식 포함)"""
    btype = block.get("type", "")
    lines = []
    indent = "  " * depth

    if btype == "paragraph":
        text = extract_rich_text(block[btype].get("rich_text", []))
        if text.strip():
            lines.append(f"{indent}{text}")

    elif btype in ("heading_1", "heading_2", "heading_3"):
        level = int(btype[-1])
        text = extract_rich_text(block[btype].get("rich_text", []))
        if text.strip():
            lines.append(f"{'#' * (level + 1)} {text}")  # +1 because # is page title

    elif btype == "bulleted_list_item":
        text = extract_rich_text(block[btype].get("rich_text", []))
        if text.strip():
            lines.append(f"{indent}- {text}")

    elif btype == "numbered_list_item":
        text = extract_rich_text(block[btype].get("rich_text", []))
        if text.strip():
            lines.append(f"{indent}1. {text}")

    elif btype == "to_do":
        text = extract_rich_text(block[btype].get("rich_text", []))
        checked = block[btype].get("checked", False)
        mark = "x" if checked else " "
        if text.strip():
            lines.append(f"{indent}- [{mark}] {text}")

    elif btype == "toggle":
        text = extract_rich_text(block[btype].get("rich_text", []))
        if text.strip():
            lines.append(f"\n{indent}### {text}")

    elif btype == "callout":
        text = extract_rich_text(block[btype].get("rich_text", []))
        icon = block[btype].get("icon", {})
        emoji = icon.get("emoji", "💡") if icon.get("type") == "emoji" else "💡"
        if text.strip():
            lines.append(f"\n> {emoji} {text}")

    elif btype == "quote":
        text = extract_rich_text(block[btype].get("rich_text", []))
        if text.strip():
            lines.append(f"> {text}")

    elif btype == "divider":
        lines.append("\n---\n")

    elif btype == "table":
        # 테이블은 자식 블록(table_row)으로 구성
        pass  # handle in children

    elif btype == "table_row":
        cells = block[btype].get("cells", [])
        row = " | ".join(extract_rich_text(cell) for cell in cells)
        lines.append(f"| {row} |")

    elif btype == "code":
        text = extract_rich_text(block[btype].get("rich_text", []))
        lang = block[btype].get("language", "")
        lines.append(f"```{lang}\n{text}\n```")

    elif btype == "bookmark":
        url = block[btype].get("url", "")
        if url:
            lines.append(f"- 참고 링크: {url}")

    elif btype == "embed":
        url = block[btype].get("url", "")
        if url:
            lines.append(f"- 임베드 링크: {url}")

    elif btype == "child_page":
        # 하위 페이지는 별도 처리
        title = block[btype].get("title", "")
        lines.append(f"\n→ 하위 페이지: {title}")

    elif btype in ("image", "video", "file", "pdf"):
        # 멀티미디어 = 노이즈, 스킵
        pass

    elif btype in ("column_list", "column"):
        # 컬럼은 자식으로 처리
        pass

    elif btype == "synced_block":
        # 동기화 블록은 자식으로 처리
        pass

    # 자식 블록 재귀 처리
    if block.get("has_children", False) and btype not in ("child_page",):
        children = get_block_children(block["id"])
        table_started = False
        for child in children:
            child_type = child.get("type", "")

            # 테이블 헤더 구분선 삽입
            if child_type == "table_row" and not table_started:
                child_lines = block_to_markdown(child, depth)
                lines.extend(child_lines)
                # 헤더 구분선
                cells = child.get("table_row", {}).get("cells", [])
                sep = " | ".join("---" for _ in cells)
                lines.append(f"| {sep} |")
                table_started = True
            else:
                child_lines = block_to_markdown(child, depth if btype in ("column_list", "column", "synced_block") else depth)
                lines.extend(child_lines)

    return lines

# ──────────────── 페이지 전체 추출 ────────────────
def extract_page_content(page_id):
    """페이지의 전체 콘텐츠를 Markdown 라인 리스트로 반환"""
    blocks = get_block_children(page_id)
    all_lines = []
    for block in blocks:
        lines = block_to_markdown(block)
        all_lines.extend(lines)
    return all_lines

def get_page_title(page_id):
    """페이지 제목 추출"""
    page = get_page(page_id)
    props = page.get("properties", {})
    title_prop = props.get("title", {})
    title_list = title_prop.get("title", [])
    return extract_rich_text(title_list) if title_list else "제목없음"

# ──────────────── 텍스트 최적화 ────────────────
def optimize_text(text):
    """LLM 최적화 원칙에 따라 텍스트 정제"""
    # 1. 이모지 제거 (일부 의미 있는 것은 유지)
    # 주요 구조/UI 이모지만 제거, 의미 있는 것은 유지
    noise_emojis = re.compile(r'[📌📍✅❌⚠️🔥💡🎯🚀⭐️🔗📎👉👈👆👇🔴🟢🟡🔵⬛⬜🔶🔷💬📢📣🎉🎊💪🙏👍✨💎🏆🥇📋📝🗂️📂📁🗒️🗓️📆📅⏰⏳🕐💰💵💴💶💳🏧📊📈📉🔍🔎💻🖥️📱📲✉️📧📩🔔🔕🎵🎶🔑🔐🔒🔓🏠🏡🏢🏣🏥🏪🏫🏭🏗️]')
    text = noise_emojis.sub('', text)

    # 2. 연속 빈 줄 정리
    text = re.sub(r'\n{3,}', '\n\n', text)

    # 3. 의미 없는 참조 제거
    text = re.sub(r'\[이미지\]', '', text)
    text = re.sub(r'Notion에서 확인하세요\.?', '', text)
    text = re.sub(r'전체 내용은 페이지에서 확인.*', '', text)

    # 4. 빈 마크다운 요소 제거
    text = re.sub(r'^[-*] \s*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^#{1,6}\s*$', '', text, flags=re.MULTILINE)

    # 5. 앞뒤 공백 정리
    text = text.strip()

    return text

# ──────────────── 토픽 기반 분리 ────────────────
def split_by_topics(lines, max_tokens=1500, min_tokens=200):
    """
    라인 리스트를 토픽 단위로 분리.
    헤딩(##, ###)을 기준으로 분리하되, 너무 짧으면 합침.
    """
    sections = []
    current_section = []
    current_heading = None

    for line in lines:
        # ## 또는 ### 헤딩이면 새 섹션 시작
        if re.match(r'^#{2,3}\s+', line.strip()) and current_section:
            sections.append((current_heading, current_section))
            current_heading = line.strip()
            current_section = [line]
        else:
            if current_heading is None and re.match(r'^#{2,3}\s+', line.strip()):
                current_heading = line.strip()
            current_section.append(line)

    if current_section:
        sections.append((current_heading, current_section))

    # 짧은 섹션 병합
    merged = []
    buffer_heading = None
    buffer_lines = []

    for heading, section_lines in sections:
        content = "\n".join(section_lines)
        token_est = len(content) // 2  # 한글 대략 1.5~2 토큰/자

        if token_est < min_tokens and buffer_lines:
            buffer_lines.extend(section_lines)
        else:
            if buffer_lines:
                merged.append((buffer_heading, buffer_lines))
            buffer_heading = heading
            buffer_lines = list(section_lines)

    if buffer_lines:
        merged.append((buffer_heading, buffer_lines))

    return merged

# ──────────────── 메인 로직 ────────────────
def save_page_as_md(page_id, category, phase, output_subdir, filename_hint=None):
    """한 페이지를 추출 → 최적화 → MD 파일 저장"""
    title = get_page_title(page_id)
    print(f"  📖 추출 중: {title} ({page_id[:8]}...)")

    lines = extract_page_content(page_id)
    full_text = "\n".join(lines)
    full_text = optimize_text(full_text)

    if not full_text.strip():
        print(f"  ⚠️ 빈 컨텐츠, 스킵: {title}")
        return []

    # 분리할 필요가 있는지 확인
    token_est = len(full_text) // 2
    output_path = OUTPUT_DIR / output_subdir

    saved_files = []

    if token_est <= 1500:
        # 단일 파일
        fname = filename_hint or title_to_filename(title)
        frontmatter = make_frontmatter(title, category, phase, [])
        content = frontmatter + "\n" + full_text
        fpath = output_path / f"{fname}.md"
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_text(content, encoding="utf-8")
        saved_files.append(str(fpath))
        print(f"  ✅ 저장: {fpath.name} ({token_est} tokens est.)")
    else:
        # 토픽 분리
        sections = split_by_topics(full_text.split("\n"))
        base_fname = filename_hint or title_to_filename(title)

        if len(sections) <= 1:
            # 분리 불가능하면 그냥 저장
            frontmatter = make_frontmatter(title, category, phase, [])
            content = frontmatter + "\n" + full_text
            fpath = output_path / f"{base_fname}.md"
            fpath.parent.mkdir(parents=True, exist_ok=True)
            fpath.write_text(content, encoding="utf-8")
            saved_files.append(str(fpath))
            print(f"  ✅ 저장 (단일): {fpath.name}")
        else:
            for i, (heading, section_lines) in enumerate(sections, 1):
                section_text = "\n".join(section_lines)
                section_text = optimize_text(section_text)
                if not section_text.strip():
                    continue

                suffix = f"_{i:02d}"
                sub_title = f"{title} - Part {i}"
                if heading:
                    # 헤딩에서 제목 추출
                    heading_text = re.sub(r'^#{1,6}\s+', '', heading)
                    sub_title = f"{title} - {heading_text}"
                    suffix = f"_{title_to_filename(heading_text)}"

                frontmatter = make_frontmatter(sub_title, category, phase, [])
                content = frontmatter + "\n" + section_text
                fpath = output_path / f"{base_fname}{suffix}.md"
                fpath.parent.mkdir(parents=True, exist_ok=True)
                fpath.write_text(content, encoding="utf-8")
                saved_files.append(str(fpath))
                print(f"  ✅ 저장: {fpath.name}")

    return saved_files

def title_to_filename(title):
    """제목을 파일명용 문자열로 변환"""
    # 한글은 유지, 특수문자 제거, 공백 → 언더스코어
    fname = re.sub(r'[^\w가-힣\s-]', '', title)
    fname = re.sub(r'\s+', '_', fname.strip())
    return fname[:50] if fname else "untitled"

def make_frontmatter(title, category, phase, tags):
    """YAML 프론트매터 생성"""
    tag_str = ", ".join(tags) if tags else ""
    return f"""---
title: "{title}"
category: "{category}"
phase: "{phase}"
tags: [{tag_str}]
source: "플래너 AI > {category} > {phase}"
---
"""

# ──────────────── 하위 페이지 탐색 ────────────────
def find_child_pages(block_id):
    """블록 내 child_page 타입 블록 찾기"""
    blocks = get_block_children(block_id)
    pages = []
    for b in blocks:
        if b.get("type") == "child_page":
            pages.append({
                "id": b["id"],
                "title": b["child_page"]["title"]
            })
        elif b.get("has_children") and b.get("type") in ("column_list", "column", "paragraph", "toggle", "bulleted_list_item"):
            pages.extend(find_child_pages(b["id"]))
    return pages

# ──────────────── 온보딩 페이지 처리 ────────────────
def extract_onboarding_page(page_id):
    """온보딩 페이지를 토글 섹션별로 분리 저장"""
    print("\n🏃 플래너 온보딩 추출 시작")
    blocks = get_block_children(page_id)
    output_path = OUTPUT_DIR / "planner_onboarding"
    output_path.mkdir(parents=True, exist_ok=True)
    saved_files = []

    for block in blocks:
        if block.get("type") in ("toggle", "heading_1", "heading_2", "heading_3"):
            btype = block["type"]
            rich_text = block[btype].get("rich_text", [])
            title = extract_rich_text(rich_text)
            if not title.strip() or not block.get("has_children"):
                continue

            print(f"  📖 온보딩 섹션: {title}")
            children = get_block_children(block["id"])
            lines = []
            for child in children:
                child_lines = block_to_markdown(child)
                lines.extend(child_lines)

            full_text = "\n".join(lines)
            full_text = optimize_text(full_text)

            if not full_text.strip():
                continue

            fname = title_to_filename(title)
            frontmatter = make_frontmatter(
                f"플래너 온보딩 - {title}",
                "온보딩", "온보딩", []
            )
            content = frontmatter + "\n" + full_text
            fpath = output_path / f"{fname}.md"
            fpath.write_text(content, encoding="utf-8")
            saved_files.append(str(fpath))
            print(f"  ✅ 저장: {fpath.name}")

    return saved_files

# ──────────────── 실행 ────────────────
def main():
    if not NOTION_TOKEN:
        print("❌ NOTION_TOKEN 환경 변수를 설정하세요.")
        print("   set NOTION_TOKEN=ntn_xxxxxxxxxxxx")
        return

    print("=" * 60)
    print("노션 → LLM 최적화 Markdown 변환기")
    print("=" * 60)

    all_saved = []

    # ─── 플래너 AI: 기본편 착공 이전 ───
    print("\n📘 [기본편] 착공 이전")
    # 착공 이전 컬럼 paragraph 블록
    pre_pages = find_child_pages("2ed62ade-d336-8135-ac39-da8e1e84cb0f")
    for p in pre_pages:
        files = save_page_as_md(p["id"], "기본편", "착공 이전", "planner_ai/basics_pre")
        all_saved.extend(files)

    # ─── 플래너 AI: 기본편 시공 중 ───
    print("\n📘 [기본편] 인테리어 시공 중")
    during_pages = find_child_pages("2ed62ade-d336-81b6-b761-e1a0a39c1bc9")
    for p in during_pages:
        files = save_page_as_md(p["id"], "기본편", "인테리어 시공 중", "planner_ai/basics_during")
        all_saved.extend(files)

    # ─── 플래너 AI: 기본편 개설신고 이후 ───
    print("\n📘 [기본편] 개설신고 접수 이후")
    post_pages = find_child_pages("2ed62ade-d336-811a-83a5-cebb908a58d1")
    for p in post_pages:
        files = save_page_as_md(p["id"], "기본편", "개설신고 접수 이후", "planner_ai/basics_post")
        all_saved.extend(files)

    # ─── 플래너 AI: 파트너사 전반부 ───
    print("\n📘 [파트너사] 전반부")
    # 전반부 heading_2 블록 ID: 2ed62ade-d336-80ad-9e55-dd10ae9dfce9
    pre_partner_pages = find_child_pages("2ed62ade-d336-80ad-9e55-dd10ae9dfce9")
    for p in pre_partner_pages:
        files = save_page_as_md(p["id"], "파트너사", "전반부", "planner_ai/partners_pre")
        all_saved.extend(files)

    # ─── 플래너 AI: 파트너사 중후반부 ───
    print("\n📘 [파트너사] 중후반부")
    # 중후반부 heading_2 블록 ID: 2ed62ade-d336-80a3-b5af-ceec858f5efb
    mid_partner_pages = find_child_pages("2ed62ade-d336-80a3-b5af-ceec858f5efb")
    for p in mid_partner_pages:
        files = save_page_as_md(p["id"], "파트너사", "중후반부", "planner_ai/partners_mid")
        all_saved.extend(files)

    # ─── 플래너 AI: 심화편 ───
    print("\n📘 [심화편]")
    # 심화편 heading_2 블록 ID: 2ed62ade-d336-80f3-b83e-e7ffdf2e5e4e
    adv_pages = find_child_pages("2ed62ade-d336-80f3-b83e-e7ffdf2e5e4e")
    for p in adv_pages:
        files = save_page_as_md(p["id"], "심화편", "심화", "planner_ai/advanced")
        all_saved.extend(files)

    # ─── 플래너 온보딩 ───
    onboarding_files = extract_onboarding_page(PLANNER_ONBOARDING_PAGE)
    all_saved.extend(onboarding_files)

    # ─── 결과 요약 ───
    print("\n" + "=" * 60)
    print(f"✅ 완료! 총 {len(all_saved)}개 파일 생성")
    for f in all_saved:
        print(f"   {f}")
    print("=" * 60)

if __name__ == "__main__":
    main()
