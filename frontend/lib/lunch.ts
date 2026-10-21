// 홈 화면 규칙: 거리 · 오늘 점심 영업 · 반경 넓히기 · 보여줄 가격 (화면과 떨어진 순수 함수라 테스트하기 쉬움)

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Day = (typeof DAYS)[number];

export type LunchWindow = { start: string; end: string; last_order: string | null };

export type LunchShop = {
  id: string;
  name: string;
  genre: string;
  lat: number;
  lng: number;
  photoUrl: string | null;
  hotpepperUrl: string | null;
  areaCode: string | null;
  lunchDays: string; // 월~일 7글자 O / X / ?
  lunchWindow: Partial<Record<Day, LunchWindow | null>>;
  priceMin: number | null;
  priceMax: number | null;
  typicalPrice: number | null;
  priceEvidence: string | null; // AI가 가격을 판단한 원문 (결과 카드 '가격 원문 보기')
  catchText: string | null; // 가게 소개 한 줄 (핫페퍼 원문 그대로. 가게 설명은 번역하지 않음)
};

export type Point = { lat: number; lng: number };

// 반경은 1km에서 시작해 가게가 이보다 적으면 넓힘 (10/21 결정: 20곳 유지)
export const RADII_KM = [1, 1.5, 2];
export const MIN_SHOPS = 20;

// 가격 단계 (PRD: 790 / 990 / 1,190엔, 기본 990엔). 2km 안에 5곳이 안 되는 단계는 잠김
export const PRICE_TIERS = [790, 990, 1190] as const;
export const DEFAULT_LIMIT = 990;
export const MIN_TIER_SHOPS = 5;

// 상한 이하인 가게: 대표 메뉴 가격이 있으면 그걸로, 없으면 적힌 점심 최고가로 (10/21 결정 A)
// AI가 뽑은 가격 숫자로 계산하는 규칙. 990엔에서 AI 판정과 2,758곳 모두 같음을 확인
export function underLimit(shop: LunchShop, limit: number): boolean {
  if (shop.typicalPrice !== null) return shop.typicalPrice <= limit;
  return shop.priceMax !== null && shop.priceMax <= limit;
}

// 걸어서 n분: 직선거리에 길 돌아가는 만큼(1.3배)을 더해 분속 80m로 나눔 (일본 부동산 표기 기준 속도)
const DETOUR = 1.3;
const WALK_M_PER_MIN = 80;

// 핫페퍼 중지역 → 화면에 보여줄 동네 이름
const AREA_NAMES: Record<string, string> = {
  Y300: "우메다",
  Y301: "후쿠시마",
  Y305: "혼마치",
  Y310: "덴마",
  Y315: "난바",
  Y866: "구조",
};

// 핫페퍼 장르 → 화면 표시 이름 (가게 글이 아니라 분류 이름이라 우리 말로 바꿔 보여 줌)
const GENRE_NAMES: Record<string, string> = {
  "居酒屋": "이자카야",
  "ダイニングバー・バル": "다이닝 바",
  "創作料理": "창작 요리",
  "和食": "일식",
  "洋食": "양식",
  "イタリアン・フレンチ": "이탈리안 · 프렌치",
  "中華": "중식",
  "焼肉・ホルモン": "야키니쿠 · 곱창",
  "韓国料理": "한식",
  "アジア・エスニック料理": "아시아 · 에스닉",
  "各国料理": "세계 요리",
  "カラオケ・パーティ": "노래방 · 파티",
  "バー・カクテル": "바 · 칵테일",
  "ラーメン": "라멘",
  "お好み焼き・もんじゃ": "오코노미야키",
  "カフェ・スイーツ": "카페 · 디저트",
  "その他グルメ": "기타",
};

export function genreLabel(genre: string): string {
  return GENRE_NAMES[genre] ?? genre;
}

export function distanceKm(a: Point, b: Point): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function walkMinutes(km: number): number {
  return Math.max(1, Math.ceil((km * 1000 * DETOUR) / WALK_M_PER_MIN));
}

// 오사카 시간 기준 오늘 요일과 지금 시각(분)
export function osakaNow(date: Date): { day: Day; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("weekday").toLowerCase().slice(0, 3) as Day;
  return { day, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function lunchOpenOn(shop: LunchShop, day: Day): boolean {
  return shop.lunchDays[DAYS.indexOf(day)] === "O";
}

export function windowOn(shop: LunchShop, day: Day): LunchWindow | null {
  return shop.lunchWindow[day] ?? null;
}

// 지금 점심 영업 시간 안인지 (시간을 모르면 false)
export function openNow(shop: LunchShop, day: Day, minutes: number): boolean {
  const w = windowOn(shop, day);
  if (!lunchOpenOn(shop, day) || !w) return false;
  const start = toMinutes(w.start);
  const end = toMinutes(w.end);
  return start !== null && end !== null && start <= minutes && minutes < end;
}

export type NearbyShop = LunchShop & { km: number; walk: number };

// 오늘 점심 영업하는 가게를 가까운 반경부터 보고, 20곳이 되는 첫 반경을 고름. 2km에서도 모자라면 2km 안 전부
export function pickNearby(
  shops: LunchShop[],
  here: Point,
  day: Day,
): { radiusKm: number; widened: boolean; shops: NearbyShop[] } {
  const today = shops
    .filter((s) => lunchOpenOn(s, day))
    .map((s) => {
      const km = distanceKm(here, s);
      return { ...s, km, walk: walkMinutes(km) };
    });
  for (const radiusKm of RADII_KM) {
    const inside = today.filter((s) => s.km <= radiusKm);
    const last = radiusKm === RADII_KM[RADII_KM.length - 1];
    if (inside.length >= MIN_SHOPS || last) {
      return { radiusKm, widened: radiusKm !== RADII_KM[0], shops: inside };
    }
  }
  return { radiusKm: RADII_KM[0], widened: false, shops: [] }; // 도달하지 않음 (타입용)
}

// 가격 단계 시트: 단계마다 오늘 보여줄 가게 수 · 반경, 2km 안 5곳 미만이면 잠김
export type TierInfo = { limit: number; count: number; radiusKm: number; locked: boolean };
export function tierInfo(shops: LunchShop[], here: Point, day: Day): TierInfo[] {
  return PRICE_TIERS.map((limit) => {
    const near = pickNearby(shops.filter((s) => underLimit(s, limit)), here, day);
    // 2km 전에 멈췄으면 20곳 이상이라 충분. 2km까지 넓혔는데 5곳이 안 되면 잠금
    const locked = near.radiusKm === RADII_KM[RADII_KM.length - 1] && near.shops.length < MIN_TIER_SHOPS;
    return { limit, count: near.shops.length, radiusKm: near.radiusKm, locked };
  });
}

// 핀 · 목록에 보여줄 한 가지 가격: 대표 메뉴 가격 → 점심 최고가 → 최저가(~)
export function displayPrice(shop: LunchShop): { yen: number; from: boolean } | null {
  if (shop.typicalPrice !== null) return { yen: shop.typicalPrice, from: false };
  if (shop.priceMax !== null) return { yen: shop.priceMax, from: false };
  if (shop.priceMin !== null) return { yen: shop.priceMin, from: true };
  return null;
}

export function priceLabel(shop: LunchShop): string {
  const p = displayPrice(shop);
  return p ? `${p.yen.toLocaleString("ja-JP")}엔${p.from ? "~" : ""}` : "가격 확인";
}

// 가장 가까운 가게의 중지역으로 동네 이름을 정함
export function areaName(shops: NearbyShop[]): string | null {
  const nearest = [...shops].sort((a, b) => a.km - b.km)[0];
  return (nearest?.areaCode && AREA_NAMES[nearest.areaCode]) || null;
}

// ---------------------------------------------------------------- 룰렛 · 결과 카드

// 오늘 주문할 수 있는 마지막 시각(분): 라스트오더가 있으면 그것, 없으면 점심 영업 끝. 모르면 null
export function orderCutoff(shop: LunchShop, day: Day): number | null {
  const w = windowOn(shop, day);
  if (!w) return null;
  const lastOrder = w.last_order ? toMinutes(w.last_order) : null;
  return lastOrder ?? toMinutes(w.end);
}

// 룰렛 후보: 오늘 아직 주문할 수 있는 가게 (시간을 모르는 가게는 넣음)
export function rouletteCandidates<T extends LunchShop>(shops: T[], day: Day, minutes: number): T[] {
  return shops.filter((s) => {
    const cutoff = orderCutoff(s, day);
    return cutoff === null || minutes < cutoff;
  });
}

// 무작위로 한 곳. 다시 돌리면 직전 결과는 뺌 (후보가 한 곳뿐이면 그대로)
export function pickShop<T extends { id: string }>(pool: T[], previousId: string | null, rand = Math.random): T | null {
  const options = pool.length > 1 ? pool.filter((s) => s.id !== previousId) : pool;
  return options.length ? options[Math.floor(rand() * options.length)] : null;
}

// 룰렛 연출: 핀을 차례로 깜빡이다 점점 느려지며 결과에서 멈춤. 각 단계 = [깜빡일 가게, 다음 단계까지 ms]
export const SPIN_STEPS = 12;
export function spinSteps(pool: { id: string }[], winnerId: string, rand = Math.random): { id: string; ms: number }[] {
  const steps: { id: string; ms: number }[] = [];
  for (let i = 0; i < SPIN_STEPS - 1; i++) {
    let id = pool[Math.floor(rand() * pool.length)].id;
    if (pool.length > 1 && id === steps[i - 1]?.id) id = pool[(pool.findIndex((s) => s.id === id) + 1) % pool.length].id;
    steps.push({ id, ms: Math.round(50 + 200 * (i / (SPIN_STEPS - 2)) ** 2) }); // 50ms → 250ms
  }
  steps.push({ id: winnerId, ms: 0 });
  return steps;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h}시간 ${m}분` : h ? `${h}시간` : `${m}분`;
}

export const CLOSING_SOON_MIN = 30; // 이보다 적게 남으면 '곧 마감'으로 강조

// 결과 카드의 오늘 점심 시간 한 줄
export function lunchTimeText(shop: LunchShop, day: Day, minutes: number): { text: string; soon: boolean } {
  const w = windowOn(shop, day);
  const start = w ? toMinutes(w.start) : null;
  const cutoff = orderCutoff(shop, day);
  if (!w || start === null || cutoff === null) return { text: "오늘 점심 영업 (시간은 핫페퍼에서 확인)", soon: false };
  const range = `오늘 점심 ${w.start}~${w.end}${w.last_order ? ` (주문 ${w.last_order}까지)` : ""}`;
  if (minutes < start) return { text: `${range} · ${w.start}부터`, soon: false };
  if (minutes >= cutoff) return { text: `${range} · 오늘은 주문이 끝났어요`, soon: false };
  const left = cutoff - minutes;
  return { text: `${range} · ${w.last_order ? "주문 마감" : "마감"}까지 ${formatDuration(left)}`, soon: left <= CLOSING_SOON_MIN };
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")}`;

// 결과 카드의 점심 가격: 적힌 범위 그대로, 없으면 대표 메뉴 가격
export function priceRange(shop: LunchShop): string {
  const { priceMin: lo, priceMax: hi, typicalPrice: t } = shop;
  if (lo !== null && hi !== null) return lo === hi ? `${yen(lo)}엔` : `${yen(lo)}~${yen(hi)}엔`;
  if (hi !== null) return `${yen(hi)}엔`;
  if (lo !== null) return `${yen(lo)}엔~`;
  if (t !== null) return `${yen(t)}엔`;
  return "가격 확인";
}

// 배지: 적힌 점심 가격이 전부 상한 이하면 '가격 확인됨', 대표 메뉴 단서로 AI가 판단했으면 'AI 판단'
export function priceBadge(shop: LunchShop, limit = 990): "confirmed" | "ai" {
  return shop.priceMax !== null && shop.priceMax <= limit ? "confirmed" : "ai";
}

export function directionsUrl(p: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&travelmode=walking`;
}
