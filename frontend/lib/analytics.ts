// 지표 수집 (Amplitude). 이벤트 이름은 PRD 9장 그대로. 키가 없으면(내 컴퓨터 등) 아무것도 보내지 않음
// 라이브러리가 커서(약 65kB) 첫 화면을 그린 뒤 따로 불러오고, 그 전에 생긴 이벤트는 모아 뒀다가 원래 시각으로 보냄
type Amplitude = typeof import("@amplitude/analytics-browser");

const KEY = process.env.NEXT_PUBLIC_AMPLITUDE_API_KEY;

export type EventName =
  | "app_open"
  | "roulette_spin"
  | "result_view"
  | "go_here_click"
  | "directions_click"
  | "menu_link_click"
  | "list_open"
  | "feedback_submit"
  | "price_limit_change"
  | "push_permission" // '알림 받기'를 누른 결과 (허용률 확인용)
  | "order_open" // 결과 카드에서 '주문 도우미' (실험 1: 주문 문장 A/B)
  | "zukan_open" // 도감 탭
  | "zukan_add" // '네, 다녀왔어요'로 도감에 한 곳 추가
  | "share_card_create" // 공유 카드를 저장하거나 공유함
  | "share_open" // 공유 카드의 링크로 들어옴
  | "list_item_click" // 목록에서 직접 고름 (룰렛 vs 목록)
  | "map_pin_click" // 지도 핀을 눌러 결과 카드를 봄
  | "opinion_submit" // 설정에서 의견을 보냄 (내용은 보내지 않고 글자 수만)
  | "visit_cancel" // 여기 갈래요 취소 (cancel: 직접 취소 · changed: 다른 가게로 다시 정함)
  | "visit_arrive" // 도착했어요 (auto: 앱을 열 때 가게 근처 · manual: 버튼). 도감에 바로 들어감
  | "arrive_answer" // 도착했어요에서 '지금 영업하고 있나요?'에 답함
  | "app_error"; // 화면에서 난 오류 (원인 확인용)

type Props = Record<string, string | number | boolean | null>;

let started = false;
let amp: Amplitude | null = null;
const waiting: { name: EventName; props?: Props; time: number }[] = [];

export function startAnalytics(): void {
  if (started || !KEY) return;
  started = true;
  void import("@amplitude/analytics-browser").then((a) => {
    a.init(KEY, {
      // 세션(재방문 계산용)만 자동으로 모으고, 나머지는 우리가 정한 이벤트만 보냄
      autocapture: {
        sessions: true,
        attribution: false,
        pageViews: false,
        fileDownloads: false,
        formInteractions: false,
        elementInteractions: false,
        frustrationInteractions: false,
        networkTracking: false,
        webVitals: false,
        performanceTracking: false,
        pageUrlEnrichment: false,
      },
      trackingOptions: { ipAddress: false }, // IP로 위치를 추정하지 않게
    });
    amp = a;
    for (const e of waiting.splice(0)) a.track(e.name, e.props, { time: e.time });
  });
}

export function track(name: EventName, props?: Props): void {
  if (!started) return;
  if (amp) amp.track(name, props);
  else waiting.push({ name, props, time: Date.now() });
}

// 오류 기록: 같은 오류는 한 번만, 한 번 열 때 최대 10개 (오류가 이어져도 이벤트가 넘치지 않게)
const seenErrors = new Set<string>();
export function trackError(where: string, error: unknown): void {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 200);
  const key = `${where}|${message}`;
  if (seenErrors.has(key) || seenErrors.size >= 10) return;
  seenErrors.add(key);
  track("app_error", { where, message });
}

// 잡지 못한 오류 · 처리 안 된 Promise 오류
let watching = false;
export function watchErrors(): void {
  if (watching) return;
  watching = true;
  window.addEventListener("error", (e) => trackError("window", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => trackError("promise", e.reason));
}
