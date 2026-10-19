"""
AI 구조화 v1: 핫페퍼 가게 글을 Gemini로 읽어 요일별 점심 영업과 990엔 판정을 만든다

판단 규칙은 정답지(사람)를 만들 때 쓴 규칙과 같아요. 같은 기준으로 채점해야 비교가 공정하니까요.
AI가 '990엔 이하'라고 해도 근거 문구가 원문에 없으면 믿지 않고 '모름'으로 낮춰요.

환경 변수
  GEMINI_API_KEY   Gemini API 키 (유료 등급. 값은 저장소에 올리지 않기)
"""
import json
import time
import urllib.error
import urllib.request

# 2026-10 기준 새 프로젝트 권장 모델 (Gemini API 변경 기록)
MODEL = "gemini-3.8-flash"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
# AI에게 보여줄 글 (collect.py의 AI_TEXT_FIELDS와 같은 항목)
FIELDS = [("open_text", "OPEN"), ("close_text", "CLOSED_DAYS"), ("budget_average", "BUDGET"),
          ("budget_name", "BUDGET_RANGE"), ("budget_memo", "BUDGET_MEMO"), ("catch", "SHOP_CATCH"),
          ("genre_catch", "GENRE_CATCH"), ("shop_detail_memo", "SHOP_MEMO"), ("other_memo", "OTHER_MEMO")]

RULES = """You read a Japanese restaurant listing from Hot Pepper Gourmet and extract lunch information.
Use ONLY the text below. Do not guess from the shop name or genre. If the text does not say, answer "?" / null / "unknown".

lunch_days (mon..sun):
- "O" if the shop is open during lunch time (roughly 11:00-14:00) on that weekday according to OPEN.
- "X" if that weekday has only evening hours, is a closed day (CLOSED_DAYS), or is not listed in OPEN.
- "?" only if the text truly cannot tell.
- Ignore public holidays (祝日, 祝前日). 不定休 (irregular closing) does not close any weekday: keep those days "O".
- Times are sometimes glued together: "11:30～14:3018:00～23:00" means 11:30-14:30 and 18:00-23:00.
- "00:00～翌0:00" means open all day, so lunch is open.

lunch_hours: the weekday lunch time range as "HH:MM-HH:MM", or null if there is no lunch.

Prices (yen, integers):
- lunch_price_min / lunch_price_max: the lunch price range as written (ランチ, 昼, (ランチ平均)). One value means min = max.
  An open-ended price like "ランチ500円～" has min 500 and max null.
  Do not use dinner prices, お通し, チャージ, drinks or course prices. null if no lunch price is written.
- typical_lunch_price: what a normal lunch main dish (定食, ランチセット, a bowl of ramen, etc.) costs, only if the text
  gives a clue. Examples: "日替わり定食 950円" -> 950, "1500円（ランチ平均）" -> 1500. Otherwise null.

under_990 (judged on the typical lunch main dish):
- "yes": every lunch price is 990 yen or less, or the text says a normal lunch main dish costs 990 yen or less.
- "no": a normal lunch main dish costs more than 990 yen (for example the cheapest lunch price is above 990).
- "unknown": the lunch price range crosses 990 with no clue about the normal dish, or the lunch price is unknown.

price_evidence: copy, exactly as written, the short part of the text your price judgment is based on. "" if unknown."""

DAY = {"type": "string", "enum": ["O", "X", "?"]}
INT_OR_NULL = {"type": ["integer", "null"]}
SCHEMA = {
    "type": "object",
    "properties": {
        "lunch_days": {"type": "object", "properties": {d: DAY for d in DAYS}, "required": DAYS},
        "lunch_hours": {"type": ["string", "null"]},
        "lunch_price_min": INT_OR_NULL,
        "lunch_price_max": INT_OR_NULL,
        "typical_lunch_price": INT_OR_NULL,
        "under_990": {"type": "string", "enum": ["yes", "no", "unknown"]},
        "price_evidence": {"type": "string"},
    },
    "required": ["lunch_days", "lunch_hours", "lunch_price_min", "lunch_price_max",
                 "typical_lunch_price", "under_990", "price_evidence"],
}


def shop_text(row):
    return "\n".join(f"{label}: {row.get(field) or ''}" for field, label in FIELDS)


# JSON 응답을 요청하는 방식. 지금 문서의 방식(mimeType은 문자열이 아니라 APPLICATION_JSON 값)이 거절되면
# 이전 방식(responseMimeType + responseJsonSchema)으로 한 번 바꾸고, 그 뒤로는 되는 쪽만 씀
FORMATS = [
    {"responseFormat": {"text": {"mimeType": "APPLICATION_JSON", "schema": SCHEMA}}},
    {"responseMimeType": "application/json", "responseJsonSchema": SCHEMA},
]
_format = [0]


def call_gemini(prompt, key, model):
    for attempt in range(5):  # 잠깐 몰리는 경우(429 · 5xx)만 쉬었다가 다시
        body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": FORMATS[_format[0]]}
        req = urllib.request.Request(ENDPOINT.format(model=model), data=json.dumps(body).encode("utf-8"),
                                     method="POST", headers={"x-goog-api-key": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                res = json.loads(r.read().decode("utf-8"))
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode("utf-8")[:1500]
            if e.code == 400 and "response_format" in msg and _format[0] + 1 < len(FORMATS):
                _format[0] += 1
                continue
            if e.code in (429, 500, 502, 503) and attempt < 4:
                time.sleep(5 * (attempt + 1))
                continue
            raise RuntimeError(f"Gemini 오류 {e.code}: {msg}")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 4:
                time.sleep(5)
                continue
            raise RuntimeError(f"Gemini에 연결하지 못했어요: {e}")
    parts = res["candidates"][0]["content"]["parts"]
    return json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))


def squash(s):
    return "".join((s or "").split())


def structure(row, key, model=MODEL):
    text = shop_text(row)
    out = call_gemini(RULES + "\n\n--- SHOP TEXT ---\n" + text, key, model)
    evidence = squash(out.get("price_evidence"))
    out["evidence_ok"] = bool(evidence) and evidence in squash(text)
    if out["under_990"] == "yes" and not out["evidence_ok"]:
        out["under_990"] = "unknown"  # 원문에 없는 근거로 '예'라고 하면 믿지 않음
        out["downgraded"] = True
    return out
