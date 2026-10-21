// Spring Boot 서버(Render) 호출. 사용자는 Supabase 익명 로그인으로 구분하고 그 토큰을 서버에 보냄
// Render 무료 서버는 쉬면 잠들어서: 앱을 열 때 미리 깨우고, '여기 갈래요'는 기다리지 않게 뒤에서 저장(실패하면 보관 후 다시)
import { GoTrueClient } from "@supabase/auth-js";
import { isIOS, keyBytes, pushState, subscriptionBody, type PushState } from "./push";
import { enqueue, settled, type PendingVisit, type VisitDraft } from "./visits";
import type { ZukanVisit } from "./zukan";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const OUTBOX_KEY = "osaka-lunch-visit-outbox";

let auth: GoTrueClient | null = null;

function authClient(): GoTrueClient {
  if (!SUPABASE_URL || !KEY) throw new Error("Supabase 설정이 없어요");
  auth ??= new GoTrueClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: { apikey: KEY },
    storageKey: "osaka-lunch-auth",
    persistSession: true, // 같은 휴대폰이면 계속 같은 익명 사용자
    autoRefreshToken: true,
  });
  return auth;
}

// 로그인 토큰. 처음이면 가입 없이 익명으로 로그인 (와이어프레임 원칙 4: 가입 없음)
async function accessToken(): Promise<string> {
  const client = authClient();
  const { data } = await client.getSession();
  if (data.session) return data.session.access_token;
  const { data: signed, error } = await client.signInAnonymously();
  if (error || !signed.session) throw error ?? new Error("익명 로그인에 실패했어요");
  return signed.session.access_token;
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_URL) throw new Error("NEXT_PUBLIC_API_URL 이 없어요");
  const token = await accessToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
}

// 앱을 열 때 서버를 깨워 둠 (응답은 보지 않음)
export function wakeServer(): void {
  if (API_URL) fetch(`${API_URL}/health`, { mode: "no-cors" }).catch(() => {});
}

function readOutbox(): VisitDraft[] {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeOutbox(queue: VisitDraft[]): void {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(queue));
  } catch {
    // 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)면 이번 한 번만 보냄
  }
}

let flushing: Promise<void> | null = null;

// 보관해 둔 '여기 갈래요'를 차례로 보냄. 저장됐거나 다시 보내도 소용없는 것만 뺌
export function flushVisits(): Promise<void> {
  flushing ??= (async () => {
    for (const draft of readOutbox()) {
      try {
        const res = await call("/api/visits", { method: "POST", body: JSON.stringify(draft) });
        if (!settled(res.status)) break; // 서버 문제면 다음에 다시
        writeOutbox(readOutbox().filter((v) => v.id !== draft.id));
      } catch {
        break; // 연결이 안 되면 다음에 다시
      }
    }
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

// 여기 갈래요: 먼저 보관하고 뒤에서 보냄 (화면은 기다리지 않음)
export function saveVisit(draft: VisitDraft): void {
  writeOutbox(enqueue(readOutbox(), draft, new Date()));
  void (flushing ? flushing.then(flushVisits) : flushVisits()); // 보내는 중이었으면 끝난 뒤 이것까지
}

// 지금 물어볼 '다녀왔어요?' (없으면 null)
export async function fetchPendingVisit(): Promise<PendingVisit | null> {
  await flushVisits();
  const res = await call("/api/visits/pending");
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`다녀왔어요? 기록을 불러오지 못했어요 (${res.status})`);
  return res.json();
}

export async function sendFeedback(
  id: string,
  body: { visited: boolean; openOk: boolean | null; priceOk: boolean | null },
): Promise<void> {
  const res = await call(`/api/visits/${id}/feedback`, { method: "PUT", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`답을 보내지 못했어요 (${res.status})`);
}

// 의견 보내기 (설정 S8, 10/21 결정: 앱 안 입력칸). 하루 5개를 넘으면 "limit"
export async function sendOpinion(message: string, lang: string): Promise<"sent" | "limit"> {
  const res = await call("/api/opinions", { method: "POST", body: JSON.stringify({ message, lang }) });
  if (res.status === 429) return "limit";
  if (!res.ok) throw new Error(`의견을 보내지 못했어요 (${res.status})`);
  return "sent";
}

// 도감(S6): '네, 다녀왔어요'라고 답한 기록 (최근 것부터)
export async function fetchZukan(): Promise<ZukanVisit[]> {
  await flushVisits();
  const res = await call("/api/visits/zukan");
  if (!res.ok) throw new Error(`도감을 불러오지 못했어요 (${res.status})`);
  return res.json();
}

// 한국어 · 영어가 아닌 휴대폰 언어의 문구. 서버가 처음 한 번 AI로 번역해 저장해 둔 것 (로그인 필요 없음)
export async function fetchTranslation(lang: string): Promise<Record<string, string> | null> {
  if (!API_URL) return null;
  const res = await fetch(`${API_URL}/api/i18n/${encodeURIComponent(lang)}`);
  if (!res.ok) return null;
  const body: { lang?: string; messages?: unknown } = await res.json();
  return body.lang === lang && body.messages && typeof body.messages === "object" ? (body.messages as Record<string, string>) : null;
}

// '다녀왔어요?' 알림: 이 브라우저에서 지금 할 수 있는 것
export function currentPushState(): PushState {
  return pushState({
    configured: Boolean(API_URL && VAPID_KEY),
    supported: "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    ios: isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints),
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    permission: "Notification" in window ? Notification.permission : "default",
  });
}

// 서비스 워커를 등록하고 구독(없으면 새로)해서 서버에 저장. 서버는 같은 브라우저면 한 줄만 둠
async function saveSubscription(): Promise<void> {
  await navigator.serviceWorker.register("/push-sw.js");
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY ?? "") }));
  const body = subscriptionBody(sub.toJSON());
  if (!body) throw new Error("알림 구독 정보가 없어요");
  const res = await call("/api/push/subscriptions", { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`알림 설정을 저장하지 못했어요 (${res.status})`);
}

// '알림 받기' 버튼. 권한 묻기는 버튼을 누른 그 순간에 해야 해서(사파리) 맨 먼저 부름
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "ask";
  await saveSubscription();
  return "on";
}

// 앱을 열 때: 이미 허용했으면 구독을 다시 저장 (익명 사용자가 바뀌었거나 브라우저가 구독을 새로 만든 경우)
export function syncPush(): void {
  if (currentPushState() === "on") saveSubscription().catch(() => {});
}
