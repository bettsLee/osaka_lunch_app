"use client";

// 거리 직접 고르기 (11/28 베타 설문 "검색 범위 지정"). 자동(기본)은 가까운 가게가 적으면 2km까지 넓힘
import { useEffect, useRef, useState } from "react";
import { PICK_RADII_KM, walkMinutes } from "@/lib/lunch";
import { useT } from "./I18n";
import { svg } from "./icons";

type Props = { current: number | null; onApply: (radiusKm: number | null) => void; onClose: () => void };

export default function RadiusSheet({ current, onApply, onClose }: Props) {
  const { t } = useT();
  const [choice, setChoice] = useState<number | null>(current);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const options: { value: number | null; label: string; sub: string }[] = [
    { value: null, label: t("radiusSheet.auto"), sub: t("radiusSheet.autoHelp") },
    ...PICK_RADII_KM.map((km) => ({ value: km, label: t("radiusSheet.option", { radius: km }), sub: t("radiusSheet.walk", { n: walkMinutes(km) }) })),
  ];

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="radius-title"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[480px] flex-col gap-3.5 rounded-t-[20px] bg-white px-5 pb-7 pt-3 text-[#1F1F1C]"
      >
        <div className="h-1 w-10 self-center rounded-full bg-[#CFCCC2]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 ref={title} id="radius-title" tabIndex={-1} className="text-xl font-semibold outline-none">
            {t("radiusSheet.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="-mr-2 flex h-11 w-11 items-center justify-center">
            <svg {...svg}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {options.map((o) => (
          <button
            key={o.value ?? "auto"}
            type="button"
            aria-pressed={choice === o.value}
            onClick={() => setChoice(o.value)}
            className={`flex min-h-[60px] items-center gap-3 rounded-xl px-4 text-left ${
              choice === o.value ? "border-2 border-[#2457C5] bg-[#E8EEFA]" : "border border-[#CFCCC2] bg-white"
            }`}
          >
            <span
              className={`h-5 w-5 flex-none rounded-full ${choice === o.value ? "border-[6px] border-[#2457C5]" : "border-2 border-[#8D8B84]"}`}
              aria-hidden="true"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-semibold">{o.label}</span>
              <span className="text-[13px] text-[#5F5E58]">{o.sub}</span>
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => onApply(choice)}
          className="mt-1 h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white"
        >
          {t("radiusSheet.apply")}
        </button>
      </section>
    </div>
  );
}
