// Supabase에서 가장 높은 가격 단계(1,190엔) 이하 가게를 읽어 옴 (화면에서 바로 조회. 서버는 잠들 수 있어서 거치지 않음)
// 단계별로 거르는 건 화면에서 (lunch.ts underLimit과 같은 규칙)
import { PRICE_TIERS, type LunchShop } from "./lunch";

const MAX_LIMIT = Math.max(...PRICE_TIERS);
const UNDER_MAX = `or=(typical_lunch_price.lte.${MAX_LIMIT},and(typical_lunch_price.is.null,lunch_price_max.lte.${MAX_LIMIT}))`;

const PAGE = 1000;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // 읽기 전용 공개 키 (RLS로 읽기만 허용)

const SELECT =
  "shop_id,text_hash,lunch_days,lunch_window,lunch_price_min,lunch_price_max,typical_lunch_price,price_evidence," +
  "shops(name,genre_name,catch,genre_catch,lat,lng,photo_url,hotpepper_url,middle_area_code,text_hash)";

type Row = {
  shop_id: string;
  text_hash: string; // AI가 읽었을 때의 가게 글
  lunch_days: string | null;
  lunch_window: LunchShop["lunchWindow"] | null;
  lunch_price_min: number | null;
  lunch_price_max: number | null;
  typical_lunch_price: number | null;
  price_evidence: string | null;
  shops: {
    name: string;
    genre_name: string | null;
    catch: string | null;
    genre_catch: string | null;
    lat: number | null;
    lng: number | null;
    photo_url: string | null;
    hotpepper_url: string | null;
    middle_area_code: string | null;
    text_hash: string; // 오늘 받은 가게 글
  } | null;
};

export async function fetchLunchShops(): Promise<LunchShop[]> {
  if (!SUPABASE_URL || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없어요");
  const headers: Record<string, string> = { apikey: KEY };
  if (KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${KEY}`; // 예전 형식(JWT) 키
  // Supabase는 한 번에 1,000줄까지만 돌려줌 (기본 Max rows). 시내 전체로 넓혀서 1,000줄씩 나눠 받음
  const rows: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/shop_ai?select=${SELECT}&${UNDER_MAX}&error=is.null&order=shop_id&limit=${PAGE}&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`가게를 불러오지 못했어요 (${res.status})`);
    const page: Row[] = await res.json();
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.flatMap((r) => {
    const s = r.shops;
    if (!s || s.lat === null || s.lng === null || !r.lunch_days) return [];
    return [
      {
        id: r.shop_id,
        name: s.name,
        genre: s.genre_name ?? "",
        lat: s.lat,
        lng: s.lng,
        photoUrl: s.photo_url,
        hotpepperUrl: s.hotpepper_url,
        areaCode: s.middle_area_code,
        lunchDays: r.lunch_days,
        lunchWindow: r.lunch_window ?? {},
        priceMin: r.lunch_price_min,
        priceMax: r.lunch_price_max,
        typicalPrice: r.typical_lunch_price,
        // 가격 원문은 핫페퍼 글 그대로라 오늘 글일 때만. AI가 실패해 예전 결과가 남은 가게는 숨김 (10/24 리크루트 답: 늘 최신 정보)
        priceEvidence: r.text_hash === s.text_hash ? r.price_evidence || null : null,
        catchText: s.catch?.trim() || s.genre_catch?.trim() || null,
      },
    ];
  });
}
