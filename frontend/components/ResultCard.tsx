"use client";

// S3 결과 카드: 사진 · 이름 · 걸어서 n분 · 오늘 점심 시간 · 가격 + 배지 · 여기 갈래요 / 랜덤으로 가게 고르기(10/22: 핀 · 목록에서 와도 맞는 이름) · 주문 문장 · 원문
// 길찾기는 여기 갈래요 뒤 화면 · 홈의 가는 중에서 (10/22 도그푸딩: 여기 갈래요와 겹침)
import { useEffect, useRef, useState } from "react";
import { directionsUrl, genreLabel, lunchTimeText, priceBadge, priceRange, type Day, type NearbyShop } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { fetchShopCatch } from "@/lib/api";
import { clockTime } from "@/lib/visits";
import { useT } from "./I18n";
import { svg } from "./icons";
import OrderSheet from "./OrderSheet";
import type { useSheetSwipe } from "./useSheetSwipe";

type Props = {
  shop: NearbyShop;
  day: Day;
  minutes: number;
  limit: number; // 지금 고른 가격 상한
  onGo: () => void;
  onRespin: () => void;
  canRespin: boolean;
  collapsed: boolean; // 손잡이로 카드를 접고 지도를 크게 (10/22 도그푸딩: 홈 시트와 같게)
  onToggle: () => void;
  handle?: ReturnType<typeof useSheetSwipe>; // 손잡이 스와이프 (없으면 누르기만)
  goingAt?: string | null; // 이미 여기 갈래요로 정한 가게면 정한 시각: 여기 갈래요 · 랜덤 대신 길찾기 · 도착했어요 · 취소 (10/22 도그푸딩: 가는 중 배너 대신)
  onCancelGoing?: () => void;
  onArrive?: () => void; // 도착했어요 버튼 (GPS가 빌딩 사이에서 튀어 자동으로 못 알아챘을 때)
};

export default function ResultCard(props: Props) {
  const { shop, day, minutes, limit, onGo, onRespin, canRespin, collapsed, onToggle, handle, goingAt = null, onCancelGoing, onArrive } = props;
  const { t, lang } = useT();
  const [orderOpen, setOrderOpen] = useState(false);
  const [asking, setAsking] = useState(false); // 취소를 한 번 더 물어보는 중
  // 가게 소개 AI 번역 (일본어 화면은 원문만). text가 null이면 번역하는 중
  const [catchTr, setCatchTr] = useState<{ id: string; text: string | null } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), [shop.id]); // 결과가 나오면 화면 읽기 프로그램이 가게 이름부터 읽게
  useEffect(() => {
    if (!shop.catchText || lang === "ja") return;
    let live = true;
    setCatchTr({ id: shop.id, text: null }); // 처음 번역하는 가게는 몇 초 걸려서 '번역하는 중'을 보여 줌 (10/22 도그푸딩)
    fetchShopCatch(shop.id, lang)
      .then((text) => live && setCatchTr(text ? { id: shop.id, text } : null))
      .catch(() => live && setCatchTr(null)); // 번역이 없으면 원문만 (서버가 잠들어 있으면 다음에)
    return () => {
      live = false;
    };
  }, [shop.id, shop.catchText, lang]);

  const time = lunchTimeText(shop, day, minutes, t);
  const range = priceRange(shop, t);
  const typical = shop.typicalPrice !== null ? t("price.yen", { n: shop.typicalPrice.toLocaleString("ja-JP") }) : null;
  const limitYen = limit.toLocaleString("ja-JP");
  const confirmed = priceBadge(shop, limit) === "confirmed";

  return (
    <section
      className={`relative z-[600] -mt-4 flex flex-col gap-2.5 overflow-y-auto rounded-t-[20px] bg-white px-5 pb-4 pt-0.5 ${collapsed ? "flex-none" : "flex-1"}`}
    >
      <button
        type="button"
        onClick={onToggle}
        {...handle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? t("home.sheetShow") : t("home.sheetHide")}
        className="-mb-2 flex h-8 w-full flex-none items-center justify-center"
      >
        <span className="h-1 w-10 rounded-full bg-[#CFCCC2]" />
      </button>
      {collapsed ? (
        // 접었을 때는 어느 가게인지만 한 줄로 (누르면 다시 펼침)
        <button type="button" onClick={onToggle} className="flex items-center gap-3 pb-1 pt-1 text-left">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[17px] font-semibold">{shop.name}</span>
            <span className="text-[13px] text-[#1A3F91]">{t("common.walk", { n: shop.walk })}</span>
          </span>
          <span className="flex-none text-lg font-semibold">{range}</span>
        </button>
      ) : null}
      {collapsed ? (
        // 접어도 출처 표기는 남김 (약관)
        <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="text-[10px] text-[#5F5E58] underline">
          Powered by ホットペッパー グルメ Webサービス
        </a>
      ) : (
      <>
      {shop.photoUrl && (
        <div className="relative h-[140px] flex-none overflow-hidden rounded-xl bg-[#ECEAE3]">
          {/* eslint-disable-next-line @next/next/no-img-element -- 핫페퍼 사진을 그대로 씀 */}
          <img src={shop.photoUrl} alt="" className="h-full w-full object-cover" />
          <span className="absolute bottom-1.5 right-2 rounded bg-white/85 px-1.5 text-[11px] text-[#5F5E58]">
            画像提供：ホットペッパー グルメ
          </span>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h1 ref={title} tabIndex={-1} className="text-[22px] font-semibold leading-snug outline-none">
          {shop.name}
        </h1>
        <p className="text-sm text-[#5F5E58]">
          {shop.genre ? `${genreLabel(shop.genre, t)} · ` : ""}
          <span className="font-semibold text-[#1A3F91]">{t("common.walk", { n: shop.walk })}</span>
        </p>
        {shop.catchText && (
          <div className="flex flex-col gap-0.5">
            {/* 가게 소개는 저녁 · 연회 얘기일 때도 있어서 점심 정보가 아니라는 걸 붙여 둠 (10/22 결정) */}
            <p className="text-[11px] text-[#5F5E58]">{t("result.catchLabel")}</p>
            <p className="text-[13px] leading-snug text-[#5F5E58]">「{shop.catchText}」</p>
            {catchTr?.id === shop.id &&
              (catchTr.text === null ? (
                <p className="flex items-center gap-1.5 text-[12px] text-[#5F5E58]" aria-live="polite">
                  <span
                    className="h-3 w-3 flex-none rounded-full border-2 border-[#CFCCC2] border-t-[#2457C5] motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  {t("result.catchTranslating")}
                </p>
              ) : (
                <p className="text-[13px] leading-snug text-[#1F1F1C]">
                  {catchTr.text} <span className="whitespace-nowrap text-[11px] text-[#5F5E58]">· {t("i18n.ai")}</span>
                </p>
              ))}
          </div>
        )}
        <p className={`text-sm ${time.soon ? "font-semibold text-[#9A4A00]" : "text-[#5F5E58]"}`}>
          {time.soon ? `${t("result.closingSoon")} · ` : ""}
          {time.text}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[22px] font-semibold">{range}</span>
        {confirmed ? (
          <span className="flex items-center gap-1 rounded-xl bg-[#E3F1E6] px-2.5 py-0.5 text-[13px] font-semibold text-[#1E6B35]">
            <svg {...svg} width={14} height={14} strokeWidth={2.5}>
              <path d="M5 12l5 5 9-10" />
            </svg>
            {t("result.priceConfirmed")}
          </span>
        ) : (
          <span className="rounded-xl bg-[#FFF1DC] px-2.5 py-0.5 text-[13px] font-semibold text-[#8A4B00]">{t("result.aiJudged")}</span>
        )}
      </div>
      {!confirmed && (
        <p className="-mt-1 text-[13px] text-[#5F5E58]">
          {typical && range !== typical ? t("result.aiNoteTypical", { typical, limit: limitYen }) : t("result.aiNote", { limit: limitYen })}
        </p>
      )}

      {/* 핫페퍼 API 글에는 점심 메뉴 이름이 거의 없어서(10/21 확인: 가격 근거에 메뉴가 있는 곳 7/250) 메뉴는 핫페퍼 페이지로 보냄 */}
      {shop.hotpepperUrl && (
        <a
          href={shop.hotpepperUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => track("menu_link_click")} // 메뉴 보기 비율 (10/21 결정 C)
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#2457C5] text-[15px] font-semibold text-[#1A3F91]"
        >
          {t("result.menuLink")}
          <svg {...svg} width={16} height={16}>
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      )}

      {goingAt ? (
        // 이미 정한 가게: 정한 시각 + 길찾기 · 도착했어요 · 취소 (취소는 한 번 더 물어봄)
        <div className="mt-1 flex flex-col gap-2 rounded-[14px] border border-[#2457C5] bg-[#E8EEFA] p-3 text-[#1A3F91]" aria-live="polite">
          <p className="text-[15px] font-semibold">{t("result.goingChosen", { time: clockTime(goingAt) })}</p>
          {asking ? (
            <>
              <p className="text-sm">{t("going.confirm")}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={onCancelGoing} className="h-12 rounded-xl bg-[#1A3F91] text-[15px] font-semibold text-white">
                  {t("going.confirmYes")}
                </button>
                <button type="button" onClick={() => setAsking(false)} className="h-12 rounded-xl border border-[#9DB3E3] bg-white text-[15px]">
                  {t("going.confirmNo")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={directionsUrl(shop)}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => track("directions_click", { from: "going" })}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#2457C5] text-[15px] font-semibold text-white"
                >
                  {t("going.directions")}
                  <svg {...svg} width={16} height={16}>
                    <path d="M14 4h6v6" />
                    <path d="M20 4l-9 9" />
                    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                  </svg>
                </a>
                <button
                  type="button"
                  onClick={onArrive}
                  className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#1A3F91] text-[15px] font-semibold text-white"
                >
                  <svg {...svg} width={16} height={16} strokeWidth={2.5}>
                    <path d="M5 12l5 5 9-10" />
                  </svg>
                  {t("result.arrive")}
                </button>
              </div>
              <button type="button" onClick={() => setAsking(true)} className="-mb-1 min-h-11 self-center px-3 text-sm text-[#1A3F91] underline">
                {t("going.cancel")}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="mt-1 flex flex-col gap-2">
          <button type="button" onClick={onGo} className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white">
            {t("result.go")}
          </button>
          <button
            type="button"
            onClick={onRespin}
            disabled={!canRespin}
            className="h-12 rounded-[14px] border border-[#CFCCC2] text-base disabled:opacity-50"
          >
            {t("result.respin")}
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 text-sm">
        <button
          type="button"
          onClick={() => {
            setOrderOpen(true);
            track("order_open");
          }}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap text-[#1F1F1C]"
        >
          <svg {...svg} width={18} height={18}>
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          {t("result.orderOpen")}
        </button>
      </div>

      <div className="flex flex-col gap-1 text-xs text-[#5F5E58]">
        {shop.priceEvidence && (
          <details>
            <summary className="min-h-8 cursor-pointer py-1">{t("result.priceSource")}</summary>
            <p className="rounded-lg bg-[#F4F3EF] p-2 leading-relaxed">「{shop.priceEvidence}」</p>
          </details>
        )}
        <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
          Powered by ホットペッパー グルメ Webサービス
        </a>
      </div>
      </>
      )}
      {orderOpen && <OrderSheet onClose={() => setOrderOpen(false)} />}
    </section>
  );
}
