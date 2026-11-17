#!/usr/bin/env python3
"""
실험 (11/17, OL-63): 핫페퍼 가게에 공개 장소 데이터(Overture · OpenStreetMap)의 세부 종류가 얼마나 붙는지 비교

결과 카드에서 '이자카야'처럼 넓은 장르 대신 '라멘집'처럼 무슨 집인지 보여 주려고 (11/17 상권: 앱만으론 뭐 파는지 못 봄).
핫페퍼 · 타베로그 페이지는 약관상 못 긁고, 구글 장소 API는 저장 금지 · 호출 한도가 있어서 파일로 받는 공개 데이터부터 봄.

- DB는 읽기만 하고 아무것도 저장하지 않음
- 공개 저장소의 실행 기록에 남으니 숫자 · 종류 이름만 출력하고, 가게 이름 같은 핫페퍼 정보는 출력하지 않음
  (10/24 리크루트 답: 핫페퍼 정보의 재배포 금지)
- OpenStreetMap 데이터: © OpenStreetMap contributors (ODbL)

환경 변수 (값은 저장소에 올리지 않기)
  SUPABASE_URL                 https://프로젝트.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    배치 전용 키

사용법
  python3 batch/experiments/place_match.py
"""
import collections
import json
import math
import os
import re
import subprocess
import sys
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher

PAGE = 1000          # Supabase에서 한 번에 읽는 줄 수
MAX_DIST_M = 80      # 이 거리 안의 장소만 짝 후보로 봄
CELL = 0.001         # 격자 크기 (약 100m). 주변 9칸이면 80m 안은 다 들어옴
MARGIN = 0.005       # 가게들이 있는 범위에 더하는 여유 (약 500m)
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# 무슨 집인지 알려 주지 않는 핫페퍼 장르 (이 가게들이 세부 종류를 얻는지가 핵심)
BROAD = ["居酒屋", "ダイニングバー・バル", "創作料理", "和食", "洋食", "その他グルメ", "各国料理", "カラオケ・パーティ", "バー・カクテル"]

# 핫페퍼 장르가 이미 구체적인 가게로 짝 맞추기가 맞는지 확인. 붙은 종류 이름에 이 글자가 들어 있으면 일치로 봄
CHECK = {
    "ラーメン": ["ramen", "noodle"],
    "焼肉・ホルモン": ["yakiniku", "barbecue", "bbq", "korean", "meat", "grill", "horumon", "steak"],
    "韓国料理": ["korean"],
    "中華": ["chinese", "dim_sum", "dumpling", "gyoza", "szechuan", "cantonese", "taiwanese"],
    "お好み焼き・もんじゃ": ["okonomiyaki", "teppanyaki", "takoyaki", "monja"],
    "カフェ・スイーツ": ["cafe", "coffee", "bakery", "dessert", "sweet", "tea", "pancake", "patisserie", "cake", "ice_cream"],
    "イタリアン・フレンチ": ["italian", "french", "pizza", "pasta", "bistro", "european", "mediterranean", "spanish"],
}

# 붙어도 무슨 음식인지는 모르는 종류 (예: 그냥 '음식점', '일식당', '술집')
GENERIC_OVERTURE = {
    "", "restaurant", "japanese_restaurant", "asian_restaurant", "eat_and_drink", "food", "food_and_drink",
    "bar", "pub", "izakaya", "lounge", "cocktail_bar", "wine_bar", "beer_bar", "sake_bar", "night_club",
    "karaoke", "buffet_restaurant", "fast_food_restaurant", "family_style_restaurant", "diner",
}
GENERIC_OSM = {"", "japanese", "regional", "asian", "international", "local", "fusion"}

STRIP = re.compile(r"[\s　・･·\-‐－_~〜～.,、。!！?？'’\"“”()（）\[\]【】「」『』/／&＆+＋:：#＃*＊]")


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"환경 변수 {name} 를 먼저 설정해 주세요.")
    return value


def supabase_get(path):
    url = env("SUPABASE_URL").rstrip("/") + "/rest/v1/" + path
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase 읽기 실패: {e.code} {e.read().decode('utf-8')[:300]}")


def read_shops():
    rows, offset = [], 0
    while True:
        page = supabase_get(f"shops?select=id,name,genre_name,lat,lng&order=id&limit={PAGE}&offset={offset}")
        rows += page
        offset += len(page)
        if len(page) < PAGE:
            return [r for r in rows if r.get("lat") is not None and r.get("lng") is not None]


def norm(s):
    s = unicodedata.normalize("NFKC", s or "").lower()
    return STRIP.sub("", s)


def similarity(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    score = SequenceMatcher(None, a, b).ratio()
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if len(short) >= 3 and short in long_:  # '○○ 梅田店'과 '○○'처럼 지점 이름만 다른 경우
        score = max(score, 0.85)
    return score


def distance_m(lat1, lng1, lat2, lng2):
    r = math.radians
    h = math.sin(r(lat2 - lat1) / 2) ** 2 + math.cos(r(lat1)) * math.cos(r(lat2)) * math.sin(r(lng2 - lng1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def cell(lat, lng):
    return (int(lat // CELL), int(lng // CELL))


def build_grid(places):
    grid = collections.defaultdict(list)
    for p in places:
        grid[cell(p["lat"], p["lng"])].append(p)
    return grid


def best_match(shop, grid):
    """같은 가게로 보이는 장소 하나 (없으면 None). 이름이 많이 비슷하거나, 아주 가깝고 꽤 비슷하면 짝으로 봄"""
    ci, cj = cell(shop["lat"], shop["lng"])
    best = None
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for p in grid.get((ci + di, cj + dj), []):
                d = distance_m(shop["lat"], shop["lng"], p["lat"], p["lng"])
                if d > MAX_DIST_M:
                    continue
                s = max(similarity(shop["name"], n) for n in p["names"]) if p["names"] else 0.0
                if best is None or (s, -d) > (best[0], -best[1]):
                    best = (s, d, p)
    if best and (best[0] >= 0.6 or (best[0] >= 0.5 and best[1] <= 30)):
        return best
    return None


def as_obj(v):
    if isinstance(v, str) and v[:1] in "{[":
        try:
            return json.loads(v)
        except ValueError:
            return v
    return v


def overture_category(props):
    """세부 종류 하나. 2026년 9월부터 categories 대신 taxonomy · basic_category를 씀 (Overture 안내)"""
    tax = as_obj(props.get("taxonomy"))
    if isinstance(tax, dict):
        if tax.get("primary"):
            return str(tax["primary"])
        hier = tax.get("hierarchy")
        if isinstance(hier, list) and hier:
            return str(hier[-1])
    cats = as_obj(props.get("categories"))
    if isinstance(cats, dict) and cats.get("primary"):
        return str(cats["primary"])
    return str(props.get("basic_category") or "")


def overture_names(props):
    names = as_obj(props.get("names"))
    out = []
    if isinstance(names, dict):
        if names.get("primary"):
            out.append(str(names["primary"]))
        common = as_obj(names.get("common"))
        if isinstance(common, dict):
            out += [str(v) for v in common.values() if v]
        elif isinstance(common, list):
            out += [str(x.get("value")) for x in common if isinstance(x, dict) and x.get("value")]
    return out


def load_overture(bbox):
    w, s, e, n = bbox
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "places.geojsonseq")
        cmd = ["overturemaps", "download", f"--bbox={w},{s},{e},{n}", "-f", "geojsonseq", "--type=place", "-o", path]
        done = subprocess.run(cmd, capture_output=True, text=True)
        if done.returncode != 0:
            print(f"Overture 받기 실패: {done.stderr[-500:]}")
            return None, []
        places, keys = [], None
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip().lstrip("\x1e")
                if not line:
                    continue
                feat = json.loads(line)
                props = feat.get("properties") or {}
                if keys is None:
                    keys = sorted(props.keys())
                geom = feat.get("geometry") or {}
                if geom.get("type") != "Point":
                    continue
                lng, lat = geom["coordinates"][:2]
                places.append({"lat": lat, "lng": lng, "names": overture_names(props), "cat": overture_category(props)})
        return keys, places


def load_osm(bbox):
    w, s, e, n = bbox
    query = (f'[out:json][timeout:180];nwr["amenity"~"^(restaurant|fast_food|cafe|food_court|pub|bar)$"]'
             f"({s},{w},{n},{e});out center tags;")
    data = urllib.parse.urlencode({"data": query}).encode()
    headers = {"User-Agent": "osaka-lunch-app place-match experiment (github.com/bettsLee/osaka_lunch_app)"}
    for url in OVERPASS:
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers), timeout=240) as r:
                elements = json.loads(r.read().decode("utf-8")).get("elements", [])
            break
        except (urllib.error.URLError, TimeoutError, ValueError) as err:
            print(f"OpenStreetMap 받기 실패 ({url.split('/')[2]}): {err}")
    else:
        return []
    places = []
    for el in elements:
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        tags = el.get("tags") or {}
        if lat is None or lng is None:
            continue
        names = [tags[k] for k in ("name", "name:ja", "name:en", "alt_name", "brand") if tags.get(k)]
        cuisines = [c.strip().lower() for c in (tags.get("cuisine") or "").split(";") if c.strip()]
        places.append({"lat": lat, "lng": lng, "names": names, "cat": ";".join(cuisines)})
    return places


def is_specific(source, cat):
    if source == "Overture":
        return cat not in GENERIC_OVERTURE
    return any(c not in GENERIC_OSM for c in cat.split(";"))


def pct(a, b):
    return f"{a / b * 100:.0f}%" if b else "-"


def report(shops, results, lines):
    """results: {출처: {가게 id: (유사도, 거리, 장소)}}"""
    total = len(shops)
    by_genre = collections.Counter(s["genre_name"] or "" for s in shops)
    broad = [s for s in shops if s["genre_name"] in BROAD]

    lines.append("## 1. 짝이 맞은 가게")
    lines.append("| 출처 | 짝 맞음 | 비율 |")
    lines.append("| --- | --- | --- |")
    for src, res in results.items():
        lines.append(f"| {src} | {len(res)} / {total} | {pct(len(res), total)} |")
    either = {sid for res in results.values() for sid in res}
    lines.append(f"| 둘 중 하나 | {len(either)} / {total} | {pct(len(either), total)} |")

    lines.append("")
    lines.append(f"## 2. 넓은 장르 가게 {len(broad)}곳 ({pct(len(broad), total)})이 세부 종류를 얻었나")
    lines.append("| 핫페퍼 장르 | 가게 수 | Overture 구체 종류 | OSM 구체 종류 | 둘 중 하나 |")
    lines.append("| --- | --- | --- | --- | --- |")
    rows = [(g, [s for s in broad if s["genre_name"] == g]) for g in BROAD] + [("합계", broad)]
    for g, group in rows:
        got = {}
        for src, res in results.items():
            got[src] = {s["id"] for s in group if s["id"] in res and is_specific(src, res[s["id"]][2]["cat"])}
        any_ = set().union(*got.values()) if got else set()
        cells = " | ".join(f"{len(got.get(src, ()))} ({pct(len(got.get(src, ())), len(group))})" for src in ("Overture", "OSM"))
        lines.append(f"| {g} | {len(group)} | {cells} | {len(any_)} ({pct(len(any_), len(group))}) |")

    for src, res in results.items():
        counter = collections.Counter(res[s["id"]][2]["cat"] or "(없음)" for s in broad if s["id"] in res)
        lines.append("")
        lines.append(f"## 3. 넓은 장르 가게에 붙은 {src} 종류 (상위 25)")
        lines.append(", ".join(f"{c} {n}" for c, n in counter.most_common(25)))

    lines.append("")
    lines.append("## 4. 짝 맞추기가 맞는지 (핫페퍼 장르가 이미 구체적인 가게로 확인)")
    lines.append("| 핫페퍼 장르 | 가게 수 | Overture 일치 | OSM 일치 |")
    lines.append("| --- | --- | --- | --- |")
    for g, words in CHECK.items():
        group = [s for s in shops if s["genre_name"] == g]
        cells = []
        for src in ("Overture", "OSM"):
            res = results.get(src, {})
            matched = [s for s in group if s["id"] in res and res[s["id"]][2]["cat"]]
            agree = [s for s in matched if any(w in res[s["id"]][2]["cat"] for w in words)]
            cells.append(f"{len(agree)} / {len(matched)} ({pct(len(agree), len(matched))})")
        lines.append(f"| {g} | {len(group)} | {cells[0]} | {cells[1]} |")
    lines.append("(일치 = 종류가 붙은 가게 중 핫페퍼 장르와 같은 계열. '일식당'처럼 넓은 종류가 붙으면 불일치로 셈)")

    lines.append("")
    lines.append("## 5. 짝의 이름 유사도 · 거리")
    for src, res in results.items():
        sims = collections.Counter("0.9 이상" if v[0] >= 0.9 else "0.7~0.9" if v[0] >= 0.7 else "0.5~0.7" for v in res.values())
        dists = collections.Counter("10m 안" if v[1] <= 10 else "10~30m" if v[1] <= 30 else "30~80m" for v in res.values())
        lines.append(f"- {src}: 유사도 {dict(sims)} · 거리 {dict(dists)}")

    lines.append("")
    lines.append("## 참고: 핫페퍼 장르별 가게 수")
    lines.append(", ".join(f"{g or '(없음)'} {n}" for g, n in by_genre.most_common()))


def main():
    shops = read_shops()
    lats = [s["lat"] for s in shops]
    lngs = [s["lng"] for s in shops]
    bbox = (min(lngs) - MARGIN, min(lats) - MARGIN, max(lngs) + MARGIN, max(lats) + MARGIN)

    lines = ["# 공개 장소 데이터 짝 맞추기 실험 (OL-63)", "",
             f"- 핫페퍼 가게 {len(shops)}곳 · 범위 {', '.join(f'{v:.3f}' for v in bbox)}",
             f"- 짝 기준: {MAX_DIST_M}m 안 + 이름 유사도 0.6 이상 (30m 안이면 0.5 이상)"]

    keys, overture = load_overture(bbox)
    lines.append(f"- Overture 장소 {len(overture)}곳 (속성: {', '.join(keys or [])})")
    osm = load_osm(bbox)
    lines.append(f"- OpenStreetMap 음식점 · 카페 · 술집 {len(osm)}곳 (© OpenStreetMap contributors)")
    lines.append("")

    results = {}
    for src, places in (("Overture", overture), ("OSM", osm)):
        grid = build_grid(places)
        res = {}
        for s in shops:
            m = best_match(s, grid)
            if m:
                res[s["id"]] = m
        results[src] = res

    report(shops, results, lines)
    text = "\n".join(lines)
    print(text)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(text + "\n")


if __name__ == "__main__":
    main()
