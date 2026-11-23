# 실험 (11/17, OL-68): 실제 서버(Render)에 가게 30곳의 대표 메뉴를 물어서 몇 곳에서 뜨는지 · 안 뜨면 왜인지 셈
# - 상권 "생각보다 대표메뉴 뜨는곳이 많이 없는거같은데" → 실제 앱 기록은 5번뿐이라 30곳으로 다시 봄
# - 가게는 앱 기본 화면과 같게: 990엔 이하 · 화요일 점심 영업 · 좌표가 오사카 안
# - 공개 저장소라 기록에는 숫자만 (가게 ID · 이름 · 메뉴 글은 남기지 않음. 구글 지도 답은 저장 금지)
# - 익명 로그인 한 번 (앱과 같은 방식). 만든 익명 사용자에는 purpose=menu-hit-test 표시
# - 11/23 다시 돌림 (출시 전 점검 ④): 자동 재시도 · AI 추측(11/17 OL-69) 배포 뒤 같은 30곳. 11/17 첫 테스트는 16/30
import json
import os
import random
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API_URL = os.environ["API_URL"].rstrip("/")
N = 30
TIMEOUT_MS = 20000  # 서버 설정 menu-hint.timeout-seconds


def http(url, method="GET", headers=None, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


def shops():
    under = "or=(typical_lunch_price.lte.990,and(typical_lunch_price.is.null,lunch_price_max.lte.990))"
    rows = []
    for offset in range(0, 10000, 1000):
        status, page = http(
            f"{SUPABASE_URL}/rest/v1/shop_ai?select=shop_id,lunch_days,shops(lat,lng)&{under}&error=is.null"
            f"&order=shop_id&limit=1000&offset={offset}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
        )
        assert status == 200, f"가게 목록 {status}"
        rows += page
        if len(page) < 1000:
            break
    ok = [
        r["shop_id"] for r in rows
        if r["shops"] and r["shops"]["lat"] and r["shops"]["lng"]
        and 34.4 < r["shops"]["lat"] < 34.9 and 135.2 < r["shops"]["lng"] < 135.7
        and (r["lunch_days"] or "")[1:2] == "O"
    ]
    print(f"대상 가게 {len(ok)}곳 중 {N}곳을 무작위로")
    return random.Random(1117).sample(ok, N)


def token():
    status, body = http(f"{SUPABASE_URL}/auth/v1/signup", "POST",
                        {"apikey": KEY, "Content-Type": "application/json"},
                        {"data": {"purpose": "menu-hit-test"}})
    assert status == 200 and body and body.get("access_token"), f"익명 로그인 {status}"
    return body["access_token"]


def wake():
    for _ in range(20):  # 무료 서버가 잠들어 있으면 깨움 (최대 약 3분)
        try:
            with urllib.request.urlopen(f"{API_URL}/health", timeout=10) as res:
                if res.status == 200:
                    return
        except Exception:
            pass
        time.sleep(10)
    raise SystemExit("서버가 깨지 않음")


def main():
    ids = shops()
    bearer = token()
    wake()
    results = []
    for i, shop_id in enumerate(ids, 1):
        started = time.monotonic()
        status, body = http(f"{API_URL}/api/shops/{urllib.parse.quote(shop_id)}/menu-hint?lang=ko",
                            headers={"Authorization": f"Bearer {bearer}"}, timeout=40)
        ms = round((time.monotonic() - started) * 1000)
        body = body or {}
        r = {
            "http": status, "status": body.get("status", "-"), "place": body.get("place", "-"),
            "kind": body.get("kind", "-"), "menus": len(body.get("menus") or []),
            "sources": len(body.get("sources") or []), "ms": ms,
        }
        results.append(r)
        print(f"{i:2d} http={r['http']} status={r['status']} place={r['place']} kind={r['kind']} "
              f"menus={r['menus']} sources={r['sources']} ms={ms}")
        time.sleep(3)  # 실제 사용처럼 한 번에 하나씩, 조금 쉬면서

    def count(key):
        out = {}
        for r in results:
            out[r[key]] = out.get(r[key], 0) + 1
        return out

    shown = [r for r in results if r["status"] == "ok"]
    unavailable = [r for r in results if r["status"] == "unavailable"]
    ms = sorted(r["ms"] for r in results)
    ok_ms = sorted(r["ms"] for r in shown)
    print("\n===== 요약 =====")
    print(f"메뉴가 뜬 곳: {len(shown)}/{N}")
    print(f"메뉴가 뜬 곳 (구글 지도 + AI 추측): {sum(r['status'] in ('ok', 'guess') for r in results)}/{N}")
    print(f"status: {count('status')}")
    print(f"place (구글 지도 기준 점심 영업): {count('place')}")
    print(f"kind (뜬 곳 중): { {k: v for k, v in count('kind').items()} }")
    print(f"안 뜬 이유 - 시간 초과(약 {TIMEOUT_MS // 1000}초): {sum(r['ms'] >= TIMEOUT_MS - 500 for r in unavailable)}"
          f" / 그 밖의 오류: {sum(r['ms'] < TIMEOUT_MS - 500 for r in unavailable)}"
          f" / 구글에 메뉴 없음(unknown): {sum(r['status'] == 'unknown' for r in results)}")
    print(f"12초 넘게 걸리고 뜬 곳 (예전 설정이면 안 떴을 곳): {sum(m > 12000 for m in ok_ms)}")
    print(f"걸린 시간 전체 ms: 중간 {statistics.median(ms):.0f} / 90% {ms[int(len(ms) * 0.9) - 1]} / 최대 {ms[-1]}")
    if ok_ms:
        print(f"뜬 곳만 ms: 중간 {statistics.median(ok_ms):.0f} / 최대 {ok_ms[-1]}")


if __name__ == "__main__":
    main()
