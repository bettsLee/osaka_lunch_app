import { test } from "node:test";
import assert from "node:assert/strict";
import ko from "../public/i18n/ko.json" with { type: "json" };
import en from "../public/i18n/en.json" with { type: "json" };
import { merge, normalizeLang, pickLang, placeholders, translator } from "./i18n.ts";

test("휴대폰 언어 → 언어 코드 (중국어는 간체 · 번체)", () => {
  assert.equal(normalizeLang("ko-KR"), "ko");
  assert.equal(normalizeLang("en_US"), "en");
  assert.equal(normalizeLang("zh-CN"), "zh-Hans");
  assert.equal(normalizeLang("zh-Hans-CN"), "zh-Hans");
  assert.equal(normalizeLang("zh-TW"), "zh-Hant");
  assert.equal(normalizeLang("zh-Hant-HK"), "zh-Hant");
  assert.equal(normalizeLang("fil-PH"), "fil");
  assert.equal(pickLang(["vi-VN", "en-US"]), "vi");
  assert.equal(pickLang(["", "ne"]), "ne");
  assert.equal(pickLang([]), "en");
});

test("문구 채우기", () => {
  const t = translator(ko);
  assert.equal(t("common.walk", { n: 6 }), "걸어서 6분");
  assert.equal(t("home.count", { radius: 1.5, limit: "990", n: 23 }), "1.5km 안 990엔 이하 23곳");
  assert.equal(t("없는.키"), "없는.키");
});

test("번역본 덮어쓰기: 빠진 문구 · {자리}가 다른 문구는 기본(영어) 그대로", () => {
  const vi = { "common.walk": "Đi bộ {n} phút", "home.count": "{n} quán", "home.spin": "  " };
  const m = merge(en, vi);
  assert.equal(m["common.walk"], "Đi bộ {n} phút");
  assert.equal(m["home.count"], en["home.count"]); // {radius} · {limit}가 빠져서 버림
  assert.equal(m["home.spin"], en["home.spin"]); // 빈 문구
  assert.equal(m["home.retry"], en["home.retry"]); // 없는 키
  assert.equal(Object.keys(m).length, Object.keys(en).length);
});

test("영어 문구는 원문(한국어)과 키 · {자리}가 모두 같음", () => {
  assert.deepEqual(Object.keys(en).sort(), Object.keys(ko).sort());
  for (const k of Object.keys(ko)) assert.deepEqual(placeholders(en[k]), placeholders(ko[k]), k);
});
