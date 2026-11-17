# 실험 (11/17, OL-68 2차): 30곳 테스트에서 '출처 없는 답' 10곳이 왜 생기는지 진단
# - 서버(MenuHintClient)와 같은 요청을 Gemini에 직접 보내고, 답의 '모양'만 셈 (구글 지도를 찾았는지 · 출처 개수 · 끝난 이유)
# - 출처가 없으면 한 번 더 물어서 살아나는지, 처음 답(출처 없음)의 메뉴가 다시 물은 답(출처 있음)과 같은지 셈
#   → 출처 없는 답을 'AI 추측'으로 보여줘도 되는지 판단 (상권 "구글에서 응답없는건 우리 서버에서 유추해서 보여주는건 별로야?")
# - 가게는 1차와 같은 30곳 (같은 조건 · 같은 무작위 씨앗). 공개 기록이라 숫자 · 필드 이름만 출력, 답 내용은 저장 · 출력 안 함
import json
import os
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
GEMINI_KEY = os.environ["GEMINI_API_KEY"]
MODEL = os.environ.get("GEMINI_MODEL") or "gemini-3.8-flash"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent"
N = 30

# 서버 MenuHintClient.PROMPT와 같은 글
PROMPT = """Find this restaurant on Google Maps.
Name: {name}
Location: near latitude {lat}, longitude {lng} (Osaka, Japan)

Answer in exactly these 5 lines and nothing else. Write the MENU, PRICE and BASIS values in Korean (ko).
STATUS: is it open for lunch on weekdays? Exactly one of these English words: OPEN, NO_LUNCH, CLOSED (permanently closed), UNKNOWN
KIND: LUNCH if the dishes in MENU are known to be served at weekday lunch (lunch sets, lunch menu), otherwise ALL
MENU: 2-3 dishes, each followed by its Japanese name in parentheses, separated by " · ". Prefer dishes served at weekday lunch; if unknown, the restaurant's signature dishes. UNKNOWN if there is no basis
PRICE: lunch price range in yen. If there is no basis for lunch, the overall price range of the place. UNKNOWN if neither
BASIS: what you looked at (reviews, menu info, place info)
Do not make anything up.
"""


def get(url, headers):
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as res:
        return json.loads(res.read())


def shops():
    """1차(menu_hit_test.py)와 같은 30곳"""
    sb = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    under = "or=(typical_lunch_price.lte.990,and(typical_lunch_price.is.null,lunch_price_max.lte.990))"
    rows = []
    for offset in range(0, 10000, 1000):
        page = get(f"{SUPABASE_URL}/rest/v1/shop_ai?select=shop_id,lunch_days,shops(lat,lng)&{under}&error=is.null"
                   f"&order=shop_id&limit=1000&offset={offset}", sb)
        rows += page
        if len(page) < 1000:
            break
    ok = [
        r["shop_id"] for r in rows
        if r["shops"] and r["shops"]["lat"] and r["shops"]["lng"]
        and 34.4 < r["shops"]["lat"] < 34.9 and 135.2 < r["shops"]["lng"] < 135.7
        and (r["lunch_days"] or "")[1:2] == "O"
    ]
    ids = random.Random(1117).sample(ok, N)
    found = {s["id"]: s for s in get(f"{SUPABASE_URL}/rest/v1/shops?select=id,name,lat,lng&id=in.({','.join(ids)})", sb)}
    return [found[i] for i in ids]


def ask(shop):
    body = {
        "contents": [{"role": "user", "parts": [{"text": PROMPT.format(name=shop["name"], lat=shop["lat"], lng=shop["lng"])}]}],
        "tools": [{"googleMaps": {}}],
        "toolConfig": {"retrievalConfig": {"latLng": {"latitude": shop["lat"], "longitude": shop["lng"]}}},
        "generationConfig": {"maxOutputTokens": 400, "thinkingConfig": {"thinkingLevel": "low"}},
    }
    req = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), method="POST",
                                 headers={"x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json"})
    started = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=40) as res:
            out = json.loads(res.read())
            code = res.status
    except urllib.error.HTTPError as e:
        out, code = {}, e.code
    return code, out, round((time.monotonic() - started) * 1000)


def shape(code, out, ms):
    """답 내용 없이 모양만"""
    cand = (out.get("candidates") or [{}])[0]
    meta = cand.get("groundingMetadata") or {}
    chunks = meta.get("groundingChunks") or []
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []) if not p.get("thought"))
    lines = {}
    for raw in text.splitlines():
        line = re.sub(r"^[*\-•\s]+", "", raw.strip()).replace("**", "")
        head = line.split(":", 1)[0].strip().upper()
        if head in ("STATUS", "KIND", "MENU") and ":" in line:
            lines[head] = line.split(":", 1)[1].strip()
    menu = lines.get("MENU", "")
    menus = [] if not menu or menu.upper().startswith("UNKNOWN") else [m for m in re.split(r"\s*·\s*|,\s*|、", menu) if m.strip()][:3]
    sources = [c for c in chunks if (c.get("maps") or {}).get("uri", "").startswith("https://") and (c.get("maps") or {}).get("title")]
    usage = out.get("usageMetadata") or {}
    return {
        "http": code, "ms": ms, "finish": cand.get("finishReason", "-"),
        "meta_keys": sorted(meta.keys()), "chunks": len(chunks),
        "chunk_kinds": sorted({k for c in chunks for k in c.keys()}),
        "maps_no_uri_or_title": sum(1 for c in chunks if "maps" in c) - len(sources),
        "sources": len(sources), "status": lines.get("STATUS", "-").split()[0].upper() if lines.get("STATUS") else "-",
        "menus": len(menus), "ja": {re.sub(r"\s", "", j) for m in menus for j in re.findall(r"[（(]([^()（）]+)[)）]", m)},
        "thoughts": usage.get("thoughtsTokenCount", 0), "out_tokens": usage.get("candidatesTokenCount", 0),
    }


def line(i, tag, s):
    return (f"{i:2d} {tag} http={s['http']} finish={s['finish']} ms={s['ms']} status={s['status']} menus={s['menus']} "
            f"sources={s['sources']} chunks={s['chunks']} kinds={','.join(s['chunk_kinds']) or '-'} "
            f"maps_bad={s['maps_no_uri_or_title']} meta={','.join(s['meta_keys']) or '-'} "
            f"thoughts={s['thoughts']} out={s['out_tokens']}")


def main():
    print(f"모델 {MODEL}")
    first, retry = [], []
    for i, shop in enumerate(shops(), 1):
        s1 = shape(*ask(shop))
        first.append(s1)
        print(line(i, "1차", s1))
        if s1["sources"] == 0:
            time.sleep(2)
            s2 = shape(*ask(shop))
            s2["same"] = len(s1["ja"] & s2["ja"])
            s2["first_menus"] = s1["menus"]
            retry.append(s2)
            print(line(i, "다시", s2) + f" 처음_메뉴와_겹침={s2['same']}/{min(len(s1['ja']), len(s2['ja']))}")
        time.sleep(2)

    no_src = [s for s in first if s["sources"] == 0]
    print("\n===== 요약 =====")
    print(f"1차: 출처 있음 {N - len(no_src)} / 출처 없음 {len(no_src)} / 출처 있고 메뉴 있음 {sum(s['sources'] > 0 and s['menus'] > 0 for s in first)}")
    print(f"출처 없는 답 중: 구글 지도 기록(groundingMetadata) 자체가 없음 {sum(not s['meta_keys'] for s in no_src)}"
          f" / 기록은 있는데 장소 0개 {sum(bool(s['meta_keys']) and s['chunks'] == 0 for s in no_src)}"
          f" / 장소는 있는데 주소 · 이름 빠짐 {sum(s['maps_no_uri_or_title'] > 0 for s in no_src)}")
    print(f"출처 없는 답 중 메뉴를 적은 답 (AI가 지도 없이 쓴 메뉴): {sum(s['menus'] > 0 for s in no_src)}")
    print(f"끝난 이유(1차 전체): { {f: sum(s['finish'] == f for s in first) for f in {s['finish'] for s in first}} }")
    rec = [s for s in retry if s["sources"] > 0 and s["menus"] > 0]
    print(f"다시 물으면: 출처 생김 {sum(s['sources'] > 0 for s in retry)}/{len(retry)} · 출처+메뉴 {len(rec)}/{len(retry)}")
    both = [s for s in retry if s["sources"] > 0 and s["menus"] > 0 and s["first_menus"] > 0]
    print(f"처음(출처 없음) 메뉴 vs 다시(출처 있음) 메뉴 비교 가능 {len(both)}곳: 하나라도 같은 곳 {sum(s['same'] > 0 for s in both)}")
    print(f"다시 묻기를 넣으면 메뉴가 뜨는 곳: {sum(s['sources'] > 0 and s['menus'] > 0 for s in first) + len(rec)}/{N}")
    ms = sorted(s["ms"] for s in retry)
    if ms:
        print(f"다시 묻기에 더 걸린 시간 ms: 중간 {ms[len(ms) // 2]} / 최대 {ms[-1]}")


if __name__ == "__main__":
    main()
