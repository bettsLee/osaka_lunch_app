// '다녀왔어요?' 알림(웹 푸시) 규칙. 브라우저에 실제로 묻고 저장하는 건 api.ts, 여기는 판단만 (node 테스트용)

// unsupported: 알림을 못 씀 · install: 아이폰이라 홈 화면에 추가해야 함 · ask: 물어볼 수 있음 · on: 허용함 · blocked: 거절함
export type PushState = "unsupported" | "install" | "ask" | "on" | "blocked";

export type PushEnv = {
  configured: boolean; // 서버 주소 · VAPID 공개 키가 있음
  supported: boolean; // 서비스 워커 · PushManager · Notification 이 다 있음
  ios: boolean;
  standalone: boolean; // 홈 화면에서 연 앱
  permission: "default" | "granted" | "denied";
};

export function pushState(env: PushEnv): PushState {
  if (!env.configured) return "unsupported";
  if (env.ios && !env.standalone) return "install"; // 아이폰 · 아이패드는 홈 화면에 추가한 앱에서만 알림 가능 (iOS 16.4+)
  if (!env.supported) return "unsupported";
  if (env.permission === "granted") return "on";
  if (env.permission === "denied") return "blocked";
  return "ask";
}

// 아이패드는 데스크톱 모드에서 맥처럼 보여서 터치 여부로 구분
export function isIOS(userAgent: string, platform: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

// VAPID 공개 키(base64url) → 구독할 때 넘기는 바이트
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

export type SubscriptionBody = { endpoint: string; p256dh: string; auth: string };

// PushSubscription.toJSON() → 서버에 보낼 값. 빠진 게 있으면 null
export function subscriptionBody(json: { endpoint?: string; keys?: Record<string, string> }): SubscriptionBody | null {
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) return null;
  return { endpoint: json.endpoint, p256dh, auth };
}
