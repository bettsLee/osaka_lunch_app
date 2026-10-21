"use client";

// S1b 점심 가격 상한 고르기 (790 / 990 / 1,190엔). 2km 안에 5곳이 안 되는 단계는 잠김
import { useEffect, useRef, useState } from "react";
import { DEFAULT_LIMIT, type TierInfo } from "@/lib/lunch";
import { svg } from "./icons";

type Props = { tiers: TierInfo[]; current: number; onApply: (limit: number) => void; onClose: () => void };

const yen = (n: number) => n.toLocaleString("ja-JP");

export default function PriceSheet({ tiers, current, onApply, onClose }: Props) {
  const [choice, setChoice] = useState(current);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-t-[20px] bg-white px-5 pb-7 pt-3 text-[#1F1F1C]"
      >
        <div className="h-1 w-10 self-center rounded-full bg-[#CFCCC2]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 ref={title} id="price-title" tabIndex={-1} className="text-xl font-semibold outline-none">
            점심 가격 상한
          </h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="-mr-2 flex h-11 w-11 items-center justify-center">
            <svg {...svg}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="text-sm leading-relaxed text-[#5F5E58]">정식 · 런치 세트 같은 대표 점심 메뉴가 이 금액 이하인 가게만 보여 줘요.</p>

        {tiers.map((t) =>
          t.locked ? (
            <div key={t.limit} className="flex min-h-[60px] items-center gap-3 rounded-xl border border-[#D6D4CC] bg-[#F4F3EF] px-4">
              <svg {...svg} width={20} height={20} className="flex-none text-[#5F5E58]">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <div className="flex flex-col gap-0.5">
                <p className="text-base font-semibold text-[#5F5E58]">{yen(t.limit)}엔 이하</p>
                <p className="text-[13px] text-[#5F5E58]">근처에 5곳이 안 돼서 지금은 고를 수 없어요</p>
              </div>
            </div>
          ) : (
            <button
              key={t.limit}
              type="button"
              aria-pressed={choice === t.limit}
              onClick={() => setChoice(t.limit)}
              className={`flex min-h-[60px] items-center gap-3 rounded-xl px-4 text-left ${
                choice === t.limit ? "border-2 border-[#2457C5] bg-[#E8EEFA]" : "border border-[#CFCCC2] bg-white"
              }`}
            >
              <span
                className={`h-5 w-5 flex-none rounded-full ${choice === t.limit ? "border-[6px] border-[#2457C5]" : "border-2 border-[#8D8B84]"}`}
                aria-hidden="true"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-base font-semibold">
                  {yen(t.limit)}엔 이하{t.limit === DEFAULT_LIMIT ? " (기본)" : ""}
                </span>
                <span className="text-[13px] text-[#5F5E58]">
                  {t.radiusKm}km 안 {t.count}곳
                </span>
              </span>
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onApply(choice)}
          className="mt-1 h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white"
        >
          이 가격으로 보기
        </button>
      </section>
    </div>
  );
}
