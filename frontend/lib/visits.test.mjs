// 여기 갈래요 · 다녀왔어요? 규칙 테스트. 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { arriveSettled, arrivedNear, cancelSettled, distanceLabel, canSubmit, chosenLabel, clockTime, EMPTY_ANSWERS, enqueue, feedbackBody, OUTBOX_MAX, settled, stillGoing } from "./visits.ts";
import ko from "../public/i18n/ko.json" with { type: "json" };
import { translator } from "./i18n.ts";

const t = translator(ko);

const NOW = new Date("2026-10-21T04:00:00Z"); // 오사카 13:00
const draft = (id, chosenAt = "2026-10-21T03:10:00Z") => ({
  id, shopId: "J1", shopName: "가게", source: "roulette", distanceKm: 0.4, priceLimit: 990, chosenAt,
});

test("다녀왔어요? 보내기 버튼이 켜지는 때", () => {
  assert.equal(canSubmit(EMPTY_ANSWERS), false);
  assert.equal(canSubmit({ ...EMPTY_ANSWERS, visited: false }), true);
  assert.equal(canSubmit({ visited: true, openOk: true, priceOk: null }), false);
  assert.equal(canSubmit({ visited: true, openOk: false, priceOk: true }), true);
});

test("안 갔으면 영업 · 가격은 비워서 보냄", () => {
  assert.deepEqual(feedbackBody({ visited: false, openOk: true, priceOk: true }), { visited: false, openOk: null, priceOk: null });
  assert.deepEqual(feedbackBody({ visited: true, openOk: true, priceOk: false }), { visited: true, openOk: true, priceOk: false });
});

test("저장 대기열: 같은 id는 한 번, 3일 지난 것은 버림, 개수 제한", () => {
  let q = enqueue([], draft("a"), NOW);
  q = enqueue(q, draft("a"), NOW);
  assert.deepEqual(q.map((v) => v.id), ["a"]);
  q = enqueue([draft("old", "2026-10-17T04:00:00Z"), ...q], draft("b"), NOW);
  assert.deepEqual(q.map((v) => v.id), ["a", "b"]);
  const many = Array.from({ length: OUTBOX_MAX + 5 }, (_, i) => draft(`v${i}`));
  assert.equal(many.reduce((acc, d) => enqueue(acc, d, NOW), []).length, OUTBOX_MAX);
});

test("서버 응답에 따라 대기열에서 뺌", () => {
  assert.deepEqual([200, 201, 400, 409].map(settled), [true, true, true, true]);
  assert.deepEqual([401, 500, 502, 503].map(settled), [false, false, false, false]); // 다시 보냄
});

test("다녀왔어요? 위쪽 시각 표시 (오사카 시간)", () => {
  assert.equal(chosenLabel("2026-10-21T03:10:00Z", NOW, t), "오늘 12:10");
  assert.equal(chosenLabel("2026-10-20T03:05:00Z", NOW, t), "어제 12:05");
  assert.equal(chosenLabel("2026-10-18T23:30:00Z", NOW, t), "10/19 08:30");
});

test("가는 중은 여기 갈래요 뒤 1시간까지", () => {
  const going = { id: "a", shopId: "J1", shopName: "가게", lat: 34.68, lng: 135.49, walk: 8, chosenAt: "2026-10-21T03:10:00Z" };
  assert.equal(stillGoing(going, new Date("2026-10-21T03:40:00Z")), going); // 30분 뒤
  assert.equal(stillGoing(going, new Date("2026-10-21T04:10:00Z")), null); // 1시간 뒤부터는 다녀왔어요?
  assert.equal(stillGoing(null, NOW), null);
  assert.equal(clockTime("2026-10-21T03:10:00Z"), "12:10"); // 오사카 시간
});

test("취소 요청은 취소됨 · 저장된 적 없음 · 이미 답함이면 끝, 서버 문제면 다시", () => {
  assert.equal(cancelSettled(204), true);
  assert.equal(cancelSettled(404), true);
  assert.equal(cancelSettled(409), true);
  assert.equal(cancelSettled(503), false);
  assert.equal(cancelSettled(401), false);
});

test("영업을 안 했으면 가격 답 없이 보낼 수 있고, 가격은 비워서 보냄", () => {
  assert.equal(canSubmit({ visited: true, openOk: false, priceOk: null }), true);
  assert.deepEqual(feedbackBody({ visited: true, openOk: false, priceOk: true }), { visited: true, openOk: false, priceOk: null });
});

test("도착 자동 판단: 80m 안이고 GPS 오차가 100m 이하일 때만", () => {
  assert.equal(arrivedNear(60, 30), true);
  assert.equal(arrivedNear(80, 100), true);
  assert.equal(arrivedNear(120, 20), false); // 아직 멀어요
  assert.equal(arrivedNear(40, 250), false); // 오차가 커서 믿을 수 없음
});

test("도착 요청은 서버 문제(5xx)일 때만 다시 보냄", () => {
  for (const code of [204, 400, 404, 409]) assert.equal(arriveSettled(code), true);
  for (const code of [401, 500, 502, 503]) assert.equal(arriveSettled(code), false);
});

test("남은 거리: 1km 안은 10m 단위, 그 밖은 0.1km 단위", () => {
  assert.equal(distanceLabel(3), "10m");
  assert.equal(distanceLabel(404), "400m");
  assert.equal(distanceLabel(996), "1.0km");
  assert.equal(distanceLabel(1260), "1.3km");
});
