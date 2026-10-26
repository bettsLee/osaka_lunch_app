#!/usr/bin/env python3
"""
AI 구조화 배치: 글이 바뀌었거나 아직 처리하지 않은 가게만 Gemini로 읽어 shop_ai 테이블에 저장

수집(collect.py) 다음에 같은 워크플로에서 돌아요. 가게 글(text_hash) · 모델 · 프롬프트 버전이 그대로면
AI를 다시 부르지 않아서, 평소에는 바뀐 가게 몇 곳만 처리해요. 실패한 가게는 이유를 남기고 다음 실행 때 다시 해요.
모델이나 PROMPT_VERSION을 바꾸면 전체를 다시 처리하니 비용을 먼저 계산하고 바꾸기.

환경 변수 (값은 저장소에 올리지 않기)
  SUPABASE_URL                 https://프로젝트.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    배치 전용 키
  GEMINI_API_KEY               Gemini API 키 (--dry-run이면 필요 없음)

사용법
  python3 batch/structure_shops.py --dry-run     # 처리할 가게 수만 보기
  python3 batch/structure_shops.py --limit 20    # 20곳만 (시험용)
  python3 batch/structure_shops.py               # 처리할 가게 전부
"""
import argparse
import concurrent.futures
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ai_structure  # noqa: E402

PAGE = 1000            # Supabase에서 한 번에 읽는 줄 수 (Supabase 기본 최대값)
CHUNK = 100            # 한 번에 저장하는 줄 수
FAIL_STOP_RATIO = 0.5  # 처리한 가게 중 실패가 이 비율을 넘으면 키 · 모델 · 한도 문제로 보고 실패로 끝냄
FAIL_STOP_MIN = 3      # 단, 실패가 이보다 적으면 가게 몇 곳의 문제로 보고 계속 (10/26: 1곳 중 1곳 실패로 배치가 실패함)
COLUMNS = ["shop_id", "text_hash", "model", "prompt_version", "lunch_days", "open_hours", "lunch_window",
           "lunch_price_min", "lunch_price_max", "typical_lunch_price", "under_990", "price_evidence",
           "evidence_ok", "days_hours_conflict", "error", "processed_at"]


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"환경 변수 {name} 를 먼저 설정해 주세요.")
    return value


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
            text = r.read().decode("utf-8")
        return json.loads(text) if text else None
    except urllib.error.HTTPError as e:
        sys.exit(f"Supabase {method} {path.split('?')[0]} 실패: {e.code} {e.read().decode('utf-8')[:300]}")


def read_all(table, select, order):
    rows, offset = [], 0
    while True:
        page = supabase("GET", f"{table}?select={select}&order={order}&limit={PAGE}&offset={offset}")
        rows += page
        offset += len(page)
        if len(page) < PAGE:
            return rows


def needs_ai(shop, done):
    d = done.get(shop["id"])
    return (d is None or d["error"] is not None or d["text_hash"] != shop["text_hash"]
            or d["model"] != ai_structure.MODEL or d["prompt_version"] != ai_structure.PROMPT_VERSION)


def work(shop, key):
    try:
        return shop, ai_structure.structure(shop, key)
    except Exception as e:  # AI 응답이 이상해도 한 곳 실패로 남기고 나머지는 계속
        return shop, {"error": f"{type(e).__name__}: {e}"}


def keep_previous(shop, out, done):
    """AI가 실패했는데 예전 결과가 멀쩡하면 덮어쓰지 않음 (10/23: Gemini 크레딧이 떨어진 밤에 글이 바뀐 가게가
    실패 줄로 덮여 앱에서 사라지지 않게). 글이 바뀐 상태는 그대로라 다음 실행에서 다시 처리됨"""
    d = done.get(shop["id"])
    return "error" in out and d is not None and d["error"] is None


def too_many_failures(failed, processed):
    """키 · 모델 · 한도 문제처럼 대부분 실패할 때만 배치를 실패로 끝냄 (가게 몇 곳만 실패하면 다음 실행에 다시)"""
    return failed >= FAIL_STOP_MIN and failed > processed * FAIL_STOP_RATIO


def to_row(shop, out):
    row = dict.fromkeys(COLUMNS)
    row.update(shop_id=shop["id"], text_hash=shop["text_hash"], model=ai_structure.MODEL,
               prompt_version=ai_structure.PROMPT_VERSION,
               processed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if "error" in out:
        row["error"] = out["error"][:1000]
        return row
    row.update(lunch_days="".join(out["lunch_days"][d] for d in ai_structure.DAYS),
               open_hours=out.get("open_hours"), lunch_window=out["lunch_window"],
               lunch_price_min=out.get("lunch_price_min"), lunch_price_max=out.get("lunch_price_max"),
               typical_lunch_price=out.get("typical_lunch_price"), under_990=out["under_990"],
               price_evidence=out.get("price_evidence"), evidence_ok=out["evidence_ok"],
               days_hours_conflict=out["days_hours_conflict"])
    return row


def save(rows):
    for i in range(0, len(rows), CHUNK):
        supabase("POST", "shop_ai?on_conflict=shop_id", rows[i:i + CHUNK],
                 prefer="resolution=merge-duplicates,return=minimal")


def main():
    ap = argparse.ArgumentParser(description="AI 구조화 배치")
    ap.add_argument("--dry-run", action="store_true", help="처리할 가게 수만 보기")
    ap.add_argument("--limit", type=int, default=0, help="이번에 처리할 최대 가게 수 (0이면 전부)")
    ap.add_argument("--workers", type=int, default=8, help="동시에 부를 개수")
    ap.add_argument("--max-minutes", type=float, default=40, help="이 시간이 지나면 새로 시작하지 않음 (남은 건 다음 실행에)")
    args = ap.parse_args()

    fields = ",".join(f for f, _ in ai_structure.FIELDS)
    shops = read_all("shops", f"id,text_hash,{fields}", "id")
    done = {d["shop_id"]: d for d in read_all("shop_ai", "shop_id,text_hash,model,prompt_version,error", "shop_id")}
    todo = [s for s in shops if needs_ai(s, done)]
    print(f"가게 {len(shops)}곳 · AI 처리 대상 {len(todo)}곳 (모델 {ai_structure.MODEL}, 프롬프트 {ai_structure.PROMPT_VERSION})")
    if args.limit:
        todo = todo[:args.limit]
    if args.dry_run or not todo:
        return

    key = env("GEMINI_API_KEY")
    deadline = time.monotonic() + args.max_minutes * 60
    queue, pending, rows = iter(todo), set(), []
    processed = failed = kept = 0
    tokens = {"prompt": 0, "output": 0, "thinking": 0}
    with concurrent.futures.ThreadPoolExecutor(args.workers) as pool:
        def submit_next():
            shop = next(queue, None) if time.monotonic() < deadline else None
            if shop is not None:
                pending.add(pool.submit(work, shop, key))

        for _ in range(args.workers):
            submit_next()
        while pending:
            finished, _ = concurrent.futures.wait(pending, return_when=concurrent.futures.FIRST_COMPLETED)
            for f in finished:
                pending.discard(f)
                shop, out = f.result()
                processed += 1
                failed += "error" in out
                for k in tokens:
                    tokens[k] += (out.get("tokens") or {}).get(k, 0)
                if keep_previous(shop, out, done):
                    kept += 1
                else:
                    rows.append(to_row(shop, out))
                submit_next()
            if len(rows) >= CHUNK:
                save(rows)
                rows = []
                print(f"  {processed}/{len(todo)}곳 처리", flush=True)
    save(rows)

    left = len(todo) - processed
    summary = (f"처리 {processed}곳 · 실패 {failed}곳 (그중 예전 결과를 남긴 곳 {kept}곳) · 시간이 다 돼서 남긴 곳 {left}곳 · "
               f"토큰 입력 {tokens['prompt']:,} · 출력 {tokens['output']:,} · 생각 {tokens['thinking']:,}")
    stats = read_all("shop_ai", "under_990,error,days_hours_conflict", "shop_id")
    ok = [s for s in stats if s["error"] is None]
    dist = {v: sum(s["under_990"] == v for s in ok) for v in ("yes", "no", "unknown")}
    overall = (f"전체 {len(stats)}곳: 990엔 이하 예 {dist['yes']} · 아니요 {dist['no']} · 모름 {dist['unknown']} · "
               f"실패 {len(stats) - len(ok)} · 요일과 영업시간 충돌 {sum(bool(s['days_hours_conflict']) for s in ok)}")
    print(summary)
    print(overall)
    if os.environ.get("GITHUB_ACTIONS"):  # Actions 화면의 알림으로도 남김
        print(f"::notice title=AI 구조화::{summary}")
        print(f"::notice title=AI 결과 전체::{overall}")
    if too_many_failures(failed, processed):
        sys.exit(f"실패가 너무 많아요({failed}/{processed}). 키 · 모델 · 요금 상태를 확인해 주세요.")


if __name__ == "__main__":
    main()
