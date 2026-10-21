// Supabase에서 '990엔 이하 예' 가게를 읽어 옴 (화면에서 바로 조회. 서버는 잠들 수 있어서 거치지 않음)
import type { LunchShop } from "./lunch";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; // 읽기 전용 공개 키 (RLS로 읽기만 허용)

const SELECT =
  "shop_id,lunch_days,lunch_window,lunch_price_min,lunch_price_max,typical_lunch_price," +
  "shops(name,genre_name,lat,lng,photo_url,hotpepper_url,middle_area_code)";

type Row = {
  shop_id: string;
  lunch_days: string | null;
  lunch_window: LunchShop["lunchWindow"] | null;
  lunch_price_min: number | null;
  lunch_price_max: number | null;
  typical_lunch_price: number | null;
  shops: {
    name: string;
    genre_name: string | null;
    lat: number | null;
    lng: number | null;
    photo_url: string | null;
    hotpepper_url: string | null;
    middle_area_code: string | null;
  } | null;
};

export async function fetchLunchShops(): Promise<LunchShop[]> {
  if (!SUPABASE_URL || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 가 없어요");
  const headers: Record<string, string> = { apikey: KEY };
  if (KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${KEY}`; // 예전 형식(JWT) 키
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/shop_ai?select=${SELECT}&under_990=eq.yes&error=is.null`,
    { headers },
  );
  if (!res.ok) throw new Error(`가게를 불러오지 못했어요 (${res.status})`);
  const rows: Row[] = await res.json();
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
      },
    ];
  });
}
