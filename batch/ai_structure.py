"""
AI 구조화 v1: 핫페퍼 가게 글을 Gemini로 읽어 요일별 점심 영업과 990엔 판정을 만든다

판단 규칙은 정답지(사람)를 만들 때 쓴 규칙과 같아요. 같은 기준으로 채점해야 비교가 공정하니까요.
AI가 '990엔 이하'라고 해도 근거 문구가 원문에 없으면 믿지 않고 '모름'으로 낮춰요.
AI는 글에 적힌 영업 구간만 옮기고, 카드에 보여줄 점심 시간은 코드가 정해요 (lunch_window, 10/19 결정 A).

환경 변수
  GEMINI_API_KEY   Gemini API 키 (유료 등급. 값은 저장소에 올리지 않기)
"""
import json
import time
import urllib.error
import urllib.request

# 2026-10 기준 새 프로젝트 권장 모델 (Gemini API 변경 기록)
MODEL = "gemini-3.8-flash"
# 프롬프트 · 결과 형식을 바꾸면 올리기. 배치가 이 값이 다른 가게를 전부 다시 처리하니 비용을 먼저 계산할 것
PROMPT_VERSION = "2026-10-19"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
TIMEOUT = 120  # 초. 넘으면 그 가게는 이번 실행에서 실패로 (같은 글은 다시 보내도 또 넘을 가능성이 커서 다시 시도하지 않음)
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

open_hours (mon..sun): that weekday's opening hours from OPEN, as a list of intervals
{"open": "HH:MM", "close": "HH:MM", "last_order": "HH:MM" or null}.
- 24-hour times. Times after midnight go past 24: 翌0:00 -> "24:00", 翌1:00 -> "25:00". "00:00～翌0:00" -> 00:00-24:00.
- last_order: the food last order (料理L.O.) of that interval; if only one L.O. is written, that one; else null.
- [] if that weekday is closed or not listed in OPEN. null only if the text truly cannot tell.
- Ignore public holidays (祝日, 祝前日) and 不定休, as in lunch_days.

lunch_label_hours: only if the text explicitly labels a lunch time (e.g. "ランチ 11:30～14:00", "昼 11:00～15:00"),
that range as "HH:MM-HH:MM". Otherwise null. Do not derive it from OPEN.

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
INTERVAL = {"type": "object",
            "properties": {"open": {"type": "string"}, "close": {"type": "string"},
                           "last_order": {"type": ["string", "null"]}},
            "required": ["open", "close", "last_order"]}
DAY_HOURS = {"type": ["array", "null"], "items": INTERVAL}
SCHEMA = {
    "type": "object",
    "properties": {
        "lunch_days": {"type": "object", "properties": {d: DAY for d in DAYS}, "required": DAYS},
        "open_hours": {"type": "object", "properties": {d: DAY_HOURS for d in DAYS}, "required": DAYS},
        "lunch_label_hours": {"type": ["string", "null"]},
        "lunch_price_min": INT_OR_NULL,
        "lunch_price_max": INT_OR_NULL,
        "typical_lunch_price": INT_OR_NULL,
        "under_990": {"type": "string", "enum": ["yes", "no", "unknown"]},
        "price_evidence": {"type": "string"},
    },
    "required": ["lunch_days", "open_hours", "lunch_label_hours", "lunch_price_min", "lunch_price_max",
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
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
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
            # 10/26: 한 가게가 매번 120초를 넘겨 5번 다시 시도(약 10분)하고 배치가 실패함 → 시간 초과는 바로 실패로
            if isinstance(e, TimeoutError) or isinstance(getattr(e, "reason", None), TimeoutError):
                raise RuntimeError(f"Gemini 응답이 {TIMEOUT}초 안에 오지 않았어요: {e}")
            if attempt < 4:
                time.sleep(5)
                continue
            raise RuntimeError(f"Gemini에 연결하지 못했어요: {e}")
    parts = res["candidates"][0]["content"]["parts"]
    usage = res.get("usageMetadata") or {}  # 비용 계산용 토큰 수 (생각 토큰도 출력으로 과금)
    tokens = {"prompt": usage.get("promptTokenCount", 0), "output": usage.get("candidatesTokenCount", 0),
              "thinking": usage.get("thoughtsTokenCount", 0)}
    return json.loads("".join(p.get("text", "") for p in parts if not p.get("thought"))), tokens


def squash(s):
    return "".join((s or "").split())


# 카드에 보여줄 점심 시간 (10/19 결정 A: 990엔은 점심 가격이라 신뢰를 우선)
LUNCH_START, LUNCH_END = 11 * 60, 14 * 60  # 점심 시간대. 점심 영업 요일 판정과 같은 기준
LUNCH_SLOT_END = 17 * 60                    # 이 시각까지 끝나는 구간은 '점심 장사 구간'으로 보고 그대로 보여줌


def minutes(t):
    """'HH:MM' → 분. AI가 이상한 값을 주면 None"""
    try:
        h, m = str(t).split(":")
        return int(h) * 60 + int(m) if len(m) == 2 and 0 <= int(m) < 60 else None
    except ValueError:
        return None


def hhmm(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def overlaps_lunch(interval):
    o, c = minutes(interval.get("open")), minutes(interval.get("close"))
    return o is not None and c is not None and o < LUNCH_END and c > LUNCH_START


def lunch_window(day_open, day_hours, label):
    """그날 카드에 보여줄 점심 시간 {"start", "end", "last_order"}. 점심 영업이 아니면 None
    ① 글에 점심 시간이 따로 적혀 있으면 그 시간
    ② 점심 시간대에 여는 구간이 17시까지 끝나면 그 구간 그대로 (예: 11:30~14:30, L.O.도 같이)
    ③ 저녁까지 이어지는 구간이면 '여는 시간(11시보다 이르면 11시) ~ 14시'"""
    if day_open != "O":
        return None
    if label:
        start, _, end = label.partition("-")
        if minutes(start) is not None and minutes(end) is not None:
            return {"start": start, "end": end, "last_order": None}
    for interval in day_hours or []:
        if overlaps_lunch(interval):
            o, c = minutes(interval["open"]), minutes(interval["close"])
            if c <= LUNCH_SLOT_END:
                return {"start": interval["open"], "end": interval["close"],
                        "last_order": interval.get("last_order")}
            return {"start": hhmm(max(o, LUNCH_START)), "end": hhmm(LUNCH_END), "last_order": None}
    return None


def structure(row, key, model=MODEL):
    text = shop_text(row)
    out, tokens = call_gemini(RULES + "\n\n--- SHOP TEXT ---\n" + text, key, model)
    out["tokens"] = tokens
    evidence = squash(out.get("price_evidence"))
    out["evidence_ok"] = bool(evidence) and evidence in squash(text)
    if out["under_990"] == "yes" and not out["evidence_ok"]:
        out["under_990"] = "unknown"  # 원문에 없는 근거로 '예'라고 하면 믿지 않음
        out["downgraded"] = True
    days, hours = out["lunch_days"], out.get("open_hours") or {}
    out["lunch_window"] = {d: lunch_window(days[d], hours.get(d), out.get("lunch_label_hours")) for d in DAYS}
    # 점심 요일(O/X)과 영업 구간이 서로 안 맞는 요일이 있으면 표시 → 사람이 볼 대상
    out["days_hours_conflict"] = any(
        days[d] in ("O", "X") and hours.get(d) is not None
        and (days[d] == "O") != any(overlaps_lunch(i) for i in hours[d])
        for d in DAYS)
    return out
