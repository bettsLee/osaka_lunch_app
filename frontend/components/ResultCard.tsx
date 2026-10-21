"use client";

// S3 결과 카드: 사진 · 이름 · 걸어서 n분 · 오늘 점심 시간 · 가격 + 배지 · 여기 갈래요 / 다시 돌리기 · 주문 문장 · 원문
// 길찾기는 여기 갈래요 뒤 화면 · 홈의 가는 중에서 (10/22 도그푸딩: 여기 갈래요와 겹침)
import { useEffect, useRef, useState } from "react";
import { genreLabel, lunchTimeText, priceBadge, priceRange, type Day, type NearbyShop } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { fetchShopCatch } from "@/lib/api";
import { useT } from "./I18n";
import { svg } from "./icons";
import OrderSheet from "./OrderSheet";

type Props = {
  shop: NearbyShop;
  day: Day;
  minutes: number;
  limit: number; // 지금 고른 가격 상한
  onGo: () => void;
  onRespin: () => void;
  canRespin: boolean;
};

export default function ResultCard({ shop, day, minutes, limit, onGo, onRespin, canRespin }: Props) {
  const { t, lang } = useT();
  const [orderOpen, setOrderOpen] = useState(false);
  const [catchTr, setCatchTr] = useState<{ id: string; text: string } | null>(null); // 가게 소개 AI 번역 (일본어 화면은 원문만)
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), [shop.id]); // 결과가 나오면 화면 읽기 프로그램이 가게 이름부터 읽게
  useEffect(() => {
    if (!shop.catchText || lang === "ja") return;
    let live = true;
    fetchShopCatch(shop.id, lang)
      .then((text) => live && text && setCatchTr({ id: shop.id, text }))
      .catch(() => {}); // 번역이 없으면 원문만 (서버가 잠들어 있으면 다음에)
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
    <section className="relative z-[600] -mt-4 flex flex-1 flex-col gap-2.5 overflow-y-auto rounded-t-[20px] bg-white px-5 pb-4 pt-4">
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
        {shop.catchText && <p className="text-[13px] leading-snug text-[#5F5E58]">「{shop.catchText}」</p>}
        {catchTr?.id === shop.id && (
          <p className="text-[13px] leading-snug text-[#1F1F1C]">
            {catchTr.text} <span className="whitespace-nowrap text-[11px] text-[#5F5E58]">· {t("i18n.ai")}</span>
          </p>
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
      {orderOpen && <OrderSheet onClose={() => setOrderOpen(false)} />}
    </section>
  );
}
