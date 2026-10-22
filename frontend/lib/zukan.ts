// S6 도감 · S7 공유 카드 규칙 (10/21 결정: '네, 다녀왔어요'라고 답한 곳만 · 카드 칸은 장르 · 가격)
// 서버에는 고른 기록만 있어서, 지도 · 장르 · 가격은 화면이 불러 둔 가게 목록에서 찾아 붙임
import type { LunchShop } from "./lunch";

export type ZukanVisit = { shopId: string; shopName: string; chosenAt: string; again?: boolean | null };
// liked: 또 갈래요 ♥ (그 가게 기록 중 하나라도 켜져 있으면)
export type ZukanItem = { shopId: string; name: string; lastAt: string; times: number; liked: boolean; shop: LunchShop | null };

export const CARD_TILES = 6;

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
      items.set(v.shopId, { shopId: v.shopId, name: v.shopName, lastAt: v.chosenAt, times: 1, liked: v.again === true, shop: byId.get(v.shopId) ?? null });
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

// 카드 · 목록에 쓰는 가게 가격: 대표 메뉴 → 점심 최고가 (목록 핀과 같은 기준)
function priceOf(shop: LunchShop | null): number | null {
  return shop?.typicalPrice ?? shop?.priceMax ?? null;
}

// 평균 가격 (가격을 아는 가게만, 10엔 단위 반올림). 하나도 없으면 null
export function averagePrice(items: ZukanItem[]): number | null {
  const prices = items.map((it) => priceOf(it.shop)).filter((p): p is number => p !== null);
  if (!prices.length) return null;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length / 10) * 10;
}

// 카드 칸: 최근 6곳의 장르 · 가격 (지금 가게 목록에 없는 곳은 장르 · 가격을 몰라서 뺌). 모자라면 빈 칸
export function cardTiles(items: ZukanItem[]): ({ genre: string | null; price: number | null } | null)[] {
  const tiles: ({ genre: string | null; price: number | null } | null)[] = items
    .filter((it) => it.shop !== null)
    .slice(0, CARD_TILES)
    .map((it) => ({ genre: it.shop?.genre || null, price: priceOf(it.shop) }));
  while (tiles.length < CARD_TILES) tiles.push(null);
  return tiles;
}

// 목록의 날짜 (오사카 시간 월 · 일)
export function monthDay(iso: string): { m: number; d: number } {
  const [, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso))
    .split("-");
  return { m: Number(m), d: Number(d) };
}

// 도감 필터 (10/22 결정: 동네 · 가격 · 음식 종류 + ♥ 또 갈 곳). 음식 종류는 핫페퍼 장르 그대로
export type ZukanFilter = { area: string | null; maxPrice: number | null; genre: string | null; liked: boolean };
export const NO_FILTER: ZukanFilter = { area: null, maxPrice: null, genre: null, liked: false };
export const FILTER_PRICES = [790, 990, 1190] as const; // 홈 가격 단계(PRICE_TIERS)와 같음 (테스트가 lunch.ts를 불러오지 않게 따로 둠)

export function isFiltering(f: ZukanFilter): boolean {
  return f.area !== null || f.maxPrice !== null || f.genre !== null || f.liked;
}

// 가격 필터는 가격을 아는 가게만 남김 (목록 · 카드와 같은 가격: 대표 메뉴 → 점심 최고가)
export function filterItems(items: ZukanItem[], f: ZukanFilter): ZukanItem[] {
  return items.filter((it) => {
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
