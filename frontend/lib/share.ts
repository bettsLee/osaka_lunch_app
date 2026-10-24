// 맛집 추천 공유 (10/22 결정: 이미지 카드 대신 링크, 한 곳 + 여러 곳 골라서). 링크에는 가게 번호만 (보낸 사람 정보 없음)

export const SHARE_MAX = 10; // 한 번에 추천할 수 있는 가게 수 (링크가 너무 길어지지 않게)
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export function shareLink(origin: string, ids: string[]): string {
  return `${origin}/?ref=share&s=${ids.slice(0, SHARE_MAX).join(",")}`;
}

// 짧은 링크 (10/22 결정: 서버에 코드 → 가게 번호). 서버가 잠들어 못 만들면 shareLink(긴 링크)로
export function shortLink(origin: string, code: string): string {
  return `${origin}/r/${code}`;
}

// 받은 짧은 링크의 코드 (영문 · 숫자 6자가 아니면 null)
export function shareCode(search: string): string | null {
  const c = /^[A-Za-z0-9]{6}/.exec(new URLSearchParams(search).get("c") ?? "")?.[0];
  return c ?? null;
}

// 받은 링크의 가게 번호 (겹치면 하나, 최대 10곳). 각 칸의 앞부분 번호만 씀:
// 10/22 맥 카톡이 링크 바로 뒤에 글을 붙여 보내서(s=J001105962오사카…) 마지막 가게가 빠졌음
export function sharedIds(search: string): string[] {
  const raw = new URLSearchParams(search).get("s") ?? "";
  const ids = raw.split(",").map((s) => /^[A-Za-z0-9_-]+/.exec(s.trim())?.[0] ?? "").filter((s) => ID.test(s));
  return [...new Set(ids)].slice(0, SHARE_MAX);
}

// 공유 창에 넘길 글: 링크를 글 맨 끝에 넣어 한 덩어리로 (url을 따로 주면 앱마다 붙이는 방식이 달라 링크가 깨짐)
export function shareMessage(text: string, url: string): string {
  return `${text}\n${url}`;
}
