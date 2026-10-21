// 알레르기 · 식사 제한 문장 (10/22 결정: 주문 문장 맨 위에 '내 사정을 말하는 문장').
// 가게가 대응하는지는 핫페퍼 데이터에 없어서, 내가 직원에게 보여 줄 일본어 문장만 만듦. 고른 내용은 이 휴대폰에만 저장
// 알레르기는 일본 식품 표시 의무 8가지(特定原材料)

export const ALLERGENS = ["shrimp", "crab", "walnut", "wheat", "buckwheat", "egg", "milk", "peanut"] as const;
export type Allergen = (typeof ALLERGENS)[number];
export const STYLES = ["none", "vegetarian", "vegan", "halal"] as const;
export type DietStyle = (typeof STYLES)[number];
export type Diet = { allergens: Allergen[]; style: DietStyle };

export const EMPTY_DIET: Diet = { allergens: [], style: "none" };

const JA: Record<Allergen, string> = {
  shrimp: "えび",
  crab: "かに",
  walnut: "くるみ",
  wheat: "小麦",
  buckwheat: "そば",
  egg: "卵",
  milk: "乳製品",
  peanut: "落花生（ピーナッツ）",
};

// 직원에게 보여 줄 문장. meaning은 휴대폰 언어 뜻(문구 키), items는 뜻에 넣을 알레르기
export type DietPhrase = { ja: string; meaning: string; items?: Allergen[] };

export function hasDiet(d: Diet): boolean {
  return d.allergens.length > 0 || d.style !== "none";
}

export function dietPhrases(d: Diet): DietPhrase[] {
  const out: DietPhrase[] = [];
  if (d.allergens.length > 0) {
    const items = ALLERGENS.filter((a) => d.allergens.includes(a)); // 늘 같은 순서로
    const ja = items.map((a) => JA[a]).join("・");
    out.push({ ja: `${ja}のアレルギーがあります。少量でも食べられません。`, meaning: "diet.allergyHave", items });
    out.push({ ja: `${ja}が入っていない料理はありますか？`, meaning: "diet.allergyAsk", items });
  }
  if (d.style === "vegetarian") {
    out.push({ ja: "ベジタリアンです。肉と魚が食べられません。", meaning: "diet.vegetarianHave" });
    out.push({ ja: "肉と魚が入っていない料理はありますか？", meaning: "diet.vegetarianAsk" });
  } else if (d.style === "vegan") {
    out.push({ ja: "ヴィーガンです。肉・魚・卵・乳製品が食べられません。", meaning: "diet.veganHave" });
    out.push({ ja: "動物性の食材が入っていない料理はありますか？", meaning: "diet.veganAsk" });
  } else if (d.style === "halal") {
    out.push({ ja: "宗教上の理由で、豚肉とお酒（みりんを含む）が食べられません。", meaning: "diet.halalHave" });
    out.push({ ja: "豚肉とお酒が入っていない料理はありますか？", meaning: "diet.halalAsk" });
  }
  return out;
}

// 저장해 둔 값을 읽을 때: 모르는 값은 버림 (예전 버전 · 손댄 값)
export function parseDiet(raw: string | null): Diet {
  try {
    const v = JSON.parse(raw ?? "null") as { allergens?: unknown; style?: unknown } | null;
    const allergens = Array.isArray(v?.allergens) ? ALLERGENS.filter((a) => (v.allergens as unknown[]).includes(a)) : [];
    const style = STYLES.find((s) => s === v?.style) ?? "none";
    return { allergens, style };
  } catch {
    return EMPTY_DIET;
  }
}

const DIET_KEY = "osaka-lunch-diet"; // 이 휴대폰에만 (서버 · Amplitude로 보내지 않음)

export function loadDiet(): Diet {
  try {
    return parseDiet(localStorage.getItem(DIET_KEY));
  } catch {
    return EMPTY_DIET; // 저장소를 못 쓰는 브라우저
  }
}

export function saveDiet(d: Diet): void {
  try {
    if (hasDiet(d)) localStorage.setItem(DIET_KEY, JSON.stringify(d));
    else localStorage.removeItem(DIET_KEY);
  } catch {
    // 기억 못 하면 이번에만 적용
  }
}
