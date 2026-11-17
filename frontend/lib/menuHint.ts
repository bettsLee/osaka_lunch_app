// 결과 카드의 대표 메뉴 (11/17 결정, OL-65). 서버가 Gemini 구글 지도 그라운딩으로 물어본 답
// - 구글 약관상 답은 저장하지 않음: 로컬 저장소에 두지 않고, 미리 받아 둔 것도 카드에 한 번 보여 주면 버림
// - 룰렛이 도는 동안(약 3초) 미리 물어봐서 카드가 열릴 때 기다리는 시간을 줄임 (11/17 실험: 한 번에 평균 3.6초)

export type MenuHintStatus = "ok" | "unknown" | "unavailable"; // unavailable: 하루 한도 · 서버 오류 · 시간 초과
export type MenuHintPlace = "open" | "no_lunch" | "closed" | "unknown"; // 구글 지도 기준 평일 점심 영업
export type MenuHintSource = { title: string; uri: string };
export type MenuHint = { status: MenuHintStatus; place: MenuHintPlace; menus: string[]; sources: MenuHintSource[] };

export const UNAVAILABLE_HINT: MenuHint = { status: "unavailable", place: "unknown", menus: [], sources: [] };

const STATUSES: readonly string[] = ["ok", "unknown", "unavailable"];
const PLACES: readonly string[] = ["open", "no_lunch", "closed", "unknown"];

// 서버 응답을 믿지 않고 모양을 확인 (링크는 https만, 글자는 짧게)
export function readMenuHint(body: unknown): MenuHint {
  if (!body || typeof body !== "object") return UNAVAILABLE_HINT;
  const b = body as Record<string, unknown>;
  const status = typeof b.status === "string" && STATUSES.includes(b.status) ? (b.status as MenuHintStatus) : "unavailable";
  const place = typeof b.place === "string" && PLACES.includes(b.place) ? (b.place as MenuHintPlace) : "unknown";
  const menus = Array.isArray(b.menus)
    ? b.menus.filter((m): m is string => typeof m === "string" && m.trim() !== "" && m.length <= 80).slice(0, 3)
    : [];
  const sources = Array.isArray(b.sources)
    ? b.sources
        .filter((s): s is MenuHintSource => {
          const o = s as Record<string, unknown> | null;
          return !!o && typeof o.title === "string" && o.title.trim() !== "" && typeof o.uri === "string" && o.uri.startsWith("https://");
        })
        .slice(0, 3)
    : [];
  // 메뉴가 있어도 구글 지도 출처가 없으면 보여 주지 않음 (표시 규칙: 내용 바로 아래 출처)
  if (status === "ok" && (menus.length === 0 || sources.length === 0)) return { status: "unknown", place, menus: [], sources };
  return { status, place, menus: status === "ok" ? menus : [], sources };
}

// 메뉴를 못 받았을 때: 구글맵에서 가게 이름으로 찾기 (호출 없음 · 제한 없음). 출처가 있으면 그 장소로 바로
export function mapsLink(hint: MenuHint | null, shopName: string): string {
  const place = hint?.sources[0]?.uri;
  return place ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopName)}`;
}

type Fetcher = (shopId: string, lang: string) => Promise<MenuHint>;
const early = new Map<string, Promise<MenuHint>>(); // 룰렛 중에 미리 물어본 것 (가게 · 언어별, 카드가 가져가면 지움)
const key = (shopId: string, lang: string) => `${lang}|${shopId}`;

// 룰렛이 결과를 정한 순간 미리 물어봄. 이미 물어보는 중이면 그대로
export function prefetchMenuHint(shopId: string, lang: string, fetcher: Fetcher): void {
  const k = key(shopId, lang);
  if (!early.has(k)) early.set(k, fetcher(shopId, lang));
  while (early.size > 3) early.delete(early.keys().next().value as string); // 빠르게 다시 돌려도 몇 개만
}

// 카드가 열릴 때: 미리 물어본 게 있으면 그걸(한 번만), 없으면 지금 물어봄
export function takeMenuHint(shopId: string, lang: string, fetcher: Fetcher): { hint: Promise<MenuHint>; prefetched: boolean } {
  const k = key(shopId, lang);
  const ready = early.get(k);
  early.delete(k);
  return ready ? { hint: ready, prefetched: true } : { hint: fetcher(shopId, lang), prefetched: false };
}
