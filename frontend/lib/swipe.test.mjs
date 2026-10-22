// 손잡이 스와이프 규칙 테스트. 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { swipeAction } from "./swipe.ts";

test("손잡이: 아래로 끌면 접고, 위로 끌면 펼치고, 짧으면 누른 것", () => {
  assert.equal(swipeAction(60), "collapse");
  assert.equal(swipeAction(-45), "expand");
  assert.equal(swipeAction(12), null);
  assert.equal(swipeAction(-5), null);
});
