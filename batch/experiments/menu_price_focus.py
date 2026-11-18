# 실험 (11/18, OL-77): 상권 "메뉴별로 가격은 못 붙여?" → "테스트해 줘"
# 1) 같은 30곳에 지금 질문(운영 중) vs '가격이 알려진 메뉴 · 점심 세트를 먼저' 질문을 Gemini에 직접 물어 비교
#    → 가격 붙은 메뉴 수, 가격 붙은 가게 수, 점심 메뉴 비율, 두 질문의 메뉴가 얼마나 같은지(대표성)
# 2) 가게 글 원문이 숨겨지는 가게 수 (AI가 읽은 글과 오늘 글이 달라서 원문을 숨김) · 원문이 비어 있는 가게 수 (DB 읽기만)
# 공개 기록이라 숫자 · 영어 상태값만 출력 (가게 이름 · 메뉴 · 가격 글은 출력 · 저장 안 함)
import json
import os
import random
import re
import time
import urllib.error
import urllib.request

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_KEY = os.environ["GEMINI_API_KEY"]
MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
SB = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
UNDER = "or=(typical_lunch_price.lte.{n},and(typical_lunch_price.is.null,lunch_price_max.lte.{n}))"

HEAD = """Find this restaurant on Google Maps.
Name: {name}
Location: near latitude {lat}, longitude {lng} (Osaka, Japan)

Answer in exactly these 5 lines and nothing else. Write the MENU, PRICE and BASIS values in Korean (ko).
STATUS: Exactly one of these English words. OPEN: serves lunch on weekdays. NO_LUNCH: in business but not for weekday lunch. PERMANENTLY_CLOSED: only if Google Maps marks the place as permanently closed. UNKNOWN. Ignore whether it is open right now or today.
KIND: LUNCH if the dishes in MENU are known to be served at weekday lunch (lunch sets, lunch menu), otherwise ALL
"""
TAIL = """PRICE: LUNCH followed by the weekday lunch price range in yen as digits (for example: LUNCH 800-1200). If there is no basis for lunch, ALL followed by the overall price range (for example: ALL 1000-3000). UNKNOWN if neither
BASIS: what you looked at (reviews, menu info, place info)
Do not make anything up.
"""
# 지금 운영 중인 질문 (MenuHintClient.PROMPT, 11/17 OL-74)
NOW = HEAD + """MENU: 2-3 dishes separated by " · ". Each dish: its name, its Japanese name in parentheses, then its price in yen as digits only if known (for example: 라멘 (ラーメン) 900). Prefer dishes served at weekday lunch; if unknown, the restaurant's signature dishes. UNKNOWN if there is no basis
""" + TAIL
# 가격이 알려진 메뉴 · 점심 세트를 먼저
PRICED = HEAD + """MENU: 2-3 dishes separated by " · ". Choose first the dishes whose price appears in Google Maps reviews or menu information, preferring weekday lunch sets; then other weekday lunch dishes; if lunch is unknown, the restaurant's signature dishes. Each dish: its name, its Japanese name in parentheses, then its price in yen as digits only if known (for example: 라멘 (ラーメン) 900). UNKNOWN if there is no basis
""" + TAIL


def get(path):
    with urllib.request.urlopen(urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB), timeout=60) as r:
        return json.loads(r.read())


def read_all(path):
    rows = []
    for offset in range(0, 20000, 1000):
        page = get(f"{path}&limit=1000&offset={offset}")
        rows += page
        if len(page) < 1000:
            return rows
    return rows


def thirty():
    """menu_hit_test.py · price_and_shops.py와 같은 30곳"""
    rows = read_all(f"shop_ai?select=shop_id,lunch_days,shops(name,lat,lng)&{UNDER.format(n=990)}&error=is.null&order=shop_id")
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
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            out = json.loads(r.read())
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
        return None
    ms = round((time.monotonic() - started) * 1000)
    cand = (out.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought"))
    lines = {}
    for raw in text.splitlines():
        line = re.sub(r"^[*\-•\s]+", "", raw.strip()).replace("**", "")
        head = line.split(":", 1)[0].strip().upper()
        if ":" in line and head in ("KIND", "MENU"):
            lines[head] = line.split(":", 1)[1].strip()
    menu = lines.get("MENU", "")
    dishes = [] if not menu or menu.upper().startswith("UNKNOWN") else [d for d in re.split(r"\s*·\s*", menu) if d.strip()][:3]
    priced = [d for d in dishes if re.search(r"[)）]\s*[¥￥]?\s*\d[\d,]{1,5}\s*(엔|円|yen)?\s*$", d)]
    ja = {re.sub(r"\s", "", j) for d in dishes for j in re.findall(r"[（(]([^()（）]+)[)）]", d)}
    grounded = bool((cand.get("groundingMetadata") or {}).get("groundingChunks"))
    return {"grounded": grounded, "dishes": len(dishes), "priced": len(priced), "ja": ja, "ms": ms,
            "lunch": lines.get("KIND", "").upper().startswith("LUNCH")}


def part1():
    print(f"\n===== 1) 같은 30곳: 지금 질문 vs 가격 아는 메뉴 먼저 (모델 {MODEL}) =====")
    nows, pris, same = [], [], []
    for i, s in enumerate(thirty(), 1):
        a = ask(NOW, s)
        time.sleep(1.5)
        b = ask(PRICED, s)
        time.sleep(1.5)
        nows.append(a)
        pris.append(b)
        overlap = len(a["ja"] & b["ja"]) if a and b else 0
        if a and b and a["dishes"] and b["dishes"]:
            same.append(overlap)
        f = lambda x: "ERR" if not x else f"{'지도' if x['grounded'] else '지도X'} 메뉴{x['dishes']} 가격{x['priced']} {'점심' if x['lunch'] else '대표'}"
        print(f"{i:2d} 지금[{f(a)}]  새[{f(b)}]  같은메뉴={overlap}")

    def summary(name, xs):
        ok = [x for x in xs if x and x["grounded"]]
        print(f"{name}: 지도로 찾음 {len(ok)}/30 · 메뉴 있음 {sum(x['dishes'] > 0 for x in ok)} · 점심 메뉴 {sum(x['lunch'] and x['dishes'] > 0 for x in ok)}"
              f" · 메뉴 {sum(x['dishes'] for x in ok)}개 중 가격 붙음 {sum(x['priced'] for x in ok)}개"
              f" · 가격 하나라도 붙은 가게 {sum(x['priced'] > 0 for x in ok)}곳"
              f" · 걸린 시간 중간 {sorted(x['ms'] for x in ok)[len(ok) // 2] if ok else 0}ms")

    print("\n--- 요약 ---")
    summary("지금 질문", nows)
    summary("새 질문", pris)
    if same:
        print(f"두 질문 모두 메뉴가 나온 {len(same)}곳: 메뉴가 하나라도 같은 곳 {sum(x > 0 for x in same)} · 평균 같은 메뉴 {sum(same) / len(same):.1f}개")


def part2():
    print("\n===== 2) 가게 글 원문이 숨겨지는 가게 (DB) =====")
    for label, filt in (("1,190엔 이하 (앱에 나오는 가게)", UNDER.format(n=1190)), ("가격 모르는 가게", "typical_lunch_price=is.null&lunch_price_max=is.null")):
        rows = read_all(f"shop_ai?select=shop_id,text_hash,price_evidence,processed_at,shops(text_hash)&{filt}&error=is.null&order=shop_id")
        rows = [r for r in rows if r["shops"]]
        stale = [r for r in rows if r["text_hash"] != r["shops"]["text_hash"]]
        empty = [r for r in rows if not (r["price_evidence"] or "").strip()]
        print(f"{label}: {len(rows)}곳 · AI가 읽은 뒤 가게 글이 바뀜(원문 숨김) {len(stale)} · 원문 비어 있음 {len(empty)}"
              f" · 앱에 원문이 보이는 곳 {sum(1 for r in rows if r['text_hash'] == r['shops']['text_hash'] and (r['price_evidence'] or '').strip())}")
        if stale:
            days = sorted(r["processed_at"][:10] for r in stale if r.get("processed_at"))
            if days:
                print(f"  원문 숨김 가게의 AI 처리 날짜: 가장 오래된 {days[0]} · 가장 최근 {days[-1]}")


if __name__ == "__main__":
    part2()
    part1()
