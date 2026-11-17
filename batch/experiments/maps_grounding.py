#!/usr/bin/env python3
"""
실험 (11/17, OL-63): Gemini의 '구글 지도 그라운딩'으로 가게의 점심 메뉴 · 가격대를 물어보면 쓸 만한 답이 오는지

우리 AI가 구글 리뷰를 읽고 유추하면 구글 약관(구글 지도 콘텐츠로 콘텐츠 만들기 금지)에 걸리지만,
구글이 공식으로 제공하는 그라운딩은 구글 AI가 지도 데이터를 보고 답하는 기능이라 표시 조건만 지키면 됨.
2025년 9월 출시 때는 리뷰 기반 답이 미국 · 인도 가게만 됐다고 해서, 오사카 가게 10곳으로 먼저 확인.

- DB는 읽기만 하고 아무것도 저장하지 않음
- 공개 저장소라서 답 원문(구글 지도 기반)과 가게 이름은 실행 기록에 남기지 않음:
  out.json에만 쓰고, 워크플로가 공개 키로 암호화한 것만 출력 (복호화는 Claude 작업 공간의 개인 키로)
- 실행 기록에는 몇 곳이 답했는지 같은 숫자만 출력

환경 변수 (값은 저장소에 올리지 않기)
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY
"""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ai_structure  # noqa: E402

ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MODELS = [ai_structure.MODEL, "gemini-2.5-flash"]  # 지금 배치 모델이 지도 그라운딩을 못 쓰면 2.5 Flash로
# 넓은 장르 위주 + 비교용으로 이미 구체적인 장르 2곳
PICK = [("居酒屋", 4), ("和食", 2), ("洋食", 1), ("ダイニングバー・バル", 1), ("ラーメン", 1), ("お好み焼き・もんじゃ", 1)]

# 2차 (11/17): 1차는 "점심 전용" 메뉴 · 가격만 물어서 10곳 중 6곳이 모름, 평균 15초.
# 점심 한정을 풀고(대표 메뉴 · 가게 전체 가격대도 허용) 4줄 형식으로 짧게 받아 답하는 곳과 속도를 봄
PROMPT = """구글 지도에서 아래 가게를 찾아 주세요.
가게 이름: {name}
위치: 위도 {lat}, 경도 {lng} 근처 (일본 오사카)

아래 4줄 형식으로만, 한국어로 짧게 답해 주세요. 다른 설명은 붙이지 마세요.
영업: 평일 점심 영업 여부 (함 / 안 함 / 폐업 / 모름)
메뉴: 이 가게의 대표 메뉴 2~3개, 일본어 원문을 괄호로 (점심 한정이 아니어도 됨. 근거가 없으면 모름)
가격: 점심 가격대 (엔). 점심 근거가 없으면 '전체 1,000~2,000엔'처럼 가게 전체 가격대. 둘 다 없으면 모름
근거: 리뷰 / 메뉴 정보 / 가게 정보 중 무엇을 봤는지

지어내지 마세요."""


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"환경 변수 {name} 를 먼저 설정해 주세요.")
    return value


def supabase_get(path):
    url = env("SUPABASE_URL").rstrip("/") + "/rest/v1/" + path
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    req = urllib.request.Request(url, headers={"apikey": key, "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def pick_shops():
    rnd = random.Random(1117)
    shops = []
    for genre, n in PICK:
        rows = supabase_get(f"shops?select=id,name,genre_name,lat,lng&genre_name=eq.{urllib.parse.quote(genre)}&limit=1000")
        rows = [r for r in rows if r.get("lat") and r.get("lng")]
        shops += rnd.sample(rows, min(n, len(rows)))
    ids = ",".join(s["id"] for s in shops)
    ai = {r["shop_id"]: r for r in supabase_get(
        f"shop_ai?select=shop_id,lunch_price_min,lunch_price_max,typical_lunch_price&shop_id=in.({ids})")}
    for s in shops:
        a = ai.get(s["id"]) or {}
        s["our_price"] = [a.get("lunch_price_min"), a.get("lunch_price_max"), a.get("typical_lunch_price")]
    return shops


def ask(shop, model, key, prompt=None, gen=None):
    body = {
        "contents": [{"role": "user", "parts": [{"text": (prompt or PROMPT).format(**shop)}]}],
        "tools": [{"googleMaps": {}}],
        "toolConfig": {"retrievalConfig": {"latLng": {"latitude": shop["lat"], "longitude": shop["lng"]}}},
    }
    if gen:
        body["generationConfig"] = gen
    req = urllib.request.Request(ENDPOINT.format(model=model), data=json.dumps(body).encode("utf-8"), method="POST",
                                 headers={"x-goog-api-key": key, "Content-Type": "application/json"})
    started = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        res = json.loads(r.read().decode("utf-8"))
    cand = (res.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in (cand.get("content") or {}).get("parts", []))
    chunks = (cand.get("groundingMetadata") or {}).get("groundingChunks") or []
    sources = [c["maps"].get("title") for c in chunks if isinstance(c, dict) and c.get("maps")]
    usage = res.get("usageMetadata") or {}
    return {"text": text, "sources": sources, "seconds": round(time.time() - started, 1),
            "tokens": usage.get("totalTokenCount"), "thinking": usage.get("thoughtsTokenCount")}


# 3차 (11/17 상권: "시간을 줄일 수 없어?"): 2차는 평균 10.6초. 생각(thinking)을 줄이고, 메뉴 한 줄만 묻고,
# 더 가벼운 모델(Flash-Lite)로 바꾸면 얼마나 빨라지는지 같은 10곳으로 비교
MENU_PROMPT = """구글 지도에서 '{name}' (일본 오사카, 위도 {lat}, 경도 {lng} 근처) 가게를 찾아,
이 가게의 대표 메뉴 2~3개를 한 줄로만 답해 주세요. 형식: 메뉴1(일본어 원문) · 메뉴2(일본어 원문)
근거가 없으면 '모름'. 다른 말은 쓰지 마세요."""
THINKING = [{"thinkingLevel": "minimal"}, {"thinkingLevel": "low"}, {"thinkingBudget": 0}]


def list_models(key):
    req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200",
                                 headers={"x-goog-api-key": key})
    with urllib.request.urlopen(req, timeout=60) as r:
        models = json.loads(r.read().decode("utf-8")).get("models", [])
    return [m["name"].split("/")[-1] for m in models if "generateContent" in m.get("supportedGenerationMethods", [])]


def try_ask(shop, model, key, prompt, think, errors):
    """생각 줄이기 설정은 모델마다 이름이 달라서 받아 주는 것을 차례로 써 봄 (think[0]에 기억)"""
    options = [think[0]] if think[0] is not None else THINKING
    for opt in options:
        try:
            out = ask(shop, model, key, prompt, {"thinkingConfig": opt, "maxOutputTokens": 300})
            think[0] = opt
            return out
        except urllib.error.HTTPError as e:
            errors.append(f"{model} {opt}: {e.code} {e.read().decode('utf-8')[:200]}")
        except (urllib.error.URLError, TimeoutError) as e:
            errors.append(f"{model} {opt}: {e}")
    return None


def speed_test():
    key = env("GEMINI_API_KEY")
    shops = pick_shops()
    names = list_models(key)
    lites = sorted([n for n in names if "flash-lite" in n and "preview" not in n and "tts" not in n])
    lite = lites[-1] if lites else None
    print("Flash-Lite 후보: " + ", ".join(lites[-4:]))
    variants = [("4줄 + 생각 줄이기", ai_structure.MODEL, PROMPT), ("메뉴 한 줄 + 생각 줄이기", ai_structure.MODEL, MENU_PROMPT)]
    if lite:
        variants.append((f"메뉴 한 줄 + {lite}", lite, MENU_PROMPT))
    report, results, errors = [], [], []
    for label, model, prompt in variants:
        think, outs = [None], []
        for s in shops:
            out = try_ask(s, model, key, prompt, think, errors)
            outs.append(out)
            results.append({"variant": label, "genre": s["genre_name"], "name": s["name"], "answer": out})
        ok = [o for o in outs if o]
        secs = sorted(o["seconds"] for o in ok)
        if secs:
            known = sum(1 for o in ok if not o["text"].strip().startswith("모름"))
            report.append(f"- {label} (생각 설정 {think[0]}): 답 {len(ok)}/{len(shops)} · 메뉴 있음 {known} · "
                          f"평균 {sum(secs) / len(secs):.1f}초 · 가운데 {secs[len(secs) // 2]}초 · 최대 {secs[-1]}초 · "
                          f"생각 토큰 평균 {sum((o['thinking'] or 0) for o in ok) // len(ok)}")
        else:
            report.append(f"- {label}: 답 없음")
    print("\n".join(report))
    for e in errors[:6]:
        print(f"오류: {e}")
    with open("out.json", "w", encoding="utf-8") as f:
        json.dump({"results": results, "errors": errors}, f, ensure_ascii=False, indent=1)


def main():
    key = env("GEMINI_API_KEY")
    shops = pick_shops()
    model, results, errors = None, [], []
    for s in shops:
        tried = [model] if model else MODELS
        for m in tried:
            try:
                out = ask(s, m, key)
                model = m
                break
            except urllib.error.HTTPError as e:
                errors.append(f"{m}: {e.code} {e.read().decode('utf-8')[:300]}")
                out = None
            except (urllib.error.URLError, TimeoutError) as e:
                errors.append(f"{m}: {e}")
                out = None
        results.append({"genre": s["genre_name"], "name": s["name"], "our_price": s["our_price"], "answer": out})

    answered = [r for r in results if r["answer"]]
    def line(r, head):  # '메뉴: …' 줄의 값
        for ln in r["answer"]["text"].splitlines():
            ln = ln.strip().lstrip("*-• ").replace("**", "")
            if ln.startswith(head):
                return ln[len(head):].strip(" :：")
        return ""
    unknown = [r for r in answered if line(r, "메뉴").startswith("모름") or not line(r, "메뉴")]
    with_src = [r for r in answered if r["answer"]["sources"]]
    price_lunch = [r for r in answered if line(r, "가격") and not line(r, "가격").startswith(("모름", "전체"))]
    price_all = [r for r in answered if line(r, "가격").startswith("전체")]
    status = {}
    for r in answered:
        k = line(r, "영업")[:4] or "(없음)"
        status[k] = status.get(k, 0) + 1
    # 숫자만 공개 기록에 (오류 문구에는 가게 정보가 없음)
    print(f"모델: {model}")
    print(f"물어본 가게 {len(shops)}곳 · 답이 온 곳 {len(answered)} · 메뉴 '모름' {len(unknown)} · 구글 지도 출처가 붙은 답 {len(with_src)}")
    print(f"가격: 점심 가격 {len(price_lunch)}곳 · 전체 가격대만 {len(price_all)}곳 · 영업: {status}")
    if answered:
        print(f"평균 응답 {sum(r['answer']['seconds'] for r in answered) / len(answered):.1f}초 · "
              f"평균 토큰 {sum((r['answer']['tokens'] or 0) for r in answered) // len(answered)}")
    for e in errors[:5]:
        print(f"오류: {e}")
    with open("out.json", "w", encoding="utf-8") as f:
        json.dump({"model": model, "results": results, "errors": errors}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    speed_test() if os.environ.get("SPEED") else main()
