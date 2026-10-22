// 맛집 추천 공유 규칙 테스트. 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { lunchHours, shareLink, sharedIds, SHARE_MAX } from "./share.ts";

test("링크에는 가게 번호만, 최대 10곳", () => {
  assert.equal(shareLink("https://a.app", ["J1", "J2"]), "https://a.app/?ref=share&s=J1,J2");
  const many = Array.from({ length: 12 }, (_, i) => `J${i}`);
  assert.equal(shareLink("https://a.app", many).split("s=")[1].split(",").length, SHARE_MAX);
});

test("받은 링크: 이상한 값은 버리고 겹치면 하나", () => {
  assert.deepEqual(sharedIds("?ref=share&s=J1,J2,J1,<script>,,J3"), ["J1", "J2", "J3"]);
  assert.deepEqual(sharedIds("?ref=share"), []);
});

test("점심 시간: 오늘 하면 오늘, 아니면 다음 영업일", () => {
  const shop = {
    lunchDays: "OOOOOXX",
    lunchWindow: { mon: { start: "11:00", end: "14:00", last_order: null }, sat: { start: "10:00", end: "15:00", last_order: null } },
  };
  assert.equal(lunchHours(shop, "mon"), "11:00~14:00");
  assert.equal(lunchHours(shop, "sat"), "11:00~14:00"); // 토요일은 점심 X → 다음 영업일(월)
  assert.equal(lunchHours({ lunchDays: "XXXXXXX", lunchWindow: {} }, "mon"), null);
});
