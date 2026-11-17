"use client";

// 결과 카드의 메뉴 칸 (11/17, OL-65 · OL-66)
// - 손님 사진 3장 (구글 장소 API): 상권 "메뉴사진도 같이 넣을 수 없어? 이게 제일 중요한 거 같은데" → 맨 위에. 사진마다 올린 사람 표시
// - 점심 메뉴 / 가게 대표 메뉴 (구글 지도 그라운딩): 점심 메뉴로 알려진 것만 '점심 메뉴', 아니면 '가게 대표 메뉴'
// 표시 규칙: 그라운딩 출처는 내용 바로 아래에 제목 + 링크, 'Google Maps' 글자는 바꾸거나 번역하지 않음 (굵기 400 · #5E5E5E · 12px)
import { useEffect, useState } from "react";
import { fetchMenuHint, fetchPlacePhotos } from "@/lib/api";
import { track } from "@/lib/analytics";
import { mapsLink, takeMenuHint, type MenuHint, type PlacePhoto } from "@/lib/menuHint";
import { useT } from "./I18n";
import { svg } from "./icons";

const ATTRIBUTION_STYLE = { fontFamily: "Roboto, Arial, Helvetica, sans-serif", fontWeight: 400, color: "#5E5E5E", fontSize: 12 } as const;

function GoogleMaps() {
  return (
    <span translate="no" className="notranslate" style={ATTRIBUTION_STYLE}>
      Google Maps
    </span>
  );
}

export default function MenuHintBlock({ shopId, shopName }: { shopId: string; shopName: string }) {
  const { t, lang } = useT();
  const [hint, setHint] = useState<MenuHint | null>(null); // null: 물어보는 중
  const [photos, setPhotos] = useState<PlacePhoto[] | null>(null); // null: 받는 중 (가게 ID가 있을 때만)

  useEffect(() => {
    let alive = true;
    setHint(null);
    setPhotos(null);
    const started = performance.now();
    const { hint: answer, prefetched } = takeMenuHint(shopId, lang, fetchMenuHint);
    void answer.then((h) => {
      if (!alive) return;
      setHint(h);
      // 대표 메뉴가 보인 비율 · 기다린 시간 (미리 물어봤는지에 따라)
      track("menu_hint", { status: h.status, place: h.place, kind: h.kind, ms: Math.round(performance.now() - started), prefetched });
      if (!h.placeId) return setPhotos([]);
      void fetchPlacePhotos(h.placeId).then((list) => {
        if (!alive) return;
        setPhotos(list);
        track("menu_photos", { count: list.length, ms: Math.round(performance.now() - started) });
      });
    });
    return () => {
      alive = false;
    };
  }, [shopId, lang]);

  if (hint === null) {
    return (
      <p className="animate-pulse text-[15px] text-[#5F5E58]" aria-live="polite">
        {t("menu.loading")}
      </p>
    );
  }

  const grounded = hint.sources.length > 0; // 구글 지도에서 찾은 답일 때만 메뉴 · 영업 안내를 보여 줌
  const warning = grounded && hint.place === "closed" ? t("menu.closed") : grounded && hint.place === "no_lunch" ? t("menu.noLunch") : null;
  const placeLink = mapsLink(hint, shopName);
  const link = (
    <a
      href={placeLink}
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

  // 손님 사진: 받는 중이면 회색 칸, 0장이면 숨김. 누르면 구글 지도의 그 가게 (사진 더 보기)
  const photoRow =
    photos === null ? (
      <div className="flex gap-2" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[104px] w-[104px] flex-none animate-pulse rounded-xl bg-[#ECEAE3]" />
        ))}
      </div>
    ) : photos.length > 0 ? (
      <div className="flex flex-col gap-1">
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <a
              key={p.url}
              href={placeLink}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("menu_link_click", { to: "google_maps_photo" })}
              className="h-[104px] w-[104px] flex-none overflow-hidden rounded-xl bg-[#ECEAE3]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 구글 사진 주소를 그대로 씀 (저장 · 가공 안 함) */}
              <img src={p.url} alt={t("menu.photoAlt", { n: i + 1 })} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
        {/* 사진마다 올린 사람 (구글 표시 규칙) */}
        <p className="flex flex-wrap items-center gap-x-1 text-[12px] text-[#5F5E58]">
          {t("menu.photosBy")}
          {photos.map((p, i) => (
            <span key={p.url}>
              {p.authorUri ? (
                <a href={p.authorUri} target="_blank" rel="noreferrer" className="underline">
                  {p.author || "Google user"}
                </a>
              ) : (
                p.author || "Google user"
              )}
              {i < photos.length - 1 ? "," : ""}
            </span>
          ))}
          <span className="ml-1">
            <GoogleMaps />
          </span>
        </p>
      </div>
    ) : null;

  if (hint.status !== "ok" && !warning) {
    return (
      <div className="flex flex-col gap-1">
        {photoRow}
        <div className="-my-1">{link}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      {photoRow}
      {warning && <p className="text-sm font-semibold text-[#9A4A00]">{warning}</p>}
      {hint.status === "ok" && (
        <div className="flex flex-col gap-0.5">
          <p className="text-[15px] leading-snug text-[#1F1F1C]">
            <span className="text-[#5F5E58]">{t(hint.kind === "lunch" ? "menu.lunchTitle" : "menu.title")}: </span>
            <span className="font-semibold">{hint.menus.join(" · ")}</span>
          </p>
          {/* 출처: 내용 바로 아래 (표시 규칙) */}
          <div className="flex flex-wrap items-center gap-x-2 text-[12px]">
            {hint.sources.map((s) => (
              <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer" className="max-w-full truncate text-[#1A3F91] underline">
                {s.title}
              </a>
            ))}
            <GoogleMaps />
            <span className="text-[#5F5E58]">· {t("menu.aiShort")}</span>
          </div>
        </div>
      )}
      {hint.status !== "ok" && link}
    </div>
  );
}
