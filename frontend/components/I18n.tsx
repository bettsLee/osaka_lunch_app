"use client";

// 휴대폰 언어로 문구를 고름 (10/21 결정: 처음 보는 언어는 서버가 번역)
// 한국어(원문) · 영어는 앱에 들어 있음. 그 밖의 언어는 영어로 먼저 보여 주고, 서버 번역을 받으면 바꿈 (다음부터는 휴대폰에 저장해 둔 것)
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import ko from "@/public/i18n/ko.json";
import en from "@/public/i18n/en.json";
import { fetchTranslation } from "@/lib/api";
import { FALLBACK_LANG, merge, pickLang, SOURCE_LANG, translator, type Messages, type T } from "@/lib/i18n";

type I18n = { t: T; lang: string; machine: boolean }; // machine: 서버가 AI로 번역한 문구를 보여 주는 중
type State = { lang: string; messages: Messages; machine: boolean };

const Ctx = createContext<I18n>({ t: translator(ko), lang: SOURCE_LANG, machine: false });
export const useT = () => useContext(Ctx);

const CACHE_KEY = "osaka-lunch-i18n";

function readCache(lang: string): Messages | null {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return saved?.lang === lang && saved.messages ? saved.messages : null;
  } catch {
    return null;
  }
}

function writeCache(lang: string, messages: Messages): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ lang, messages }));
  } catch {
    // 저장소를 못 쓰면 다음에 다시 받음
  }
}

// 알림 문구를 서비스 워커가 읽을 수 있게 저장 (알림은 앱이 닫혀 있을 때 뜸)
function savePushText(messages: Messages): void {
  if (!("caches" in window)) return;
  const body = JSON.stringify({ title: messages["push.title"], body: messages["push.body"] });
  caches
    .open("osaka-lunch-push")
    .then((c) => c.put("/push-text.json", new Response(body, { headers: { "Content-Type": "application/json" } })))
    .catch(() => {});
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    const lang = pickLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
    document.documentElement.lang = lang;
    if (lang === SOURCE_LANG || lang === FALLBACK_LANG) {
      setState({ lang, messages: lang === SOURCE_LANG ? ko : en, machine: false });
      return;
    }
    const cached = readCache(lang);
    setState({ lang, messages: merge(en, cached), machine: cached !== null });
    fetchTranslation(lang)
      .then((got) => {
        if (!got) return;
        writeCache(lang, got);
        setState({ lang, messages: merge(en, got), machine: true });
      })
      .catch(() => {}); // 서버가 잠들었거나 실패하면 지금 문구 그대로
  }, []);

  useEffect(() => {
    if (state) savePushText(state.messages);
  }, [state]);

  const value = useMemo<I18n | null>(
    () => (state ? { t: translator(state.messages), lang: state.lang, machine: state.machine } : null),
    [state],
  );
  // 언어를 정하기 전에는 그리지 않음 (한국어가 잠깐 보였다가 바뀌지 않게)
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
