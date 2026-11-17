# 실험 (11/17, OL-73): 상권 "가격이 정확히 안 적혀 있어서 결국 구글로 들어가서 보게 돼" · "폐업 사업장이 너무 많은데" · "가게 수를 좀 더 늘리고 싶은데"
# 1) 같은 30곳에 옛 질문 vs 새 질문(폐업은 구글 지도에 폐업으로 표시된 경우만 · 메뉴별 가격 · 점심 가격대)을 Gemini에 직접 물음
#    → 폐업 답 수, 메뉴별 가격이 붙는 비율, 점심 가격대가 오는 비율, 핫페퍼 AI 가격과 얼마나 다른지
# 2) 가게 수가 단계마다 몇 곳 빠지는지 (DB 읽기만)
# 3) 핫페퍼: 수집 중인 지역의 '점심 있음' 아닌 가게 수, 오사카 다른 지역의 점심 가게 수
# 공개 기록이라 숫자 · 영어 상태값 · 핫페퍼 지역 이름만 출력 (가게 이름 · 메뉴 · 가격 글은 출력 · 저장 안 함)
import json
import os
import random
import re
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_KEY = os.environ["GEMINI_API_KEY"]
HP_KEY = os.environ["HOTPEPPER_API_KEY"]
MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
SB = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
UNDER = "or=(typical_lunch_price.lte.{n},and(typical_lunch_price.is.null,lunch_price_max.lte.{n}))"
COLLECTED = ["Y300", "Y301", "Y305", "Y310", "Y315", "Y866", "Y360", "Y325", "Y326", "Y327", "Y328", "Y329"]

HEAD = """Find this restaurant on Google Maps.
Name: {name}
Location: near latitude {lat}, longitude {lng} (Osaka, Japan)

Answer in exactly these 5 lines and nothing else. Write the MENU, PRICE and BASIS values in Korean (ko).
"""
OLD = HEAD + """STATUS: is it open for lunch on weekdays? Exactly one of these English words: OPEN, NO_LUNCH, CLOSED (permanently closed), UNKNOWN
KIND: LUNCH if the dishes in MENU are known to be served at weekday lunch (lunch sets, lunch menu), otherwise ALL
MENU: 2-3 dishes, each followed by its Japanese name in parentheses, separated by " · ". Prefer dishes served at weekday lunch; if unknown, the restaurant's signature dishes. UNKNOWN if there is no basis
PRICE: lunch price range in yen. If there is no basis for lunch, the overall price range of the place. UNKNOWN if neither
BASIS: what you looked at (reviews, menu info, place info)
Do not make anything up.
"""
NEW = HEAD + """STATUS: Exactly one of these English words. OPEN: serves lunch on weekdays. NO_LUNCH: in business but not for weekday lunch. PERMANENTLY_CLOSED: only if Google Maps marks the place as permanently closed. UNKNOWN. Ignore whether it is open right now or today.
KIND: LUNCH if the dishes in MENU are known to be served at weekday lunch (lunch sets, lunch menu), otherwise ALL
MENU: 2-3 dishes separated by " · ". Each dish: its name, its Japanese name in parentheses, then its price in yen as digits only if known (for example: 라멘 (ラーメン) 900). Prefer dishes served at weekday lunch; if unknown, the restaurant's signature dishes. UNKNOWN if there is no basis
PRICE: LUNCH followed by the weekday lunch price range in yen as digits (for example: LUNCH 800-1200). If there is no basis for lunch, ALL followed by the overall price range (for example: ALL 1000-3000). UNKNOWN if neither
BASIS: what you looked at (reviews, menu info, place info)
Do not make anything up.
"""


def get(path):
    with urllib.request.urlopen(urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB), timeout=30) as r:
        return json.loads(r.read())


def count(path):
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", headers={**SB, "Prefer": "count=exact", "Range": "0-0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return int(r.headers.get("Content-Range", "*/0").split("/")[-1])


def hotpepper(path, **params):
    url = f"https://webservice.recruit.co.jp/hotpepper/{path}/v1/?" + urllib.parse.urlencode({"key": HP_KEY, "format": "json", **params})
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.loads(r.read().decode("utf-8")).get("results", {})


def thirty():
    """menu_hit_test.py와 같은 30곳 (+ 핫페퍼 AI 가격)"""
    rows = []
    for offset in range(0, 10000, 1000):
        page = get(f"shop_ai?select=shop_id,lunch_days,typical_lunch_price,lunch_price_max,shops(name,lat,lng)&{UNDER.format(n=990)}"
                   f"&error=is.null&order=shop_id&limit=1000&offset={offset}")
        rows += page
        if len(page) < 1000:
            break
    ok = [r for r in rows if r["shops"] and r["shops"]["lat"] and r["shops"]["lng"]
          and 34.4 < r["shops"]["lat"] < 34.9 and 135.2 < r["shops"]["lng"] < 135.7 and (r["lunch_days"] or "")[1:2] == "O"]
    by_id = {r["shop_id"]: r for r in ok}
    return [by_id[i] for i in random.Random(1117).sample([r["shop_id"] for r in ok], 30)]


def ask(prompt, s):
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt.format(name=s["shops"]["name"], lat=s["shops"]["lat"], lng=s["shops"]["lng"])}]}],
        "tools": [{"googleMaps": {}}],
        "toolConfig": {"retrievalConfig": {"latLng": {"latitude": s["shops"]["lat"], "longitude": s["shops"]["lng"]}}},
        "generationConfig": {"maxOutputTokens": 400, "thinkingConfig": {"thinkingLevel": "low"}},
    }
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), method="POST",
                                 headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            out = json.loads(r.read())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None
    cand = (out.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought"))
    lines = {}
    for raw in text.splitlines():
        line = re.sub(r"^[*\-•\s]+", "", raw.strip()).replace("**", "")
        head = line.split(":", 1)[0].strip().upper()
        if ":" in line and head in ("STATUS", "MENU", "PRICE"):
            lines[head] = line.split(":", 1)[1].strip()
    menu = lines.get("MENU", "")
    dishes = [] if not menu or menu.upper().startswith("UNKNOWN") else [d for d in re.split(r"\s*·\s*", menu) if d.strip()][:3]
    priced = [d for d in dishes if re.search(r"[)）]\s*[¥￥]?\s*\d[\d,]{1,5}\s*(엔|円|yen)?\s*$", d)]
    price = lines.get("PRICE", "")
    m = re.match(r"(LUNCH|ALL)\s*[:：]?\s*[¥￥]?\s*(\d[\d,]*)\s*(?:엔|円)?\s*(?:[-~〜–]\s*[¥￥]?\s*(\d[\d,]*))?", price.upper())
    lo = hi = None
    if m:
        lo = int(m.group(2).replace(",", ""))
        hi = int(m.group(3).replace(",", "")) if m.group(3) else lo
    grounded = bool((cand.get("groundingMetadata") or {}).get("groundingChunks"))
    return {"status": (lines.get("STATUS", "-").split() or ["-"])[0].upper().strip(".,"), "grounded": grounded,
            "dishes": len(dishes), "priced": len(priced), "price_kind": m.group(1) if m else ("UNKNOWN" if price.upper().startswith("UNKNOWN") else "-"),
            "lo": lo, "hi": hi}


def part1():
    print(f"\n===== 1) 같은 30곳: 옛 질문 vs 새 질문 (모델 {MODEL}) =====")
    olds, news, diffs = [], [], []
    for i, s in enumerate(thirty(), 1):
        o = ask(OLD, s)
        time.sleep(1.5)
        n = ask(NEW, s)
        time.sleep(1.5)
        olds.append(o)
        news.append(n)
        hp = s["typical_lunch_price"] or s["lunch_price_max"]
        gap = ""
        if n and n["lo"] and hp and n["price_kind"] == "LUNCH":
            mid = (n["lo"] + n["hi"]) / 2
            diffs.append(mid - hp)
            gap = f" 구글점심가운데-핫페퍼={round(mid - hp):+d}"
        print(f"{i:2d} 옛={o['status'] if o else 'ERR'}{'' if not o or o['grounded'] else '(지도X)'}"
              f" 새={n['status'] if n else 'ERR'}{'' if not n or n['grounded'] else '(지도X)'}"
              f" 메뉴={n['dishes'] if n else 0} 가격붙은메뉴={n['priced'] if n else 0} 가격줄={n['price_kind'] if n else '-'}{gap}")
    ok_o = [x for x in olds if x]
    ok_n = [x for x in news if x]
    g = [x for x in ok_n if x["grounded"]]
    print("\n--- 요약 ---")
    print(f"폐업 답: 옛 질문 {sum('CLOSED' in x['status'] for x in ok_o)}곳 / 새 질문 {sum('PERMANENT' in x['status'] for x in ok_n)}곳 (새 질문에서 PERMANENT 없이 CLOSED만: {sum('CLOSED' in x['status'] and 'PERMANENT' not in x['status'] for x in ok_n)})")
    print(f"새 질문 상태값: { {k: sum(x['status'] == k for x in ok_n) for k in sorted({x['status'] for x in ok_n})} }")
    print(f"새 질문 지도로 찾음 {len(g)}/{len(ok_n)} · 그중 메뉴 있음 {sum(x['dishes'] > 0 for x in g)}")
    print(f"메뉴별 가격: 지도로 찾은 답의 메뉴 {sum(x['dishes'] for x in g)}개 중 가격 붙음 {sum(x['priced'] for x in g)}개 · 가격이 하나라도 붙은 가게 {sum(x['priced'] > 0 for x in g)}곳")
    print(f"가격 줄: LUNCH {sum(x['price_kind'] == 'LUNCH' for x in g)} · ALL {sum(x['price_kind'] == 'ALL' for x in g)} · 없음 {sum(x['price_kind'] not in ('LUNCH', 'ALL') for x in g)} (지도로 찾은 답 기준)")
    if diffs:
        print(f"구글 점심 가격대 가운데 - 핫페퍼 AI 가격 ({len(diffs)}곳): 중간 {statistics.median(diffs):+.0f}엔 · 300엔 넘게 차이 {sum(abs(d) > 300 for d in diffs)}곳")


def part2():
    print("\n===== 2) 가게 수가 단계마다 몇 곳 빠지는지 (DB) =====")
    print(f"shops 전체 {count('shops?select=id')} · 좌표 있음 {count('shops?select=id&lat=not.is.null&lng=not.is.null')}")
    print(f"shop_ai 전체 {count('shop_ai?select=shop_id')} · AI 오류 {count('shop_ai?select=shop_id&error=not.is.null')}")
    base = "shop_ai?select=shop_id&error=is.null"
    print(f"AI 정상 {count(base)} · 점심 요일 정보 있음 {count(base + '&lunch_days=not.is.null')}")
    print(f"점심 가격 모름(대표 · 최고가 둘 다 없음) {count(base + '&typical_lunch_price=is.null&lunch_price_max=is.null')}")
    for n in (790, 990, 1190, 1500):
        print(f"{n}엔 이하 {count(base + '&' + UNDER.format(n=n))}")
    print(f"1,190엔 넘음 {count(base + '&or=(typical_lunch_price.gt.1190,and(typical_lunch_price.is.null,lunch_price_max.gt.1190))')}")
    print(f"990엔 이하 중 평일 점심 요일 표시 0개(모두 X 또는 ?) {count(base + '&' + UNDER.format(n=990) + '&lunch_days=not.like.*O*')}")


def part3():
    print("\n===== 3) 핫페퍼 가게 수 =====")
    total_lunch = total_all = 0
    for code in COLLECTED:
        lunch = int(hotpepper("gourmet", middle_area=code, lunch=1, count=1).get("results_available", 0))
        time.sleep(0.4)
        allshops = int(hotpepper("gourmet", middle_area=code, count=1).get("results_available", 0))
        time.sleep(0.4)
        total_lunch += lunch
        total_all += allshops
        print(f"  {code} 점심 있음 {lunch:5d} / 전체 {allshops:5d}")
    print(f"수집 중인 12개 지역: 점심 있음 {total_lunch} / 전체 {total_all} (점심 표시 없는 가게 {total_all - total_lunch})")
    print("\n오사카 다른 지역 (점심 있음)")
    for large in hotpepper("large_area", keyword="大阪").get("large_area", []):
        for middle in hotpepper("middle_area", large_area=large["code"]).get("middle_area", []):
            if middle["code"] in COLLECTED:
                continue
            n = int(hotpepper("gourmet", middle_area=middle["code"], lunch=1, count=1).get("results_available", 0))
            print(f"  [{large['name']}] {middle['code']} {n:5d}곳 {middle['name']}")
            time.sleep(0.4)


if __name__ == "__main__":
    part2()
    part3()
    part1()
