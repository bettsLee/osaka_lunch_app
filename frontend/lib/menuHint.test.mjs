// 결과 카드 대표 메뉴 규칙 테스트 (11/17, OL-65). 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { mapsLink, prefetchMenuHint, readMenuHint, readPlacePhotos, splitDish, takeMenuHint, UNAVAILABLE_HINT } from "./menuHint.ts";

const SRC = { title: "Hokkyokusei - Google Maps", uri: "https://maps.google.com/?cid=1" };

test("서버 답을 그대로 믿지 않고 모양을 확인함", () => {
  assert.deepEqual(readMenuHint({ status: "ok", place: "open", menus: ["オムライス", 3, ""], kind: "lunch", sources: [SRC], placeId: "ChIJ1234567890" }), {
    status: "ok", place: "open", menus: ["オムライス"], kind: "lunch", sources: [SRC], placeId: "ChIJ1234567890",
  });
  // 점심 메뉴인지 모르면 '가게 대표 메뉴', 이상한 가게 ID는 버림
  const odd = readMenuHint({ status: "ok", menus: ["A"], kind: "dinner", sources: [SRC], placeId: "../../x" });
  assert.equal(odd.kind, "signature");
  assert.equal(odd.placeId, null);
  assert.deepEqual(readMenuHint(null), UNAVAILABLE_HINT);
  assert.equal(readMenuHint({ status: "hack", place: "x" }).status, "unavailable");
  // https가 아닌 링크는 버림 → 출처가 없으면 메뉴도 보여 주지 않음 (표시 규칙)
  const bad = readMenuHint({ status: "ok", place: "open", menus: ["A"], sources: [{ title: "x", uri: "javascript:alert(1)" }] });
  assert.equal(bad.status, "unknown");
  assert.deepEqual(bad.menus, []);
  assert.equal(readMenuHint({ status: "ok", menus: ["1", "2", "3", "4"], sources: [SRC] }).menus.length, 3);
});

test("손님 사진: https 주소만, 3장까지, 올린 사람 링크도 https만", () => {
  const ok = { url: "https://lh3.googleusercontent.com/a", author: "Aiko", authorUri: "https://maps.google.com/contrib/1" };
  assert.deepEqual(readPlacePhotos({ photos: [ok, { url: "http://x", author: "", authorUri: "" }, { ...ok, url: "https://b", authorUri: "javascript:x" }] }), [
    ok, { url: "https://b", author: "Aiko", authorUri: "" },
  ]);
  assert.equal(readPlacePhotos({ photos: [ok, ok, ok, ok] }).length, 3);
  assert.deepEqual(readPlacePhotos(null), []);
});

test("메뉴 칸: 괄호 속 일본어 이름은 작은 글자로 나눔, 없으면 그대로", () => {
  assert.deepEqual(splitDish("교자(自家製餃子)"), { name: "교자", original: "自家製餃子" });
  assert.deepEqual(splitDish("Gyoza (自家製餃子)"), { name: "Gyoza", original: "自家製餃子" });
  assert.deepEqual(splitDish("마파두부 정식（麻婆豆腐定食）"), { name: "마파두부 정식", original: "麻婆豆腐定食" });
  assert.deepEqual(splitDish("自家製餃子"), { name: "自家製餃子", original: null });
  assert.deepEqual(splitDish("餃子(餃子)"), { name: "餃子(餃子)", original: null });
  assert.deepEqual(splitDish("(餃子)"), { name: "(餃子)", original: null });
});

test("메뉴가 없을 때 구글맵 링크: 출처 장소가 있으면 그곳, 없으면 이름으로 검색", () => {
  assert.equal(mapsLink({ ...UNAVAILABLE_HINT, sources: [SRC] }, "北極星"), SRC.uri);
  assert.equal(mapsLink(UNAVAILABLE_HINT, "北極星 天保山店"), "https://www.google.com/maps/search/?api=1&query=%E5%8C%97%E6%A5%B5%E6%98%9F%20%E5%A4%A9%E4%BF%9D%E5%B1%B1%E5%BA%97");
});

test("룰렛 중 미리 물어본 답은 카드가 한 번만 가져가고, 없으면 그때 물어봄", async () => {
  const calls = [];
  const fetcher = async (id, lang) => {
    calls.push(`${lang}|${id}`);
    return { ...UNAVAILABLE_HINT, status: "unknown" };
  };
  prefetchMenuHint("J1", "ko", fetcher);
  prefetchMenuHint("J1", "ko", fetcher); // 같은 가게를 또 미리 물어도 한 번만
  const first = takeMenuHint("J1", "ko", fetcher);
  assert.equal(first.prefetched, true);
  assert.equal((await first.hint).status, "unknown");
  const again = takeMenuHint("J1", "ko", fetcher); // 다시 열면 새로 물어봄 (저장하지 않음)
  assert.equal(again.prefetched, false);
  await again.hint;
  assert.deepEqual(calls, ["ko|J1", "ko|J1"]);
  assert.equal(takeMenuHint("J1", "ja", fetcher).prefetched, false); // 언어가 다르면 다른 답
});
