// S6 도감 규칙 (10/21 결정: '네, 다녀왔어요'라고 답한 곳만). 공유 카드(S7)는 10/22에 맛집 추천 링크로 바뀜 (lib/share.ts)
// 서버에는 고른 기록만 있어서, 이름 · 지도 · 장르 · 가격은 화면이 불러 둔 그날 가게 목록에서 찾아 붙임
// (10/24 리크루트 답: 핫페퍼 정보는 늘 최신으로. 서버에 저장한 이름은 24시간 뒤 비워짐) 목록에서 빠진 가게는 이름 없이 (null)
import type { LunchShop } from "./lunch";

export type ZukanVisit = { shopId: string; chosenAt: string; again?: boolean | null };
// liked: 또 갈래요 ♥ (그 가게 기록 중 하나라도 켜져 있으면)
export type ZukanItem = { shopId: string; name: string | null; lastAt: string; times: number; liked: boolean; shop: LunchShop | null };

// 같은 가게는 한 칸 (가장 최근에 간 날 · 몇 번 갔는지). 최근 것부터
export function collect(visits: ZukanVisit[], shops: LunchShop[]): ZukanItem[] {
  const byId = new Map(shops.map((s) => [s.id, s]));
  const items = new Map<string, ZukanItem>();
  for (const v of [...visits].sort((a, b) => b.chosenAt.localeCompare(a.chosenAt))) {
    const seen = items.get(v.shopId);
    if (seen) {
      seen.times += 1;
      seen.liked ||= v.again === true;
    } else {
      const shop = byId.get(v.shopId) ?? null;
      items.set(v.shopId, { shopId: v.shopId, name: shop?.name ?? null, lastAt: v.chosenAt, times: 1, liked: v.again === true, shop });
    }
  }
  return [...items.values()];
}

// 주로 다닌 동네: 동네를 아는 가게의 절반을 넘는 동네만 (10/22 도그푸딩: 후쿠시마 1곳 · 다른 동네 1곳인데 '후쿠시마'로 나왔음). 없으면 null
export function topArea(items: ZukanItem[]): string | null {
  const count = new Map<string, number>();
  let known = 0;
  for (const it of items) {
    const code = it.shop?.areaCode;
    if (!code) continue;
    known += 1;
    count.set(code, (count.get(code) ?? 0) + 1);
  }
  for (const [code, n] of count) if (n * 2 > known) return code;
  return null;
}

// 필터에 쓰는 가게 가격: 대표 메뉴 → 점심 최고가 (목록 핀과 같은 기준)
function priceOf(shop: LunchShop | null): number | null {
  return shop?.typicalPrice ?? shop?.priceMax ?? null;
}

// 오사카 시간의 연 · 월 · 일 · 시각
function osakaParts(date: Date): { y: number; m: number; d: number; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value]),
  );
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
}

// 목록의 날짜 · 시각 (10/22 결정: 도감에 언제 추가됐는지). '여기 갈래요'를 누른 시각 = 그날 점심
export function monthDayTime(iso: string): { m: number; d: number; time: string } {
  const { m, d, time } = osakaParts(new Date(iso));
  return { m, d, time };
}

// 기간 필터 (오사카 시간): 오늘 · 이번 주(월요일부터) · 이번 달
export type Period = "today" | "week" | "month";
export function inPeriod(iso: string, period: Period, now: Date): boolean {
  const a = osakaParts(new Date(iso));
  const b = osakaParts(now);
  if (period === "month") return a.y === b.y && a.m === b.m;
  const dayNo = (x: { y: number; m: number; d: number }) => Date.UTC(x.y, x.m - 1, x.d) / 86_400_000;
  if (period === "today") return dayNo(a) === dayNo(b);
  const monday = dayNo(b) - ((new Date(Date.UTC(b.y, b.m - 1, b.d)).getUTCDay() + 6) % 7);
  return dayNo(a) >= monday && dayNo(a) <= dayNo(b);
}

// 도감 필터 (10/22 결정: 동네 · 가격 · 음식 종류 + ♥ 또 갈 곳). 음식 종류는 핫페퍼 장르 그대로
export type ZukanFilter = { period: Period | null; area: string | null; maxPrice: number | null; genre: string | null; liked: boolean };
export const NO_FILTER: ZukanFilter = { period: null, area: null, maxPrice: null, genre: null, liked: false };
export const FILTER_PERIODS: Period[] = ["today", "week", "month"];
export const FILTER_PRICES = [790, 990, 1190] as const; // 홈 가격 단계(PRICE_TIERS)와 같음 (테스트가 lunch.ts를 불러오지 않게 따로 둠)

export function isFiltering(f: ZukanFilter): boolean {
  return f.period !== null || f.area !== null || f.maxPrice !== null || f.genre !== null || f.liked;
}

// 가격 필터는 가격을 아는 가게만 남김 (목록 · 카드와 같은 가격: 대표 메뉴 → 점심 최고가)
// 기간은 가장 최근에 간 날 기준 (목록 순서 · 날짜 표시와 같음)
export function filterItems(items: ZukanItem[], f: ZukanFilter, now: Date = new Date()): ZukanItem[] {
  return items.filter((it) => {
    if (f.period !== null && !inPeriod(it.lastAt, f.period, now)) return false;
    if (f.liked && !it.liked) return false;
    if (f.area !== null && it.shop?.areaCode !== f.area) return false;
    if (f.genre !== null && it.shop?.genre !== f.genre) return false;
    if (f.maxPrice !== null) {
      const p = priceOf(it.shop);
      if (p === null || p > f.maxPrice) return false;
    }
    return true;
  });
}

// 고를 수 있는 동네 · 종류: 도감에 있는 것만, 많은 순
export function filterOptions(items: ZukanItem[]): { areas: string[]; genres: string[] } {
  const rank = (values: (string | null | undefined)[]) => {
    const count = new Map<string, number>();
    for (const v of values) if (v) count.set(v, (count.get(v) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  };
  return { areas: rank(items.map((it) => it.shop?.areaCode)), genres: rank(items.map((it) => it.shop?.genre)) };
}
