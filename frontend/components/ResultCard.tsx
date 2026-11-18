"use client";

// S3 결과 카드: 사진 · 장르 · 가격 + 배지 · 이름 · 걸어서 n분 · 오늘 점심 시간 · 대표 메뉴(11/17) · 여기 갈래요 / 랜덤으로 가게 고르기(10/22: 핀 · 목록에서 와도 맞는 이름) · 주문 문장 · 원문
// 길찾기는 여기 갈래요 뒤 화면 · 홈의 가는 중에서 (10/22 도그푸딩: 여기 갈래요와 겹침)
import { useEffect, useRef, useState } from "react";
import { directionsUrl, genreLabel, lunchTimeShort, priceBadge, priceRange, type Day, type NearbyShop } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { clockTime } from "@/lib/visits";
import { cardTouchAction } from "@/lib/swipe";
import { useT } from "./I18n";
import { svg } from "./icons";
import MenuHintBlock from "./MenuHintBlock";
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
  handle?: ReturnType<typeof useSheetSwipe>; // 카드 스와이프 (없으면 손잡이 누르기만)
  goingAt?: string | null; // 이미 여기 갈래요로 정한 가게면 정한 시각: 여기 갈래요 · 랜덤 대신 길찾기 · 도착했어요 · 취소 (10/22 도그푸딩: 가는 중 배너 대신)
  onCancelGoing?: () => void;
  onArrive?: () => void; // 도착했어요 버튼 (GPS가 빌딩 사이에서 튀어 자동으로 못 알아챘을 때)
};

export default function ResultCard(props: Props) {
  const { shop, day, minutes, limit, onGo, onRespin, canRespin, collapsed, onToggle, handle, goingAt = null, onCancelGoing, onArrive } = props;
  const { t } = useT();
  const [orderOpen, setOrderOpen] = useState(false);
  const [asking, setAsking] = useState(false); // 취소를 한 번 더 물어보는 중
  const [atTop, setAtTop] = useState(true); // 카드를 맨 위까지 올려 둔 상태 (아래로 끌면 접기)
  const card = useRef<HTMLElement>(null);
  useEffect(() => setAtTop((card.current?.scrollTop ?? 0) <= 0), [collapsed, shop.id]); // 접고 펼치거나 가게가 바뀌면 다시 잼
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), [shop.id]); // 결과가 나오면 화면 읽기 프로그램이 가게 이름부터 읽게

  const time = lunchTimeShort(shop, day, minutes, t); // 11/17: 카드는 짧게 (주문 마감이 영업 끝과 같으면 한 번만)
  const range = priceRange(shop, t);
  const badge = priceBadge(shop, limit); // unknown: 핫페퍼에 점심 가격이 없는 가게 ('가격 모르는 곳도'를 켰을 때, 11/17)

  // 카드 어디서든 끌어서 접고 펼치기 (10/29 상권: 손잡이만 잡혀서 불편). 주문 도우미가 떠 있으면 그쪽 손가락은 건드리지 않음
  const swipeHere = handle && !orderOpen;
  return (
    <section
      ref={card}
      {...(swipeHere ? handle.area : {})}
      onScroll={(e) => setAtTop(e.currentTarget.scrollTop <= 0)}
      style={swipeHere ? { touchAction: cardTouchAction(collapsed, atTop) } : undefined}
      className={`relative z-[600] -mt-4 flex flex-col gap-2.5 overflow-y-auto rounded-t-[20px] bg-white px-5 pb-4 pt-0.5 ${collapsed ? "flex-none" : "flex-1"}`}
    >
      <button
        type="button"
        onClick={handle ? handle.onClick : onToggle}
        style={handle ? { touchAction: "none" } : undefined}
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
        // 접어도 출처 표기는 남김 (약관). 핫페퍼가 준 부분만 밝힘 (10/24 리크루트 답)
        <p className="text-[10px] text-[#5F5E58]">
          {t("credit.shop")}:{" "}
          <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
            Powered by ホットペッパー グルメ Webサービス
          </a>
        </p>
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

      {/* 11/17 결정 (OL-65): 카드를 열자마자 '무엇 · 얼마'가 보이게 장르 · 가격을 맨 위로 */}
      {/* 11/18 상권 "가격이 이렇게 표기되는 게 맞아?": 아래 대표 메뉴(저녁일 수도)와 헷갈리지 않게 '점심 900엔' + 가게 글 원문 한 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[22px] font-semibold">
          {shop.genre ? `${genreLabel(shop.genre, t)} · ` : ""}
          {badge === "unknown" ? range : t("result.lunchPrice", { range })}
        </span>
        {badge === "confirmed" ? (
          <span className="flex items-center gap-1 rounded-xl bg-[#E3F1E6] px-2.5 py-0.5 text-[13px] font-semibold text-[#1E6B35]">
            <svg {...svg} width={14} height={14} strokeWidth={2.5}>
              <path d="M5 12l5 5 9-10" />
            </svg>
            {t("result.priceConfirmed")}
          </span>
        ) : badge === "unknown" ? (
          <span className="rounded-xl bg-[#ECEAE3] px-2.5 py-0.5 text-[13px] font-semibold text-[#5F5E58]">{t("result.priceUnknownBadge")}</span>
        ) : (
          <span className="rounded-xl bg-[#FFF1DC] px-2.5 py-0.5 text-[13px] font-semibold text-[#8A4B00]">{t("result.aiJudged")}</span>
        )}
      </div>
      {/* 가격을 읽은 핫페퍼 가게 글 원문 그대로 (번안 · 가공 금지, 10/24 리크루트 답). 예전 '가격 원문 보기'를 펼치지 않아도 보이게 */}
      {shop.priceEvidence && (
        <p className="-mt-1 line-clamp-2 text-[13px] leading-snug text-[#5F5E58]">
          {t("result.priceSourceInline")}: 「{shop.priceEvidence}」
        </p>
      )}
      <div className="-mt-1 flex flex-col gap-1">
        <h1 ref={title} tabIndex={-1} className="text-[19px] font-semibold leading-snug outline-none">
          {shop.name}
        </h1>
        <p className="text-sm text-[#5F5E58]">
          <span className="font-semibold text-[#1A3F91]">{t("common.walk", { n: shop.walk })}</span>
          {" · "}
          <span className={time.soon ? "font-semibold text-[#9A4A00]" : undefined}>
            {time.soon ? `${t("result.closingSoon")} · ` : ""}
            {time.text}
          </span>
        </p>
      </div>

      {/* 대표 메뉴 (구글 지도 그라운딩). 핫페퍼 API 글에는 점심 메뉴 이름이 거의 없음 (10/21 확인: 7/250) */}
      <MenuHintBlock shopId={shop.id} shopName={shop.name} />

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
        {/* 11/17: 큰 버튼 → 작은 링크 (정보가 많다는 상권 의견). 메뉴 · 사진은 핫페퍼 페이지에도 있음 */}
        {shop.hotpepperUrl && (
          <a
            href={shop.hotpepperUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("menu_link_click")} // 메뉴 보기 비율 (10/21 결정 C)
            className="flex min-h-11 items-center gap-1 whitespace-nowrap text-[#1A3F91]"
          >
            {t("result.menuLinkShort")}
            <svg {...svg} width={14} height={14}>
              <path d="M14 4h6v6" />
              <path d="M20 4l-9 9" />
              <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
        )}
      </div>

      <div className="flex flex-col gap-1 text-xs text-[#5F5E58]">
        {shop.catchText && (
          <details>
            <summary className="min-h-8 cursor-pointer py-1">{t("result.catchShow")}</summary>
            {/* 저녁 · 연회 얘기일 때도 있어서 점심 정보가 아니라는 걸 붙여 둠 (10/22). 원문 그대로 (10/24 리크루트 답: 번안 · 가공 금지) */}
            <p className="rounded-lg bg-[#F4F3EF] p-2 leading-relaxed">
              {t("result.catchLabel")}
              <br />「{shop.catchText}」
            </p>
          </details>
        )}
        <p>
          {t("credit.shop")}:{" "}
          <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
            Powered by ホットペッパー グルメ Webサービス
          </a>
        </p>
        {/* 점심 시간 · 가격은 AI가 만든 값이라 핫페퍼 정보로 착각하지 않게 (10/24 리크루트 답). 11/17: 맨 아래 출처 줄로 */}
        <p>{t("result.aiSource")}</p>
      </div>
      </>
      )}
      {orderOpen && <OrderSheet onClose={() => setOrderOpen(false)} />}
    </section>
  );
}
