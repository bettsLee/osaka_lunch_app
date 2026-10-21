import { test } from "node:test";
import assert from "node:assert/strict";
import { isIOS, keyBytes, pushState, subscriptionBody } from "./push.ts";

const base = { configured: true, supported: true, ios: false, standalone: false, permission: "default" };

test("알림 상태: 설정 없음 → 아이폰 홈 화면 → 지원 → 권한 순서로 판단", () => {
  assert.equal(pushState({ ...base, configured: false }), "unsupported");
  assert.equal(pushState({ ...base, ios: true, supported: false }), "install"); // 사파리 탭: 홈 화면에 추가하면 됨
  assert.equal(pushState({ ...base, ios: true, standalone: true }), "ask");
  assert.equal(pushState({ ...base, ios: true, standalone: true, supported: false }), "unsupported"); // iOS 16.4 미만
  assert.equal(pushState({ ...base, supported: false }), "unsupported");
  assert.equal(pushState(base), "ask"); // 안드로이드 크롬은 탭에서도 됨
  assert.equal(pushState({ ...base, permission: "granted" }), "on");
  assert.equal(pushState({ ...base, permission: "denied" }), "blocked");
});

test("아이폰 · 아이패드 구분", () => {
  assert.equal(isIOS("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone", 5), true);
  assert.equal(isIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 5), true); // 아이패드 데스크톱 모드
  assert.equal(isIOS("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", "MacIntel", 0), false); // 맥
  assert.equal(isIOS("Mozilla/5.0 (Linux; Android 15; Pixel 9)", "Linux armv8l", 5), false);
});

test("VAPID 공개 키 → 65바이트 (0x04로 시작)", () => {
  const key = keyBytes("BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4");
  assert.equal(key.length, 65);
  assert.equal(key[0], 4);
});

test("구독 정보에서 서버에 보낼 값만", () => {
  assert.deepEqual(subscriptionBody({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "P", auth: "A" } }), {
    endpoint: "https://fcm.googleapis.com/x",
    p256dh: "P",
    auth: "A",
  });
  assert.equal(subscriptionBody({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "P" } }), null);
  assert.equal(subscriptionBody({ keys: { p256dh: "P", auth: "A" } }), null);
});
