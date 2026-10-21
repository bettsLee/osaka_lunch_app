// 여기 갈래요(S4) · 다녀왔어요?(S5) 규칙. 화면 · 네트워크와 떨어진 순수 함수라 테스트하기 쉬움
import type { T } from "./i18n";

export type VisitDraft = {
  id: string; // 화면이 만든 id. 저장을 다시 보내도 서버에는 한 번만 남음
  shopId: string;
  shopName: string;
  source: "roulette" | "list";
  distanceKm: number;
  priceLimit: number;
  chosenAt: string; // ISO 시각
};

export type PendingVisit = { id: string; shopId: string; shopName: string; priceLimit: number | null; chosenAt: string };

export type Answers = { visited: boolean | null; openOk: boolean | null; priceOk: boolean | null };

export const EMPTY_ANSWERS: Answers = { visited: null, openOk: null, priceOk: null };
export const OUTBOX_MAX = 20; // 보관해 두는 '여기 갈래요' 최대 수
export const OUTBOX_KEEP_MS = 3 * 24 * 60 * 60 * 1000; // 서버가 3일 넘은 기록은 받지 않음

// 안 갔으면 바로 보낼 수 있고, 다녀왔으면 영업 · 가격 두 질문에 다 답해야 함
export function canSubmit(a: Answers): boolean {
  return a.visited === false || (a.visited === true && a.openOk !== null && a.priceOk !== null);
}

export function feedbackBody(a: Answers): { visited: boolean; openOk: boolean | null; priceOk: boolean | null } {
  if (a.visited !== true) return { visited: false, openOk: null, priceOk: null };
  return { visited: true, openOk: a.openOk, priceOk: a.priceOk };
}

// 저장 대기열에 넣기: 같은 id는 한 번만, 3일 지난 것은 버림, 최근 것 위주로 OUTBOX_MAX개까지
export function enqueue(queue: VisitDraft[], draft: VisitDraft, now: Date): VisitDraft[] {
  const fresh = queue.filter(
    (v) => v.id !== draft.id && now.getTime() - new Date(v.chosenAt).getTime() < OUTBOX_KEEP_MS,
  );
  return [...fresh, draft].slice(-OUTBOX_MAX);
}

// 서버 응답을 보고 대기열에서 뺄지: 저장됨(200 · 201) 또는 다시 보내도 소용없음(400 · 409)이면 뺌
export function settled(status: number): boolean {
  return status === 200 || status === 201 || status === 400 || status === 409;
}

// 취소 요청 응답을 보고 대기열에서 뺄지: 취소됨(204), 저장된 적 없음(404), 이미 답함(409)
export function cancelSettled(status: number): boolean {
  return status === 204 || status === 404 || status === 409;
}

// 홈의 '○○에 가는 중' (10/22 도그푸딩): 여기 갈래요 뒤 1시간까지. 그 뒤로는 '다녀왔어요?'로 물음
export type Going = { id: string; shopId: string; shopName: string; lat: number; lng: number; walk: number; chosenAt: string };
export const GOING_FOR_MS = 60 * 60 * 1000; // 서버의 ASK_AFTER(1시간)와 같음

export function stillGoing(g: Going | null, now: Date): Going | null {
  return g && now.getTime() - new Date(g.chosenAt).getTime() < GOING_FOR_MS ? g : null;
}

// 고른 시각 (오사카 시간 12:10)
export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso));
}

// S5 위쪽의 '오늘 12:10 · 여기 갈래요' (오사카 시간)
export function chosenLabel(chosenAt: string, now: Date, t: T): string {
  const fmt = (d: Date, opt: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", ...opt }).format(d);
  const when = new Date(chosenAt);
  const day = (d: Date) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const time = fmt(when, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (day(when) === day(now)) return t("visit.today", { time });
  if (day(when) === day(yesterday)) return t("visit.yesterday", { time });
  const [, m, d] = day(when).split("-");
  return t("visit.date", { m: Number(m), d: Number(d), time });
}
