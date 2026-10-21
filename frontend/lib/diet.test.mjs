// 알레르기 · 식사 제한 문장 테스트. 실행: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { dietPhrases, EMPTY_DIET, hasDiet, parseDiet } from "./diet.ts";
import ko from "../public/i18n/ko.json" with { type: "json" };
import en from "../public/i18n/en.json" with { type: "json" };

test("고른 게 없으면 문장도 없음", () => {
  assert.equal(hasDiet(EMPTY_DIET), false);
  assert.deepEqual(dietPhrases(EMPTY_DIET), []);
});

test("알레르기는 고른 순서와 상관없이 같은 순서로 한 문장에", () => {
  const phrases = dietPhrases({ allergens: ["peanut", "shrimp"], style: "none" });
  assert.equal(phrases.length, 2);
  assert.equal(phrases[0].ja, "えび・落花生（ピーナッツ）のアレルギーがあります。少量でも食べられません。");
  assert.equal(phrases[1].ja, "えび・落花生（ピーナッツ）が入っていない料理はありますか？");
  assert.deepEqual(phrases[0].items, ["shrimp", "peanut"]);
});

test("식사 방식은 하나, 알레르기와 같이 고르면 알레르기가 먼저", () => {
  const phrases = dietPhrases({ allergens: ["egg"], style: "halal" });
  assert.deepEqual(phrases.map((p) => p.meaning), ["diet.allergyHave", "diet.allergyAsk", "diet.halalHave", "diet.halalAsk"]);
  assert.match(phrases[2].ja, /豚肉とお酒/);
  assert.equal(dietPhrases({ allergens: [], style: "vegan" })[0].meaning, "diet.veganHave");
});

test("저장된 값에서 모르는 건 버림", () => {
  assert.deepEqual(parseDiet('{"allergens":["egg","poison",3],"style":"keto"}'), { allergens: ["egg"], style: "none" });
  assert.deepEqual(parseDiet("not json"), EMPTY_DIET);
  assert.deepEqual(parseDiet(null), EMPTY_DIET);
});

test("뜻 문구가 한국어 · 영어에 다 있고, 알레르기 문장에는 {items} 자리가 있음", () => {
  const all = dietPhrases({ allergens: ["milk"], style: "vegetarian" })
    .concat(dietPhrases({ allergens: [], style: "vegan" }), dietPhrases({ allergens: [], style: "halal" }));
  for (const p of all) {
    assert.ok(ko[p.meaning], p.meaning);
    assert.ok(en[p.meaning], p.meaning);
    if (p.items) assert.match(ko[p.meaning], /\{items\}/);
  }
});
