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
};

export type Point = { lat: number; lng: number };

// 반경은 1km에서 시작해 가게가 이보다 적으면 넓힘 (10/21 결정: 20곳 유지)
export const RADII_KM = [1, 1.5, 2];
export const MIN_SHOPS = 20;

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

// 오늘 점심 영업이 모두 끝났는지 (보여줄 가게 중 가장 늦게 끝나는 곳 기준)
export function lunchOver(shops: LunchShop[], day: Day, minutes: number): boolean {
  const ends = shops
    .map((s) => windowOn(s, day))
    .map((w) => (w ? toMinutes(w.end) : null))
    .filter((m): m is number => m !== null);
  return ends.length > 0 && minutes >= Math.max(...ends);
}
