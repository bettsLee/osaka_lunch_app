// 결과 카드의 대표 메뉴 (11/17 결정, OL-65). 서버가 Gemini 구글 지도 그라운딩으로 물어본 답
// - 구글 약관상 답은 저장하지 않음: 로컬 저장소에 두지 않고, 미리 받아 둔 것도 카드에 한 번 보여 주면 버림
// - 룰렛이 도는 동안(약 3초) 미리 물어봐서 카드가 열릴 때 기다리는 시간을 줄임 (11/17 실험: 한 번에 평균 3.6초)

// guess: AI가 구글 지도를 안 보고 쓴 메뉴 ('AI 추측', 출처 없음 · 11/17 상권 "(나)로 해줘") · unavailable: 하루 한도 · 서버 오류 · 시간 초과
export type MenuHintStatus = "ok" | "guess" | "unknown" | "unavailable";
export type MenuHintPlace = "open" | "no_lunch" | "closed" | "unknown"; // 구글 지도 기준 평일 점심 영업
export type MenuHintSource = { title: string; uri: string };
// kind: lunch = 평일 점심 메뉴로 알려진 것, signature = 가게 대표 메뉴(저녁일 수도) (11/17 상권: "대표메뉴가 점심메뉴가 맞아?")
// placeId: 구글 가게 ID (손님 사진을 받을 때 씀)
// price: 구글 지도 기준 가격대 (11/17 상권 "대략적인 가격이라도 가시적으로"). lunch = 평일 점심, all = 가게 전체 (점심 근거 없음)
export type MenuHintPrice = { kind: "lunch" | "all"; min: number; max: number };
export type MenuHint = {
  status: MenuHintStatus;
  place: MenuHintPlace;
  menus: string[];
  kind: "lunch" | "signature";
  sources: MenuHintSource[];
  placeId: string | null;
  price: MenuHintPrice | null;
};

export const UNAVAILABLE_HINT: MenuHint = {
  status: "unavailable",
  place: "unknown",
  menus: [],
  kind: "signature",
  sources: [],
  placeId: null,
  price: null,
};

const yen = (n: number) => n.toLocaleString("ja-JP");

// 가격 숫자는 100엔~3만 엔만 믿음
function readPrice(v: unknown): MenuHintPrice | null {
  const o = v as Record<string, unknown> | null;
  if (!o || (o.kind !== "lunch" && o.kind !== "all")) return null;
  const { min, max } = o;
  if (typeof min !== "number" || typeof max !== "number" || !Number.isInteger(min) || !Number.isInteger(max)) return null;
  if (min < 100 || max > 30000 || min > max) return null;
  return { kind: o.kind, min, max };
}

// '800~1,200' (같으면 '900')
export function priceRange(p: MenuHintPrice): string {
  return p.min === p.max ? yen(p.min) : `${yen(p.min)}~${yen(p.max)}`;
}

// 결과 카드의 손님 사진 (11/17 상권: "메뉴사진도 같이 넣을 수 없어?"). 구글 장소 API, 저장하지 않음, 올린 사람 표시
// mapsUri: 구글 지도에서 그 사진을 여는 링크 (올린 사람의 리뷰에서 무슨 메뉴인지 확인. 11/17 상권 "사진만 있으니까 메뉴 이름을 잘 모르겠는데")
export type PlacePhoto = { url: string; author: string; authorUri: string; mapsUri: string };

export function readPlacePhotos(body: unknown): PlacePhoto[] {
  const list = (body as { photos?: unknown } | null)?.photos;
  if (!Array.isArray(list)) return [];
  return list
    .filter((p): p is PlacePhoto => {
      const o = p as Record<string, unknown> | null;
      return !!o && typeof o.url === "string" && o.url.startsWith("https://") && typeof o.author === "string" && typeof o.authorUri === "string";
    })
    .map((p) => {
      const maps = (p as { mapsUri?: unknown }).mapsUri;
      return {
        url: p.url,
        author: p.author.slice(0, 40),
        authorUri: p.authorUri.startsWith("https://") ? p.authorUri : "",
        mapsUri: typeof maps === "string" && maps.startsWith("https://") ? maps : "",
      };
    })
    .slice(0, 6); // 11/18: 6장까지 (가로로 넘겨 봄)
}

const STATUSES: readonly string[] = ["ok", "guess", "unknown", "unavailable"];
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
  const kind = b.kind === "lunch" ? "lunch" : "signature";
  const placeId = typeof b.placeId === "string" && /^[A-Za-z0-9_-]{10,300}$/.test(b.placeId) && sources.length > 0 ? b.placeId : null;
  // AI 추측: 구글 지도를 안 본 답이라 출처 · 가게 ID · 영업 안내 · 가격을 붙이지 않음 (메뉴 끝 가격도 뗌)
  if (status === "guess") {
    const plain = menus.map((m) => splitDish(m)).map((d) => (d.original ? `${d.name}(${d.original})` : d.name));
    return { status: plain.length > 0 ? "guess" : "unknown", place: "unknown", menus: plain, kind, sources: [], placeId: null, price: null };
  }
  // 가격대는 구글 지도에서 찾은 답일 때만
  const price = sources.length > 0 ? readPrice(b.price) : null;
  // 메뉴가 있어도 구글 지도 출처가 없으면 보여 주지 않음 (표시 규칙: 내용 바로 아래 출처)
  if (status === "ok" && (menus.length === 0 || sources.length === 0)) return { status: "unknown", place, menus: [], kind, sources, placeId, price };
  return { status, place, menus: status === "ok" ? menus : [], kind, sources, placeId, price };
}

// 메뉴 칸 (11/17 상권: "대표메뉴 문자가 너무 눈에 안 들어와"): '교자(自家製餃子)' → 큰 글자 '교자' + 작은 글자 '自家製餃子'
// 괄호가 없거나(일본어 화면) 앞뒤가 같으면 그대로 한 줄
// 끝의 가격('라멘 (ラーメン) 900', '… ¥1,100엔')은 따로 (11/17 상권 "메뉴 칸마다 가격"). 50엔~3만 엔만
export function splitDish(menu: string): { name: string; original: string | null; price: number | null } {
  let rest = menu.trim();
  let price: number | null = null;
  const p = /\s*[¥￥]?\s*(\d[\d,]{1,5})\s*(?:엔|円|yen)?$/i.exec(rest);
  // 숫자 앞이 띄어쓰기 · ¥ · 닫는 괄호일 때만 가격 ('세트10' 같은 이름은 그대로)
  const separated = p !== null && p.index > 0 && (/^[\s¥￥]/.test(p[0]) || /[)）]$/.test(rest.slice(0, p.index)));
  if (p && separated) {
    const n = Number(p[1].replace(/,/g, ""));
    if (n >= 50 && n <= 30000) {
      price = n;
      rest = rest.slice(0, p.index).trim();
    }
  }
  const m = /^(.+?)\s*[（(]([^()（）]+)[)）]$/.exec(rest);
  if (!m || m[1].trim() === m[2].trim()) return { name: rest, original: null, price };
  return { name: m[1].trim(), original: m[2].trim(), price };
}

// 기다리는 동안 문구 (11/17 상권: "기다릴 때 문구도 시간에 따라 바뀌게"). 서버는 20초까지 물어봄 (지도를 안 보면 자동으로 한 번 더)
export const LOADING_STEPS: readonly (readonly [number, string])[] = [
  [0, "menu.loading"],
  [4000, "menu.loading2"],
  [9000, "menu.loading3"],
  [15000, "menu.loading4"],
];

export function loadingStep(waitedMs: number): number {
  let step = 0;
  LOADING_STEPS.forEach(([at], i) => {
    if (waitedMs >= at) step = i;
  });
  return step;
}

export function loadingKey(waitedMs: number): string {
  return LOADING_STEPS[loadingStep(waitedMs)][1];
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
