#!/usr/bin/env python3
"""
AI v1 평가: 사람 정답지와 정규식 · AI 결과를 같은 지표로 비교

사용법
  export GEMINI_API_KEY=발급받은키
  python3 batch/eval_ai.py ~/Desktop/lunch_data/eval_set.json

  eval_set.json에는 핫페퍼 원문이 들어 있어서 저장소 밖에 둬요.
  결과는 eval_set.json 옆에 ai_results_날짜시각.json 으로 저장돼요 (이것도 저장소에 올리지 않기).
"""
import argparse
import datetime
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai_structure  # noqa: E402

MAX_PRICE = 990

# ---------------------------------------------------------------- 정규식 기준선 (hotpepper_check.py v3 규칙)
NUM = r"([0-9０-９,，]{3,6})"
DASH = r"[～~〜\-－]"
LABEL_FIRST = re.compile(r"(?:ランチ|昼|lunch)[^0-9０-９]{0,12}" + NUM +
                         r"(?:\s*円)?(?:\s*" + DASH + r"\s*" + NUM + r"\s*円|\s*円)", re.I)
LABEL_AFTER = re.compile(NUM + r"\s*円\s*[（(]\s*(?:ランチ|昼)")
SINGLE = re.compile(r"^\s*[￥¥]?\s*" + NUM + r"\s*円?\s*[～~]?\s*$")
START_TIME = re.compile(r"(?<![0-9])([0-9]{1,2}):([0-9]{2})\s*～")


def to_int(s):
    s = s.translate(str.maketrans("０１２３４５６７８９，", "0123456789,")).replace(",", "")
    return int(s) if s.isdigit() else None


def regex_predict(row):
    has_lunch = any(5 <= int(h) < 14 for h, _ in START_TIME.findall(row.get("open_text") or ""))
    judgment = "unknown"
    for text in [row.get("budget_average"), row.get("budget_memo"), row.get("catch")]:
        m = LABEL_FIRST.search(text or "")
        if m:
            lo = to_int(m.group(1))
            hi = (to_int(m.group(2)) if m.group(2) else lo) or lo
            if lo:
                lo, hi = min(lo, hi), max(lo, hi)
                judgment = "yes" if hi <= MAX_PRICE else ("no" if lo > MAX_PRICE else "unknown")
                break
        m = LABEL_AFTER.search(text or "")
        if m and to_int(m.group(1)):
            judgment = "yes" if to_int(m.group(1)) <= MAX_PRICE else "no"
            break
    else:
        m = SINGLE.match(row.get("budget_average") or "")
        if m and to_int(m.group(1)):
            judgment = "yes" if to_int(m.group(1)) <= MAX_PRICE else "no"
    return {"days": ("O" if has_lunch else "X") * 7, "under_990": judgment}


# ---------------------------------------------------------------- 채점
def score(preds, shops):
    cells = all7 = judged = tp = said_yes = human_yes = 0
    for p, s in zip(preds, shops):
        h = s["human"]
        same = sum(a == b for a, b in zip(p["days"], h["days"]))
        cells += same
        all7 += same == 7
        judged += p["under_990"] == h["under_990"]
        said_yes += p["under_990"] == "yes"
        human_yes += h["under_990"] == "yes"
        tp += p["under_990"] == "yes" and h["under_990"] == "yes"
    n = len(shops)
    return {"cells": (cells, n * 7), "all7": (all7, n), "judged": (judged, n),
            "yes_precision": (tp, said_yes), "yes_recall": (tp, human_yes)}


def fmt(pair):
    a, b = pair
    return f"{a}/{b} ({a / b:.0%})" if b else f"{a}/{b}"


def pad(s, width):
    """한글은 두 칸으로 쳐서 표 줄을 맞춤"""
    return s + " " * max(0, width - sum(2 if ord(c) > 0x1100 else 1 for c in s))


def main():
    ap = argparse.ArgumentParser(description="AI v1 평가")
    ap.add_argument("eval_set", help="eval_set.json 경로 (저장소 밖)")
    ap.add_argument("--model", default=ai_structure.MODEL)
    args = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("환경 변수 GEMINI_API_KEY 를 먼저 설정해 주세요.")
    shops = json.load(open(args.eval_set, encoding="utf-8"))["shops"]

    regex = [regex_predict(s) for s in shops]
    ai, raw = [], []
    for i, s in enumerate(shops, 1):
        try:
            out = ai_structure.structure(s, key, args.model)
            ai.append({"days": "".join(out["lunch_days"][d] for d in ai_structure.DAYS), "under_990": out["under_990"]})
        except (RuntimeError, KeyError, ValueError) as e:  # 한 곳이 실패해도 나머지는 계속, 실패는 틀린 것으로 셈
            out = {"error": str(e)}
            ai.append({"days": "", "under_990": "error"})
        raw.append({"no": s["no"], "name": s["name"], "ai": out})
        print(f"\rAI {i}/{len(shops)}", end="", flush=True)
    print()

    r, a = score(regex, shops), score(ai, shops)
    rows = [("요일 칸 일치", "cells"), ("7일 모두 맞은 가게", "all7"), ("990엔 판정 일치", "judged"),
            ("'예'라고 한 것 중 맞은 것", "yes_precision"), ("사람 '예' 중 찾은 것", "yes_recall")]
    print(f"\n모델 {args.model} · 정답지 {len(shops)}곳\n")
    print(pad("지표", 28) + pad("정규식", 18) + "AI")
    for label, k in rows:
        print(pad(label, 28) + pad(fmt(r[k]), 18) + fmt(a[k]))

    ok = [rec["ai"] for rec in raw if "error" not in rec["ai"]]
    if ok:  # 전체 가게 비용 계산용 (생각 토큰도 출력으로 과금)
        avg = {k: sum(o["tokens"][k] for o in ok) / len(ok) for k in ("prompt", "output", "thinking")}
        print(f"\n토큰 (가게당 평균): 입력 {avg['prompt']:.0f} · 출력 {avg['output']:.0f} · 생각 {avg['thinking']:.0f}")
        print(f"점심 요일과 영업 구간이 안 맞는 가게: {sum(o['days_hours_conflict'] for o in ok)}곳")

    print("\nAI가 틀린 곳")
    for s, p, rec in zip(shops, ai, raw):
        h = s["human"]
        notes = []
        if "error" in rec["ai"]:
            notes.append(f"실패: {rec['ai']['error'][:120]}")
        elif p["days"] != h["days"]:
            notes.append(f"요일 사람 {h['days']} / AI {p['days'] or '-'}")
        if p["under_990"] != h["under_990"] and "error" not in rec["ai"]:
            notes.append(f"990엔 사람 {h['under_990']} / AI {p['under_990']} (근거: {rec['ai'].get('price_evidence', '')})")
        if notes:
            print(f"  {s['no']:>2}. {s['name'][:20]} — " + " · ".join(notes))

    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    out_path = os.path.join(os.path.dirname(os.path.abspath(args.eval_set)), f"ai_results_{stamp}.json")
    json.dump({"model": args.model, "regex": r, "ai": a, "shops": raw}, open(out_path, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print(f"\n자세한 결과: {out_path}")


if __name__ == "__main__":
    main()
