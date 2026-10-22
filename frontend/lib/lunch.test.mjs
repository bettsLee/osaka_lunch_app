// 홈 화면 규칙 테스트 (가게 원문 없이 만든 값만 씀). 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import {
  areaName, directionsUrl, displayPrice, distanceKm, formatDuration, genreLabel, lunchTimeText, openNow, osakaNow,
  pickNearby, pickShop, priceBadge, priceLabel, priceRange, rouletteCandidates, SPIN_STEPS, spinSteps, tierInfo, underLimit,
  walkMinutes,
  areaCenters,
  nextLunch,
} from "./lunch.ts";
import ko from "../public/i18n/ko.json" with { type: "json" };
import { translator } from "./i18n.ts";

const t = translator(ko);

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
  assert.equal(priceLabel(shop(0, { priceMax: 1190 }), t), "1,190엔");
  assert.equal(priceLabel(shop(0, { priceMax: null, priceMin: 500 }), t), "500엔~");
  assert.equal(priceLabel(shop(0, { priceMax: null }), t), "가격 확인");
});

test("지금 점심 영업 중인지", () => {
  const s = shop(0.3);
  assert.equal(openNow(s, "wed", 12 * 60), true);
  assert.equal(openNow(s, "wed", 14 * 60 + 30), false); // 끝나는 시각은 포함하지 않음
  assert.equal(openNow(s, "sat", 12 * 60), false);
  assert.equal(openNow(shop(0.3, { lunchWindow: {} }), "wed", 12 * 60), false);
});

// ---------------------------------------------------------------- 룰렛 · 결과 카드
const win = (start, end, last_order = null) => ({ wed: { start, end, last_order } });

test("룰렛 후보는 오늘 아직 주문할 수 있는 가게 (시간 모르면 넣음)", () => {
  const a = shop(0.3, { id: "a", lunchWindow: win("11:30", "14:30", "14:00") });
  const b = shop(0.3, { id: "b", lunchWindow: win("11:00", "15:00") });
  const c = shop(0.3, { id: "c", lunchWindow: {} });
  const ids = (m) => rouletteCandidates([a, b, c], "wed", m).map((s) => s.id);
  assert.deepEqual(ids(9 * 60), ["a", "b", "c"]); // 점심 전에도 고를 수 있음
  assert.deepEqual(ids(14 * 60 + 10), ["b", "c"]); // a는 라스트오더 지남
  assert.deepEqual(ids(15 * 60), ["c"]);
});

test("다시 돌리면 직전 결과는 빼고 고름", () => {
  const pool = [{ id: "a" }, { id: "b" }];
  assert.equal(pickShop(pool, "a", () => 0).id, "b");
  assert.equal(pickShop(pool, "a", () => 0.99).id, "b");
  assert.equal(pickShop([{ id: "a" }], "a").id, "a"); // 한 곳뿐이면 그대로
  assert.equal(pickShop([], null), null);
});

test("룰렛 연출은 결과에서 멈추고, 점점 느려지고, 같은 핀이 연달아 나오지 않음", () => {
  const pool = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let k = 0;
  const steps = spinSteps(pool, "c", () => [0, 0, 0.5, 0.5, 0.9][k++ % 5]);
  assert.equal(steps.length, SPIN_STEPS);
  assert.equal(steps.at(-1).id, "c");
  for (let i = 1; i < steps.length - 1; i++) {
    assert.ok(steps[i].ms >= steps[i - 1].ms);
    assert.notEqual(steps[i].id, steps[i - 1].id);
  }
  const total = steps.reduce((t, s) => t + s.ms, 0);
  assert.ok(total > 1000 && total < 2000, `연출 ${total}ms`); // 1~2초
  assert.equal(spinSteps([{ id: "a" }], "a").at(-1).id, "a");
});

test("결과 카드의 점심 시간 문구", () => {
  const s = shop(0.3, { lunchWindow: win("11:30", "14:30", "14:00") });
  assert.deepEqual(lunchTimeText(s, "wed", 10 * 60, t), { text: "오늘 점심 11:30~14:30 (주문 14:00까지) · 11:30부터", soon: false });
  assert.deepEqual(lunchTimeText(s, "wed", 12 * 60 + 40, t), { text: "오늘 점심 11:30~14:30 (주문 14:00까지) · 주문 마감까지 1시간 20분", soon: false });
  assert.equal(lunchTimeText(s, "wed", 13 * 60 + 40, t).soon, true);
  assert.equal(lunchTimeText(s, "wed", 14 * 60 + 5, t).text, "오늘 점심 11:30~14:30 (주문 14:00까지) · 오늘은 주문이 끝났어요");
  assert.equal(lunchTimeText(shop(0.3, { lunchWindow: win("11:00", "14:00") }), "wed", 13 * 60, t).text, "오늘 점심 11:00~14:00 · 마감까지 1시간");
  assert.equal(lunchTimeText(shop(0.3, { lunchWindow: {} }), "wed", 12 * 60, t).text, "오늘 점심 영업 (시간은 핫페퍼에서 확인)");
  assert.equal(formatDuration(45, t), "45분");
});

test("결과 카드 가격 · 배지 · 길찾기", () => {
  assert.equal(priceRange(shop(0, { priceMin: 850, priceMax: 950 }), t), "850~950엔");
  assert.equal(priceRange(shop(0, { priceMin: 500, priceMax: null }), t), "500엔~");
  assert.equal(priceRange(shop(0, { priceMin: null, priceMax: null, typicalPrice: 1000 }), t), "1,000엔");
  assert.equal(priceBadge(shop(0, { priceMax: 950 })), "confirmed");
  assert.equal(priceBadge(shop(0, { priceMin: 800, priceMax: 1500, typicalPrice: 900 })), "ai"); // 대표 메뉴 단서로 판단
  assert.equal(priceBadge(shop(0, { priceMax: null, priceMin: 500 })), "ai");
  assert.equal(directionsUrl({ lat: 34.1, lng: 135.2 }),
    "https://www.google.com/maps/dir/?api=1&destination=34.1,135.2&travelmode=walking");
});

test("가격 상한 이하: 대표 메뉴 가격 → 없으면 점심 최고가", () => {
  assert.equal(underLimit(shop(0, { typicalPrice: 950, priceMax: 1500 }), 990), true); // 대표 메뉴가 기준
  assert.equal(underLimit(shop(0, { typicalPrice: 1100, priceMax: 900 }), 990), false);
  assert.equal(underLimit(shop(0, { priceMax: 1190 }), 1190), true);
  assert.equal(underLimit(shop(0, { priceMax: 1190 }), 990), false);
  assert.equal(underLimit(shop(0, { priceMax: null, priceMin: 500 }), 1190), false); // '500円～'는 끝을 모름
});

test("가격 단계: 단계마다 반경을 다시 고르고, 2km 안 5곳 미만이면 잠금", () => {
  const shops = [
    ...many(4, 0.5, { priceMax: 780 }), // 790 이하 4곳
    ...many(10, 0.5, { priceMax: 950 }),
    ...many(12, 0.8, { priceMax: 1150 }),
  ];
  const [t790, t990, t1190] = tierInfo(shops, HERE, "wed");
  assert.deepEqual([t790.count, t790.radiusKm, t790.locked], [4, 2, true]);
  assert.deepEqual([t990.count, t990.radiusKm, t990.locked], [14, 2, false]);
  assert.deepEqual([t1190.count, t1190.radiusKm, t1190.locked], [26, 1, false]);
});

test("장르는 우리 말로, 모르는 장르는 그대로", () => {
  assert.equal(genreLabel("居酒屋", t), "이자카야");
  assert.equal(genreLabel("お好み焼き・もんじゃ", t), "오코노미야키");
  assert.equal(genreLabel("新ジャンル", t), "新ジャンル");
});

test("동네 이름은 가장 가까운 가게의 지역", () => {
  const near = { ...shop(0.2, { areaCode: "Y315" }), km: 0.2, walk: 4 };
  const far = { ...shop(0.9), km: 0.9, walk: 15 };
  assert.equal(areaName([far, near], t), "난바");
  assert.equal(areaName([], t), null);
});

test("동네 골라서 보기: 동네마다 가게들의 가운데, 가게 많은 순 (모르는 동네는 뺌)", () => {
  const mk = (id, areaCode, lat, lng) => ({ id, areaCode, lat, lng, lunchDays: "OOOOOXX", lunchWindow: {} });
  const centers = areaCenters([mk("a", "Y315", 34.66, 135.50), mk("b", "Y315", 34.68, 135.52), mk("c", "Y300", 34.70, 135.49), mk("d", "Z999", 1, 1)]);
  assert.deepEqual(centers.map((c) => [c.code, c.count]), [["Y315", 2], ["Y300", 1]]);
  assert.ok(Math.abs(centers[0].point.lat - 34.67) < 1e-9 && Math.abs(centers[0].point.lng - 135.51) < 1e-9);
});

test("점심이 끝난 뒤 다음 점심: 내일 가장 이른 시작, 주말에 쉬면 월요일", () => {
  const w = (start) => ({ start, end: "15:00", last_order: null });
  const shops = [
    { lunchDays: "OOOOOXX", lunchWindow: { mon: w("11:30"), fri: w("11:30") } },
    { lunchDays: "OOOOOXX", lunchWindow: { mon: w("11:00"), fri: w("11:15") } },
  ];
  assert.deepEqual(nextLunch(shops, "thu"), { days: 1, day: "fri", start: "11:15" });
  assert.deepEqual(nextLunch(shops, "fri"), { days: 3, day: "mon", start: "11:00" });
  assert.equal(nextLunch([], "mon"), null);
});
