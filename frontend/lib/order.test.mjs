// 주문 팁 고르기 테스트 (11/17). 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { ORDER_PHRASES, orderTip } from "./order.ts";

test("주문 팁: 같은 가게 · 같은 단계면 같은 문장, 단계가 바뀌면 다음 문장", () => {
  assert.equal(orderTip("J001", 0), orderTip("J001", 0));
  const i = ORDER_PHRASES.indexOf(orderTip("J001", 0));
  assert.equal(orderTip("J001", 1), ORDER_PHRASES[(i + 1) % ORDER_PHRASES.length]);
  assert.equal(orderTip("J001", 3), ORDER_PHRASES[(i + 3) % ORDER_PHRASES.length]);
  const starts = new Set(["J001", "J002", "J003", "J004", "J005", "J006"].map((id) => orderTip(id, 0)));
  assert.ok(starts.size > 1); // 가게마다 시작 문장이 다름
});
