// 손잡이 스와이프 규칙 테스트. 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { cardTouchAction, swipeAction } from "./swipe.ts";

test("손잡이: 아래로 끌면 접고, 위로 끌면 펼치고, 짧으면 누른 것", () => {
  assert.equal(swipeAction(60), "collapse");
  assert.equal(swipeAction(-45), "expand");
  assert.equal(swipeAction(12), null);
  assert.equal(swipeAction(-5), null);
});

test("결과 카드: 접혀 있으면 어디서든 끌기, 맨 위면 아래로 끌어 접기, 내려 본 상태면 스크롤만", () => {
  assert.equal(cardTouchAction(true, true), "none");
  assert.equal(cardTouchAction(true, false), "none");
  assert.equal(cardTouchAction(false, true), "pan-down");
  assert.equal(cardTouchAction(false, false), "auto");
});
