"use client";

// S4 여기 갈래요 후: 길찾기 + '다녀온 뒤에 알려 주세요' 안내. 알림은 10/28에 붙이고, 지금은 다음에 앱을 열 때 물어봄
import { useEffect, useRef } from "react";
import { directionsUrl, priceRange, type NearbyShop } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { svg } from "./icons";

export default function GoScreen({ shop, onHome }: { shop: NearbyShop; onHome: () => void }) {
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);

  return (
    <section className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-7 pt-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8EEFA] text-[#1A3F91]">
        <svg {...svg} width={28} height={28} strokeWidth={2.4}>
          <path d="M5 12l5 5 9-10" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 ref={title} tabIndex={-1} className="text-2xl font-semibold outline-none">
          좋아요, 맛있게 드세요
        </h1>
        <p className="text-[15px] text-[#5F5E58]">
          {shop.name} · 걸어서 {shop.walk}분 · {priceRange(shop)}
        </p>
      </div>
      <a
        href={directionsUrl(shop)}
        target="_blank"
        rel="noreferrer"
        onClick={() => track("directions_click", { from: "go" })}
        className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white"
      >
        구글 지도로 길찾기
        <svg {...svg} width={18} height={18}>
          <path d="M14 4h6v6" />
          <path d="M20 4l-9 9" />
          <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
      </a>
      <div className="flex flex-col gap-2 rounded-[14px] border border-[#D6D4CC] p-[18px]">
        <p className="flex items-center gap-2 text-base font-semibold">
          <svg {...svg} width={20} height={20}>
            <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" />
            <path d="M10 20a2 2 0 0 0 4 0" />
          </svg>
          다녀온 뒤에 알려 주세요
        </p>
        <p className="text-sm leading-relaxed text-[#5F5E58]">
          1시간쯤 지나 앱을 다시 열면 영업하고 있었는지, 가격이 맞았는지 물어볼게요. 다음 사람에게 더 정확한 가게를 보여 줄 수 있어요.
        </p>
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onHome} className="min-h-11 text-sm text-[#2457C5]">
        홈으로
      </button>
    </section>
  );
}
