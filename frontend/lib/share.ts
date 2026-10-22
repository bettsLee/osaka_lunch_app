// 맛집 추천 공유 (10/22 결정: 이미지 카드 대신 링크, 한 곳 + 여러 곳 골라서). 링크에는 가게 번호만 (보낸 사람 정보 없음)
import type { Day, LunchShop } from "./lunch";

export const SHARE_MAX = 10; // 한 번에 추천할 수 있는 가게 수 (링크가 너무 길어지지 않게)
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const ORDER: Day[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function shareLink(origin: string, ids: string[]): string {
  return `${origin}/?ref=share&s=${ids.slice(0, SHARE_MAX).join(",")}`;
}

// 받은 링크의 가게 번호 (이상한 값은 버리고, 겹치면 하나, 최대 10곳)
export function sharedIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("s") ?? "";
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => ID.test(s)))].slice(0, SHARE_MAX);
}

// 추천 글의 점심 시간: 오늘 점심을 하면 오늘 시간, 아니면 점심을 하는 다음 요일의 시간. 모르면 null
export function lunchHours(shop: LunchShop, today: Day): string | null {
  const from = ORDER.indexOf(today);
  for (let i = 0; i < ORDER.length; i += 1) {
    const day = ORDER[(from + i) % ORDER.length];
    const w = shop.lunchWindow[day];
    if (w && shop.lunchDays[ORDER.indexOf(day)] === "O") return `${w.start}~${w.end}`;
  }
  return null;
}
