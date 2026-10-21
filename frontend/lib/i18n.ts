// 앱 문구 규칙 (10/21 결정: 처음 보는 언어는 서버가 번역). 원문은 public/i18n/ko.json, 영어는 en.json을 앱에 넣고
// 그 밖의 언어는 서버가 Gemini로 한 번 번역해 저장한 것을 받아 씀. 받기 전이나 실패하면 영어

export type Messages = Record<string, string>;
export type Vars = Record<string, string | number>;
export type T = (key: string, vars?: Vars) => string;

export const SOURCE_LANG = "ko";
export const FALLBACK_LANG = "en";

// 휴대폰 언어 태그 → 우리가 쓰는 언어 코드. 중국어는 간체 · 번체를 나눔 (대만 · 홍콩 · 마카오 = 번체)
export function normalizeLang(tag: string): string {
  const parts = tag.trim().replace(/_/g, "-").split("-");
  const lang = (parts[0] ?? "").toLowerCase();
  if (lang !== "zh") return lang;
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  if (rest.includes("hant") || rest.some((p) => ["tw", "hk", "mo"].includes(p))) return "zh-Hant";
  return "zh-Hans";
}

// 휴대폰 언어 목록에서 첫 번째. 비어 있으면 영어
export function pickLang(languages: readonly string[]): string {
  const first = languages.map(normalizeLang).find((l) => /^[a-z]{2,3}(-Han[st])?$/.test(l));
  return first ?? FALLBACK_LANG;
}

export function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

// 번역본을 기본 문구에 덮어씀. 빠졌거나 {자리}가 원문과 다른 문구는 기본 문구 그대로 (깨진 문장을 보여 주지 않게)
export function merge(base: Messages, over: Messages | null | undefined): Messages {
  if (!over) return base;
  const out: Messages = {};
  for (const [key, value] of Object.entries(base)) {
    const v = over[key];
    out[key] = typeof v === "string" && v.trim() && placeholders(v).join() === placeholders(value).join() ? v : value;
  }
  return out;
}

export function translator(messages: Messages): T {
  return (key, vars) => {
    const template = messages[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m)) : template;
  };
}
