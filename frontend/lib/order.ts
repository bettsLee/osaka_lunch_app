// 주문 도우미 기본 문장 (10/21 결정: 주문 · 추천 · 카드 3문장). 일본어는 우리가 쓴 그대로 두고 뜻만 화면 언어로
// say: 읽는 법 (11/17: 대표 메뉴를 기다리는 동안 '주문 팁'으로 보여 줌). 한국어 화면은 한글, 나머지 언어는 로마자
export const ORDER_PHRASES = [
  { ja: "ランチをひとつお願いします。", meaning: "order.1", say: { ko: "란치오 히토츠 오네가이시마스", latin: "ranchi o hitotsu onegai shimasu" } },
  { ja: "おすすめのランチはどれですか？", meaning: "order.2", say: { ko: "오스스메노 란치와 도레데스카", latin: "osusume no ranchi wa dore desu ka" } },
  { ja: "カードは使えますか？", meaning: "order.3", say: { ko: "카-도와 츠카에마스카", latin: "kādo wa tsukaemasu ka" } },
] as const;

export type OrderPhrase = (typeof ORDER_PHRASES)[number];

// 기다리는 동안 보여 줄 문장: 가게마다 시작 문장을 다르게, 기다리는 문구가 바뀔 때(step)마다 다음 문장
export function orderTip(shopId: string, step: number): OrderPhrase {
  let seed = 0;
  for (const c of shopId) seed = (seed * 31 + c.charCodeAt(0)) % 997;
  return ORDER_PHRASES[(seed + step) % ORDER_PHRASES.length];
}
