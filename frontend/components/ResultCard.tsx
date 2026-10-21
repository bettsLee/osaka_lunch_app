"use client";

// S3 결과 카드: 사진 · 이름 · 걸어서 n분 · 오늘 점심 시간 · 가격 + 배지 · 여기 갈래요 / 다시 돌리기 · 길찾기 · 원문
import { useEffect, useRef } from "react";
import {
  directionsUrl, genreLabel, lunchTimeText, priceBadge, priceRange,
  type Day, type NearbyShop,
} from "@/lib/lunch";
import { svg } from "./icons";

type Props = { shop: NearbyShop; day: Day; minutes: number; onRespin: () => void; canRespin: boolean };

export default function ResultCard({ shop, day, minutes, onRespin, canRespin }: Props) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), [shop.id]); // 결과가 나오면 화면 읽기 프로그램이 가게 이름부터 읽게

  const time = lunchTimeText(shop, day, minutes);
  const range = priceRange(shop);
  const typical = shop.typicalPrice !== null ? `${shop.typicalPrice.toLocaleString("ja-JP")}엔` : null;
  const confirmed = priceBadge(shop) === "confirmed";

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
          {shop.genre ? `${genreLabel(shop.genre)} · ` : ""}
          <span className="font-semibold text-[#1A3F91]">걸어서 {shop.walk}분</span>
        </p>
        {shop.catchText && <p className="text-[13px] leading-snug text-[#5F5E58]">「{shop.catchText}」</p>}
        <p className={`text-sm ${time.soon ? "font-semibold text-[#9A4A00]" : "text-[#5F5E58]"}`}>
          {time.soon ? "곧 마감 · " : ""}
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
            가격 확인됨
          </span>
        ) : (
          <span className="rounded-xl bg-[#FFF1DC] px-2.5 py-0.5 text-[13px] font-semibold text-[#8A4B00]">AI 판단</span>
        )}
      </div>
      {!confirmed && (
        <p className="-mt-1 text-[13px] text-[#5F5E58]">
          {typical && range !== typical ? `대표 점심 메뉴 ${typical} · ` : ""}가게 글을 AI가 읽고 990엔 이하로 판단했어요
        </p>
      )}

      {/* 핫페퍼 API 글에는 점심 메뉴 이름이 거의 없어서(10/21 확인: 가격 근거에 메뉴가 있는 곳 7/250) 메뉴는 핫페퍼 페이지로 보냄 */}
      {shop.hotpepperUrl && (
        <a
          href={shop.hotpepperUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-[#2457C5] text-[15px] font-semibold text-[#1A3F91]"
        >
          핫페퍼에서 메뉴 · 사진 보기
          <svg {...svg} width={16} height={16}>
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      )}

      <div className="mt-1 flex flex-col gap-2">
        <button
          type="button"
          disabled
          title="다음 단계에서 붙여요"
          className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white disabled:opacity-50"
        >
          여기 갈래요
        </button>
        <button
          type="button"
          onClick={onRespin}
          disabled={!canRespin}
          className="h-12 rounded-[14px] border border-[#CFCCC2] text-base disabled:opacity-50"
        >
          다시 돌리기
        </button>
      </div>

      <div className="flex items-center justify-between text-sm">
        <button type="button" disabled title="다음 단계에서 붙여요" className="flex min-h-11 items-center gap-1.5 text-[#1F1F1C] disabled:opacity-50">
          <svg {...svg} width={18} height={18}>
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          주문 문장 보기
        </button>
        <a href={directionsUrl(shop)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center gap-1.5 text-[#2457C5]">
          구글 지도로 길찾기
          <svg {...svg} width={16} height={16}>
            <path d="M14 4h6v6" />
            <path d="M20 4l-9 9" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      </div>

      <div className="flex flex-col gap-1 text-xs text-[#5F5E58]">
        {shop.priceEvidence && (
          <details>
            <summary className="min-h-8 cursor-pointer py-1">가격 원문 보기</summary>
            <p className="rounded-lg bg-[#F4F3EF] p-2 leading-relaxed">「{shop.priceEvidence}」</p>
          </details>
        )}
        <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
          Powered by ホットペッパー グルメ Webサービス
        </a>
      </div>
    </section>
  );
}
