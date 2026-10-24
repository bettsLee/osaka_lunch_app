// 도감 · 공유 카드 규칙 테스트 (가게 원문 없이 만든 값만 씀). 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { collect, filterItems, filterOptions, inPeriod, monthDayTime, NO_FILTER, topArea } from "./zukan.ts";

const shop = (id, over = {}) => ({
  id, name: `가게 ${id}`, genre: "和食", lat: 34.68, lng: 135.5, photoUrl: null, hotpepperUrl: null, areaCode: "Y305",
  lunchDays: "OOOOOXX", lunchWindow: {}, priceMin: 600, priceMax: 950, typicalPrice: null, priceEvidence: null, catchText: null, ...over,
});
const visit = (shopId, chosenAt) => ({ shopId, shopName: `기록 ${shopId}`, chosenAt });

test("같은 가게는 한 칸으로 합치고 최근 것부터, 이름은 그날 가게 목록에서 (목록에 없으면 이름 없음)", () => {
  const items = collect(
    [visit("a", "2026-10-18T03:00:00Z"), visit("b", "2026-10-20T03:00:00Z"), visit("a", "2026-10-21T03:00:00Z"), visit("gone", "2026-10-19T03:00:00Z")],
    [shop("a"), shop("b")],
  );
  assert.deepEqual(items.map((i) => [i.shopId, i.times, i.lastAt]), [
    ["a", 2, "2026-10-21T03:00:00Z"],
    ["b", 1, "2026-10-20T03:00:00Z"],
    ["gone", 1, "2026-10-19T03:00:00Z"],
  ]);
  assert.equal(items[0].name, "가게 a"); // 서버에 저장한 이름(기록 a)이 아니라 지금 목록의 이름
  assert.equal(items[2].shop, null);
  assert.equal(items[2].name, null); // 10/24 리크루트 답: 24시간 넘은 이름을 보여 주지 않음
});

test("주로 다닌 동네(절반 넘게)", () => {
  const items = collect(
    [visit("a", "2026-10-21T03:00:00Z"), visit("b", "2026-10-20T03:00:00Z"), visit("c", "2026-10-19T03:00:00Z"), visit("x", "2026-10-18T03:00:00Z")],
    [shop("a", { areaCode: "Y315", typicalPrice: 880 }), shop("b", { areaCode: "Y305", priceMax: 990 }), shop("c", { areaCode: "Y315", priceMax: 790 })],
  );
  assert.equal(topArea(items), "Y315");
  assert.equal(topArea([]), null);
  // 동네가 반반이면 어느 한 동네라고 하지 않음
  const split = collect([visit("a", "2026-10-21T03:00:00Z"), visit("b", "2026-10-20T03:00:00Z")], [shop("a", { areaCode: "Y301" }), shop("b", { areaCode: "Y866" })]);
  assert.equal(topArea(split), null);
});

test("날짜는 오사카 기준", () => {
  assert.deepEqual(monthDayTime("2026-10-18T15:30:00Z"), { m: 10, d: 19, time: "00:30" }); // 오사카 0:30
});

test("또 갈래요: 그 가게 기록 중 하나라도 켜져 있으면 ♥", () => {
  const items = collect(
    [{ ...visit("a", "2026-10-21T03:00:00Z"), again: null }, { ...visit("a", "2026-10-18T03:00:00Z"), again: true }, { ...visit("b", "2026-10-20T03:00:00Z"), again: false }],
    [shop("a"), shop("b")],
  );
  assert.deepEqual(items.map((i) => [i.shopId, i.liked]), [["a", true], ["b", false]]);
});

test("도감 필터: 동네 · 가격(모르면 뺌) · 종류 · ♥, 고를 수 있는 건 도감에 있는 것만", () => {
  const items = collect(
    [
      { ...visit("a", "2026-10-21T03:00:00Z"), again: true },
      visit("b", "2026-10-20T03:00:00Z"),
      visit("c", "2026-10-19T03:00:00Z"),
      visit("gone", "2026-10-18T03:00:00Z"),
    ],
    [
      shop("a", { areaCode: "Y301", genre: "ラーメン", typicalPrice: 780 }),
      shop("b", { areaCode: "Y301", genre: "和食", priceMax: 990 }),
      shop("c", { areaCode: "Y866", genre: "ラーメン", priceMax: 1190 }),
    ],
  );
  const ids = (f) => filterItems(items, { ...NO_FILTER, ...f }, new Date("2026-10-21T12:00:00Z")).map((i) => i.shopId);
  assert.deepEqual(ids({}), ["a", "b", "c", "gone"]);
  assert.deepEqual(ids({ area: "Y301" }), ["a", "b"]);
  assert.deepEqual(ids({ maxPrice: 990 }), ["a", "b"]); // gone은 가격을 몰라서 빠짐
  assert.deepEqual(ids({ genre: "ラーメン", maxPrice: 790 }), ["a"]);
  assert.deepEqual(ids({ liked: true }), ["a"]);
  assert.deepEqual(ids({ period: "today" }), ["a"]); // 10/21이 오늘
  assert.deepEqual(ids({ period: "week" }), ["a", "b", "c"]); // 10/19(월)부터, gone은 10/18(일)
  assert.deepEqual(filterOptions(items), { areas: ["Y301", "Y866"], genres: ["ラーメン", "和食"] });
});

test("날짜 · 시각과 기간 필터는 오사카 시간 기준 (주는 월요일부터)", () => {
  assert.deepEqual(monthDayTime("2026-10-22T03:05:00Z"), { m: 10, d: 22, time: "12:05" });
  assert.deepEqual(monthDayTime("2026-10-21T15:30:00Z"), { m: 10, d: 22, time: "00:30" });
  const now = new Date("2026-10-22T12:00:00Z"); // 목요일 21:00 오사카
  assert.equal(inPeriod("2026-10-22T03:00:00Z", "today", now), true);
  assert.equal(inPeriod("2026-10-21T14:00:00Z", "today", now), false); // 수요일 23:00
  assert.equal(inPeriod("2026-10-18T16:00:00Z", "week", now), true); // 월요일 01:00
  assert.equal(inPeriod("2026-10-18T14:00:00Z", "week", now), false); // 일요일 23:00
  assert.equal(inPeriod("2026-10-01T00:00:00Z", "month", now), true);
  assert.equal(inPeriod("2026-09-30T14:00:00Z", "month", now), false); // 9/30 23:00
});
