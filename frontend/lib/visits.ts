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

// arrived · openOk: 도착했어요로 이미 다녀온 기록이면 질문 카드는 남은 것(영업 · 가격)만 물음
export type PendingVisit = {
  id: string;
  shopId: string;
  shopName: string | null; // 서버가 24시간 지나면 비움 (10/24 리크루트 답). 화면은 그날 가게 목록의 이름을 먼저 씀
  priceLimit: number | null;
  chosenAt: string;
  arrived?: boolean;
  openOk?: boolean | null;
};

export type Answers = { visited: boolean | null; openOk: boolean | null; priceOk: boolean | null };

export const EMPTY_ANSWERS: Answers = { visited: null, openOk: null, priceOk: null };
export const OUTBOX_MAX = 20; // 보관해 두는 '여기 갈래요' 최대 수
export const OUTBOX_KEEP_MS = 3 * 24 * 60 * 60 * 1000; // 서버가 3일 넘은 기록은 받지 않음

// 안 갔으면 바로 보낼 수 있고, 다녀왔으면 영업 · 가격 두 질문에 다 답해야 함 (영업을 안 했으면 가격은 알 수 없어서 빼도 됨)
export function canSubmit(a: Answers): boolean {
  return a.visited === false || (a.visited === true && a.openOk !== null && (a.openOk === false || a.priceOk !== null));
}

// again: 또 갈래요 (10/22 결정). 눌렀을 때만 true, 아니면 답 없음(null). 안 갔거나 닫혀 있었으면 묻지 않음
export type FeedbackBody = { visited: boolean; openOk: boolean | null; priceOk: boolean | null; again: boolean | null };
export function feedbackBody(a: Answers, again = false): FeedbackBody {
  if (a.visited !== true) return { visited: false, openOk: null, priceOk: null, again: null };
  const open = a.openOk !== false;
  return { visited: true, openOk: a.openOk, priceOk: open ? a.priceOk : null, again: open && again ? true : null };
}

// 이 답으로 도감에 새로 들어가는지: 다녀왔고 닫혀 있지 않았음 (10/23 결정). 도착했어요로 온 기록은 그때 이미 들어감
export function addsToZukan(body: FeedbackBody, arrived: boolean): boolean {
  return body.visited === true && body.openOk !== false && !arrived;
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

// 도착 요청 응답을 보고 대기열에서 뺄지: 도착함(204), 잘못된 요청(400), 저장된 적 없음(404), 취소했거나 이미 답함(409)
export function arriveSettled(status: number): boolean {
  return status === 204 || status === 400 || status === 404 || status === 409;
}

// 여기 갈래요로 정한 가게 (10/22 도그푸딩: 지도의 파란 핀): 여기 갈래요 뒤 1시간까지. 그 뒤로는 '다녀왔어요?'로 물음
export type Going = {
  id: string;
  shopId: string;
  shopName: string;
  lat: number;
  lng: number;
  walk: number;
  chosenAt: string;
  priceLimit?: number; // 도착했어요에서 '가격이 n엔 이하였는지'를 말할 때
};
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

// 도착했어요 자동 판단 (10/22 결정: 버튼 + 앱을 열 때 가게 근처면 자동). 위치는 휴대폰 안에서만 비교함
export const ARRIVE_M = 60; // 가게에서 이만큼 안이면 도착 (10/22 결정: 80m는 실제로 써 보니 살짝 빨라서 60m)
export const ARRIVE_MAX_ACCURACY_M = 100; // GPS 오차가 이보다 크면 자동으로 판단하지 않음 (빌딩 사이에서 튀는 값. 버튼은 그대로)

export function arrivedNear(distanceM: number, accuracyM: number): boolean {
  return accuracyM <= ARRIVE_MAX_ACCURACY_M && distanceM <= ARRIVE_M;
}

// 정한 가게 카드의 남은 거리 (10/22 도그푸딩: 내비게이션처럼). 1km 안은 10m 단위, 그 밖은 0.1km 단위
export function distanceLabel(m: number): string {
  const tens = Math.max(10, Math.round(m / 10) * 10);
  return tens < 1000 ? `${tens}m` : `${(Math.round(m / 100) / 10).toFixed(1)}km`;
}
