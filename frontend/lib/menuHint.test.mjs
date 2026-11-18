// 결과 카드 대표 메뉴 규칙 테스트 (11/17, OL-65). 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { loadingKey, loadingStep, mapsLink, prefetchMenuHint, priceRange, readMenuHint, readPlacePhotos, splitDish, takeMenuHint, UNAVAILABLE_HINT } from "./menuHint.ts";

const SRC = { title: "Hokkyokusei - Google Maps", uri: "https://maps.google.com/?cid=1" };

test("서버 답을 그대로 믿지 않고 모양을 확인함", () => {
  assert.deepEqual(readMenuHint({ status: "ok", place: "open", menus: ["オムライス", 3, ""], kind: "lunch", sources: [SRC], placeId: "ChIJ1234567890" }), {
    status: "ok", place: "open", menus: ["オムライス"], kind: "lunch", sources: [SRC], placeId: "ChIJ1234567890", price: null,
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

test("손님 사진: https 주소만, 6장까지, 올린 사람 · 사진 링크도 https만", () => {
  const ok = { url: "https://lh3.googleusercontent.com/a", author: "Aiko", authorUri: "https://maps.google.com/contrib/1", mapsUri: "https://www.google.com/maps/photo/1" };
  assert.deepEqual(readPlacePhotos({ photos: [ok, { url: "http://x", author: "", authorUri: "" }, { ...ok, url: "https://b", authorUri: "javascript:x", mapsUri: "javascript:y" }] }), [
    ok, { url: "https://b", author: "Aiko", authorUri: "", mapsUri: "" },
  ]);
  // 예전 서버(사진 링크 없음)도 읽음
  assert.equal(readPlacePhotos({ photos: [{ url: "https://c", author: "", authorUri: "" }] })[0].mapsUri, "");
  assert.equal(readPlacePhotos({ photos: Array(7).fill(ok) }).length, 6); // 11/18: 3장 → 6장
  assert.deepEqual(readPlacePhotos(null), []);
});

test("메뉴 칸: 괄호 속 일본어 이름은 작은 글자로 나눔, 없으면 그대로", () => {
  assert.deepEqual(splitDish("교자(自家製餃子)"), { name: "교자", original: "自家製餃子", price: null });
  assert.deepEqual(splitDish("Gyoza (自家製餃子)"), { name: "Gyoza", original: "自家製餃子", price: null });
  assert.deepEqual(splitDish("마파두부 정식（麻婆豆腐定食）"), { name: "마파두부 정식", original: "麻婆豆腐定食", price: null });
  assert.deepEqual(splitDish("自家製餃子"), { name: "自家製餃子", original: null, price: null });
  assert.deepEqual(splitDish("餃子(餃子)"), { name: "餃子(餃子)", original: null, price: null });
  assert.deepEqual(splitDish("(餃子)"), { name: "(餃子)", original: null, price: null });
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

test("AI 추측: 출처 없이 메뉴만, 영업 안내 · 가게 ID는 버림", () => {
  const g = readMenuHint({ status: "guess", place: "closed", menus: ["우동(うどん)"], kind: "lunch", sources: [SRC], placeId: "ChIJ1234567890" });
  assert.deepEqual(g, { status: "guess", place: "unknown", menus: ["우동(うどん)"], kind: "lunch", sources: [], placeId: null, price: null });
  // AI 추측은 가격을 떼고, 가격대도 버림 (구글 지도에서 확인된 가격만)
  const gp = readMenuHint({ status: "guess", menus: ["라멘 (ラーメン) 900"], sources: [], price: { kind: "lunch", min: 800, max: 1200 } });
  assert.deepEqual([gp.menus, gp.price], [["라멘(ラーメン)"], null]);
  assert.equal(readMenuHint({ status: "guess", menus: [] }).status, "unknown");
});

test("기다리는 문구는 시간에 따라 바뀜", () => {
  assert.equal(loadingKey(0), "menu.loading");
  assert.equal(loadingKey(3999), "menu.loading");
  assert.equal(loadingKey(4000), "menu.loading2");
  assert.equal(loadingKey(9000), "menu.loading3");
  assert.equal(loadingKey(20000), "menu.loading4");
  assert.deepEqual([0, 3999, 4000, 9000, 15000].map(loadingStep), [0, 0, 1, 2, 3]);
});

test("메뉴별 가격 · 가격대: 구글 지도에서 찾은 답일 때만, 이상한 숫자는 버림", () => {
  assert.deepEqual(splitDish("라멘 (ラーメン) 900"), { name: "라멘", original: "ラーメン", price: 900 });
  assert.deepEqual(splitDish("카레 (カレー) ¥1,100"), { name: "카레", original: "カレー", price: 1100 });
  assert.deepEqual(splitDish("교자(餃子)450엔"), { name: "교자", original: "餃子", price: 450 });
  assert.deepEqual(splitDish("ランチ 980"), { name: "ランチ", original: null, price: 980 });
  assert.deepEqual(splitDish("セット10"), { name: "セット10", original: null, price: null }); // 띄어쓰기 없는 숫자는 이름
  assert.deepEqual(splitDish("특선 (特選) 99999"), { name: "특선 (特選) 99999", original: null, price: null }); // 3만 엔 넘으면 가격으로 안 봄
  const ok = readMenuHint({ status: "ok", menus: ["라멘 (ラーメン) 900"], sources: [SRC], price: { kind: "lunch", min: 800, max: 1200 } });
  assert.deepEqual(ok.price, { kind: "lunch", min: 800, max: 1200 });
  assert.equal(priceRange(ok.price), "800~1,200");
  assert.equal(priceRange({ kind: "all", min: 900, max: 900 }), "900");
  assert.equal(readMenuHint({ status: "ok", menus: ["A"], sources: [SRC], price: { kind: "lunch", min: 1200, max: 800 } }).price, null);
  assert.equal(readMenuHint({ status: "ok", menus: ["A"], sources: [SRC], price: { kind: "dinner", min: 800, max: 900 } }).price, null);
  assert.equal(readMenuHint({ status: "ok", menus: ["A"], sources: [], price: { kind: "lunch", min: 800, max: 900 } }).price, null);
  // 메뉴는 없어도 지도에서 찾은 가게면 가격대는 남김
  assert.deepEqual(readMenuHint({ status: "unknown", menus: [], sources: [SRC], price: { kind: "all", min: 1000, max: 3000 } }).price, { kind: "all", min: 1000, max: 3000 });
});
