// 도감 · 공유 카드 규칙 테스트 (가게 원문 없이 만든 값만 씀). 실행: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { averagePrice, cardTiles, collect, filterItems, filterOptions, monthDay, NO_FILTER, topArea } from "./zukan.ts";

const shop = (id, over = {}) => ({
  id, name: `가게 ${id}`, genre: "和食", lat: 34.68, lng: 135.5, photoUrl: null, hotpepperUrl: null, areaCode: "Y305",
  lunchDays: "OOOOOXX", lunchWindow: {}, priceMin: 600, priceMax: 950, typicalPrice: null, priceEvidence: null, catchText: null, ...over,
});
const visit = (shopId, chosenAt) => ({ shopId, shopName: `기록 ${shopId}`, chosenAt });

test("같은 가게는 한 칸으로 합치고 최근 것부터, 가게 목록에 없으면 이름만", () => {
  const items = collect(
    [visit("a", "2026-10-18T03:00:00Z"), visit("b", "2026-10-20T03:00:00Z"), visit("a", "2026-10-21T03:00:00Z"), visit("gone", "2026-10-19T03:00:00Z")],
    [shop("a"), shop("b")],
  );
  assert.deepEqual(items.map((i) => [i.shopId, i.times, i.lastAt]), [
    ["a", 2, "2026-10-21T03:00:00Z"],
    ["b", 1, "2026-10-20T03:00:00Z"],
    ["gone", 1, "2026-10-19T03:00:00Z"],
  ]);
  assert.equal(items[2].shop, null);
  assert.equal(items[2].name, "기록 gone");
});

test("주로 다닌 동네(절반 넘게) · 평균 가격(10엔 단위)", () => {
  const items = collect(
    [visit("a", "2026-10-21T03:00:00Z"), visit("b", "2026-10-20T03:00:00Z"), visit("c", "2026-10-19T03:00:00Z"), visit("x", "2026-10-18T03:00:00Z")],
    [shop("a", { areaCode: "Y315", typicalPrice: 880 }), shop("b", { areaCode: "Y305", priceMax: 990 }), shop("c", { areaCode: "Y315", priceMax: 790 })],
  );
  assert.equal(topArea(items), "Y315");
  assert.equal(averagePrice(items), 890); // (880 + 990 + 790) / 3 = 886.7
  assert.equal(topArea([]), null);
  // 동네가 반반이면 어느 한 동네라고 하지 않음
  const split = collect([visit("a", "2026-10-21T03:00:00Z"), visit("b", "2026-10-20T03:00:00Z")], [shop("a", { areaCode: "Y301" }), shop("b", { areaCode: "Y866" })]);
  assert.equal(topArea(split), null);
  assert.equal(averagePrice(collect([visit("x", "2026-10-18T03:00:00Z")], [])), null);
});

test("카드 칸은 최근 6곳(가게 목록에 없는 곳은 뺌), 모자라면 빈 칸", () => {
  const items = collect(
    [visit("a", "2026-10-21T03:00:00Z"), visit("gone", "2026-10-20T12:00:00Z"), visit("b", "2026-10-20T03:00:00Z")],
    [shop("a", { genre: "ラーメン" }), shop("b")],
  );
  const tiles = cardTiles(items);
  assert.equal(tiles.length, 6);
  assert.deepEqual(tiles[0], { genre: "ラーメン", price: 950 });
  assert.deepEqual(tiles[1], { genre: "和食", price: 950 });
  assert.equal(tiles[2], null);
});

test("날짜는 오사카 기준", () => {
  assert.deepEqual(monthDay("2026-10-18T15:30:00Z"), { m: 10, d: 19 }); // 오사카 0:30
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
  const ids = (f) => filterItems(items, { ...NO_FILTER, ...f }).map((i) => i.shopId);
  assert.deepEqual(ids({}), ["a", "b", "c", "gone"]);
  assert.deepEqual(ids({ area: "Y301" }), ["a", "b"]);
  assert.deepEqual(ids({ maxPrice: 990 }), ["a", "b"]); // gone은 가격을 몰라서 빠짐
  assert.deepEqual(ids({ genre: "ラーメン", maxPrice: 790 }), ["a"]);
  assert.deepEqual(ids({ liked: true }), ["a"]);
  assert.deepEqual(filterOptions(items), { areas: ["Y301", "Y866"], genres: ["ラーメン", "和食"] });
});
