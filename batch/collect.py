#!/usr/bin/env python3
"""
핫페퍼 점심 가게 수집 배치

하루 한 번 GitHub Actions에서 돌아요.
  1. AREAS(핫페퍼 중지역 코드)마다 '점심 있음' 가게를 전부 받아요
  2. Supabase shops 테이블에 넣거나 갱신해요 (가게 id 기준)
  3. 이번에 안 보인 가게는 지워요 (핫페퍼 약관: 캐시는 24시간 안에 갱신)

환경 변수 (값은 저장소에 올리지 않기)
  HOTPEPPER_API_KEY            핫페퍼 API 키
  SUPABASE_URL                 https://프로젝트.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    배치 전용 키. 화면 코드에는 절대 넣지 않기

사용법
  python3 batch/collect.py --list-areas   # 오사카 중지역 코드 목록 (핫페퍼 키만 필요)
  python3 batch/collect.py --count-areas  # 중지역마다 점심 가게 수 · 처음 AI 비용 (핫페퍼 키만 필요)
  python3 batch/collect.py --dry-run      # 받기만 하고 저장하지 않음 (핫페퍼 키만 필요)
  python3 batch/collect.py                # 받기 + 저장 + 오래된 가게 삭제
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

HOTPEPPER = "https://webservice.recruit.co.jp/hotpepper"
# 수집할 중지역 코드 (오사카 시내 전체). --list-areas · --count-areas 결과를 보고 채움
# 10/22 결정: 시내 중심 6곳 → 시내 전체 (신오사카 · 덴노지 · 쓰루하시 · 나가이 · 세키메 · 시내 기타 추가, 약 1,350곳)
AREAS = ["Y300", "Y301", "Y305", "Y310", "Y315", "Y866",
         "Y360", "Y325", "Y326", "Y327", "Y328", "Y329"]
CHUNK = 500            # Supabase에 한 번에 보내는 줄 수
AI_COST_PER_SHOP = 0.006  # 가게 1곳 처음 AI 처리 비용 (달러, 10/19 전체 실행 기준 약 0.6센트)
MIN_KEEP_RATIO = 0.5   # 이번에 받은 수가 기존의 절반도 안 되면 API 이상으로 보고 삭제하지 않음
# AI가 읽을 글. 이 글이 바뀐 가게만 AI를 다시 돌리려고 해시를 저장함
AI_TEXT_FIELDS = ["open_text", "close_text", "budget_name", "budget_average", "budget_memo",
                  "catch", "genre_catch", "shop_detail_memo", "other_memo"]


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"환경 변수 {name} 를 먼저 설정해 주세요.")
    return value


def hotpepper(path, key, **params):
    url = f"{HOTPEPPER}/{path}/v1/?" + urllib.parse.urlencode({"key": key, "format": "json", **params})
    for attempt in range(3):  # 네트워크가 잠깐 끊기는 경우만 다시 시도
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                results = json.loads(r.read().decode("utf-8")).get("results", {})
            break
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt == 2:
                sys.exit(f"핫페퍼 API에 연결하지 못했어요: {e}")
            time.sleep(3)
    if "error" in results:
        sys.exit(f"핫페퍼 API 오류: {results['error']}")
    return results


def list_areas(key):
    for large in hotpepper("large_area", key, keyword="大阪").get("large_area", []):
        print(f"\n[{large['code']}] {large['name']}")
        for middle in hotpepper("middle_area", key, large_area=large["code"]).get("middle_area", []):
            print(f"  {middle['code']}  {middle['name']}")


def count_areas(key):
    # 수집 지역 넓히기 결정용 (10/23): 중지역마다 점심 가게 수만 세고(1곳만 받음) 처음 AI 비용을 어림함
    for large in hotpepper("large_area", key, keyword="大阪").get("large_area", []):
        print(f"\n[{large['code']}] {large['name']}")
        for middle in hotpepper("middle_area", key, large_area=large["code"]).get("middle_area", []):
            n = int(hotpepper("gourmet", key, middle_area=middle["code"], lunch=1, count=1).get("results_available", 0))
            mark = " (수집 중)" if middle["code"] in AREAS else ""
            print(f"  {middle['code']}  {n:5d}곳  약 ${n * AI_COST_PER_SHOP:5.1f}  {middle['name']}{mark}")
            time.sleep(0.5)


def fetch_area(key, code):
    shops, start, available = [], 1, 0
    while True:
        res = hotpepper("gourmet", key, middle_area=code, lunch=1, count=100, start=start)
        page = res.get("shop", [])
        available = int(res.get("results_available", 0))
        shops += page
        start += len(page)
        if not page or start > available:
            break
        time.sleep(0.5)
    if len(shops) < available:
        print(f"  주의: [{code}] {available}곳 중 {len(shops)}곳만 받았어요")
    return shops


def to_row(shop, fetched_at):
    genre = shop.get("genre") or {}
    budget = shop.get("budget") or {}
    row = {
        "id": shop["id"],
        "name": shop.get("name") or "",
        "address": shop.get("address") or "",
        "lat": float(shop["lat"]) if shop.get("lat") else None,
        "lng": float(shop["lng"]) if shop.get("lng") else None,
        "genre_name": genre.get("name") or "",
        "genre_catch": genre.get("catch") or "",
        "catch": shop.get("catch") or "",
        "budget_name": budget.get("name") or "",
        "budget_average": budget.get("average") or "",
        "budget_memo": shop.get("budget_memo") or "",
        "open_text": shop.get("open") or "",
        "close_text": shop.get("close") or "",
        "shop_detail_memo": shop.get("shop_detail_memo") or "",
        "other_memo": shop.get("other_memo") or "",
        "photo_url": ((shop.get("photo") or {}).get("pc") or {}).get("l") or "",
        "hotpepper_url": (shop.get("urls") or {}).get("pc") or "",
        "middle_area_code": (shop.get("middle_area") or {}).get("code") or "",
        "fetched_at": fetched_at,
    }
    texts = json.dumps([row[f] for f in AI_TEXT_FIELDS], ensure_ascii=False)
    row["text_hash"] = hashlib.sha256(texts.encode("utf-8")).hexdigest()
    return row


def supabase(method, path, body=None, prefer=""):
    url = env("SUPABASE_URL").rstrip("/") + "/rest/v1/" + path
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.headers
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase {method} {path.split('?')[0]} 실패: {e.code} {e.read().decode('utf-8')[:300]}")


def count_shops():
    headers = supabase("GET", "shops?select=id&limit=1", prefer="count=exact")
    return int(headers.get("Content-Range", "*/0").split("/")[-1])


def main():
    ap = argparse.ArgumentParser(description="핫페퍼 점심 가게 수집 배치")
    ap.add_argument("--list-areas", action="store_true", help="오사카 중지역 코드 목록 보기")
    ap.add_argument("--count-areas", action="store_true", help="중지역마다 점심 가게 수 · 처음 AI 비용 보기")
    ap.add_argument("--dry-run", action="store_true", help="받기만 하고 저장하지 않음")
    args = ap.parse_args()

    key = env("HOTPEPPER_API_KEY")
    if args.list_areas:
        list_areas(key)
        return
    if args.count_areas:
        count_areas(key)
        return
    if not AREAS:
        sys.exit("AREAS가 비어 있어요. --list-areas 로 코드를 확인해 채워 주세요.")

    run_start = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0).isoformat()
    rows = {}
    for code in AREAS:
        shops = fetch_area(key, code)
        for shop in shops:
            rows[shop["id"]] = to_row(shop, run_start)
        print(f"[{code}] {len(shops)}곳")
    rows = list(rows.values())
    print(f"합계 (중복 제외) {len(rows)}곳")
    if args.dry_run:
        return

    before = count_shops()
    for i in range(0, len(rows), CHUNK):
        supabase("POST", "shops?on_conflict=id", rows[i:i + CHUNK],
                 prefer="resolution=merge-duplicates,return=minimal")
    if before and len(rows) < before * MIN_KEEP_RATIO:
        sys.exit(f"이번에 받은 가게({len(rows)}곳)가 기존({before}곳)의 절반도 안 돼요. "
                 f"API 이상일 수 있어서 오래된 가게를 지우지 않고 멈춰요.")
    supabase("DELETE", "shops?fetched_at=lt." + urllib.parse.quote(run_start), prefer="return=minimal")
    print(f"저장 완료: {len(rows)}곳 (이전 {before}곳, 이번에 안 보인 가게는 삭제)")


if __name__ == "__main__":
    main()
