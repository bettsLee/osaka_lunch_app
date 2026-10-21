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
  | "price_limit_change";

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
