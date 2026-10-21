// 여기 갈래요 · 다녀왔어요? 규칙 테스트. 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { canSubmit, chosenLabel, EMPTY_ANSWERS, enqueue, feedbackBody, OUTBOX_MAX, settled } from "./visits.ts";

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
  assert.equal(chosenLabel("2026-10-21T03:10:00Z", NOW), "오늘 12:10");
  assert.equal(chosenLabel("2026-10-20T03:05:00Z", NOW), "어제 12:05");
  assert.equal(chosenLabel("2026-10-18T23:30:00Z", NOW), "10/19 08:30");
});
