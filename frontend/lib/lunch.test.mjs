// 홈 화면 규칙 테스트 (가게 원문 없이 만든 값만 씀). 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  areaName, displayPrice, distanceKm, lunchOver, openNow, osakaNow, pickNearby, priceLabel, walkMinutes,
} from "./lunch.ts";

const HERE = { lat: 34.68, lng: 135.5 };
const KM_LAT = 1 / 111.195; // 위도 1km

function shop(km, over = {}) {
  return {
    id: `s${Math.random()}`, name: "가게", genre: "和食", lat: HERE.lat + km * KM_LAT, lng: HERE.lng,
    photoUrl: null, hotpepperUrl: null, areaCode: "Y305", lunchDays: "OOOOOXX",
    lunchWindow: { wed: { start: "11:30", end: "14:30", last_order: "14:00" } },
    priceMin: null, priceMax: 950, typicalPrice: null, ...over,
  };
}
const many = (n, km, over) => Array.from({ length: n }, () => shop(km, over));

test("거리와 걸어서 n분", () => {
  assert.ok(Math.abs(distanceKm(HERE, shop(1)) - 1) < 0.001);
  assert.equal(walkMinutes(1), 17); // 1km × 1.3 ÷ 80m
  assert.equal(walkMinutes(0.1), 2);
  assert.equal(walkMinutes(0), 1);
});

test("오사카 시간 기준 요일 · 시각", () => {
  assert.deepEqual(osakaNow(new Date("2026-10-21T01:00:00Z")), { day: "wed", minutes: 600 });
  assert.deepEqual(osakaNow(new Date("2026-10-20T15:30:00Z")), { day: "wed", minutes: 30 }); // 한국 · 일본 자정 넘김
});

test("1km에 20곳 이상이면 넓히지 않음", () => {
  const r = pickNearby([...many(20, 0.5), ...many(5, 1.4)], HERE, "wed");
  assert.equal(r.radiusKm, 1);
  assert.equal(r.widened, false);
  assert.equal(r.shops.length, 20);
});

test("모자라면 1.5km, 그래도 모자라면 2km 안 전부", () => {
  assert.equal(pickNearby([...many(10, 0.5), ...many(10, 1.4)], HERE, "wed").radiusKm, 1.5);
  const r = pickNearby([...many(3, 0.5), ...many(2, 1.9), ...many(4, 2.5)], HERE, "wed");
  assert.deepEqual([r.radiusKm, r.widened, r.shops.length], [2, true, 5]);
  assert.equal(pickNearby([], HERE, "wed").shops.length, 0);
});

test("오늘 점심 영업하지 않는 가게는 세지 않음", () => {
  const r = pickNearby([...many(19, 0.5), ...many(5, 0.5, { lunchDays: "OOOOOXX" })], HERE, "sat");
  assert.equal(r.shops.length, 0);
  const r2 = pickNearby([...many(19, 0.5), shop(0.5, { lunchDays: "OOXOOXX" })], HERE, "wed"); // 수요일 휴무 1곳
  assert.deepEqual([r2.radiusKm, r2.shops.length], [2, 19]);
});

test("보여줄 가격: 대표 메뉴 → 최고가 → 최저가~", () => {
  assert.deepEqual(displayPrice(shop(0, { typicalPrice: 880, priceMax: 990 })), { yen: 880, from: false });
  assert.equal(priceLabel(shop(0, { priceMax: 1190 })), "1,190엔");
  assert.equal(priceLabel(shop(0, { priceMax: null, priceMin: 500 })), "500엔~");
  assert.equal(priceLabel(shop(0, { priceMax: null })), "가격 확인");
});

test("지금 점심 영업 중인지 · 점심이 끝났는지", () => {
  const s = shop(0.3);
  assert.equal(openNow(s, "wed", 12 * 60), true);
  assert.equal(openNow(s, "wed", 14 * 60 + 30), false); // 끝나는 시각은 포함하지 않음
  assert.equal(openNow(s, "sat", 12 * 60), false);
  assert.equal(openNow(shop(0.3, { lunchWindow: {} }), "wed", 12 * 60), false);
  assert.equal(lunchOver([s], "wed", 14 * 60), false);
  assert.equal(lunchOver([s], "wed", 15 * 60), true);
  assert.equal(lunchOver([], "wed", 15 * 60), false);
});

test("동네 이름은 가장 가까운 가게의 지역", () => {
  const near = { ...shop(0.2, { areaCode: "Y315" }), km: 0.2, walk: 4 };
  const far = { ...shop(0.9), km: 0.9, walk: 15 };
  assert.equal(areaName([far, near]), "난바");
  assert.equal(areaName([]), null);
});
