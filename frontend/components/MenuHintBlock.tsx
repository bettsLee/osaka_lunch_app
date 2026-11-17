"use client";

// 결과 카드의 대표 메뉴 줄 (11/17 결정, OL-65). 구글 지도 정보를 Gemini가 정리한 답 + 출처 + 'Google Maps' 표시
// 표시 규칙 (Gemini API 구글 지도 그라운딩): 출처는 내용 바로 아래에 제목 + 링크, 'Google Maps' 글자는 바꾸거나 번역하지 않음,
// 굵기 400 · 색 #5E5E5E · 12px 이상
import { useEffect, useState } from "react";
import { fetchMenuHint } from "@/lib/api";
import { track } from "@/lib/analytics";
import { mapsLink, takeMenuHint, type MenuHint } from "@/lib/menuHint";
import { useT } from "./I18n";
import { svg } from "./icons";

const ATTRIBUTION_STYLE = { fontFamily: "Roboto, Arial, Helvetica, sans-serif", fontWeight: 400, color: "#5E5E5E", fontSize: 12 } as const;

export default function MenuHintBlock({ shopId, shopName }: { shopId: string; shopName: string }) {
  const { t, lang } = useT();
  const [hint, setHint] = useState<MenuHint | null>(null); // null: 물어보는 중

  useEffect(() => {
    let alive = true;
    setHint(null);
    const started = performance.now();
    const { hint: answer, prefetched } = takeMenuHint(shopId, lang, fetchMenuHint);
    void answer.then((h) => {
      if (!alive) return;
      setHint(h);
      // 대표 메뉴가 보인 비율 · 기다린 시간 (미리 물어봤는지에 따라)
      track("menu_hint", { status: h.status, place: h.place, ms: Math.round(performance.now() - started), prefetched });
    });
    return () => {
      alive = false;
    };
  }, [shopId, lang]);

  if (hint === null) {
    return (
      <div className="flex flex-col gap-1 rounded-xl bg-[#F4F3EF] px-3 py-2.5" aria-live="polite">
        <p className="text-[12px] text-[#5F5E58]">{t("menu.title")}</p>
        <p className="animate-pulse text-sm text-[#5F5E58]">{t("menu.loading")}</p>
      </div>
    );
  }

  const grounded = hint.sources.length > 0; // 구글 지도에서 찾은 답일 때만 메뉴 · 영업 안내를 보여 줌
  const warning = grounded && hint.place === "closed" ? t("menu.closed") : grounded && hint.place === "no_lunch" ? t("menu.noLunch") : null;
  const link = (
    <a
      href={mapsLink(hint, shopName)}
      target="_blank"
      rel="noreferrer"
      onClick={() => track("menu_link_click", { to: "google_maps" })}
      className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#1A3F91]"
    >
      {t("menu.mapsLink")}
      <svg {...svg} width={16} height={16}>
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  );

  if (hint.status !== "ok" && !warning) return <div className="-my-1">{link}</div>;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-[#F4F3EF] px-3 py-2.5" aria-live="polite">
      {warning && <p className="text-sm font-semibold text-[#9A4A00]">{warning}</p>}
      {hint.status === "ok" && (
        <>
          <p className="text-[12px] text-[#5F5E58]">{t("menu.title")}</p>
          <p className="text-[15px] font-semibold leading-snug text-[#1F1F1C]">{hint.menus.join(" · ")}</p>
        </>
      )}
      {/* 출처: 내용 바로 아래 (표시 규칙) */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {hint.sources.map((s) => (
          <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer" className="text-[12px] text-[#1A3F91] underline">
            {s.title}
          </a>
        ))}
        <span translate="no" className="notranslate" style={ATTRIBUTION_STYLE}>
          Google Maps
        </span>
      </div>
      <p className="text-[12px] text-[#5F5E58]">{t("menu.aiNote")}</p>
      {hint.status !== "ok" && link}
    </div>
  );
}
