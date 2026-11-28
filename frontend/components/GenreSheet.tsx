"use client";

// 가게 종류로 고르기 (11/28 베타 설문: "식당 분류가 안 됨" · "끌리는 가게가 없음"). 여러 개 고를 수 있음, 아무것도 안 고르면 전체
import { useEffect, useRef, useState } from "react";
import { genreLabel } from "@/lib/lunch";
import { useT } from "./I18n";
import { svg } from "./icons";

type Props = { genres: string[]; current: string[]; onApply: (genres: string[]) => void; onClose: () => void };

export default function GenreSheet({ genres, current, onApply, onClose }: Props) {
  const { t } = useT();
  const [choice, setChoice] = useState<string[]>(current.filter((g) => genres.includes(g)));
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const toggle = (g: string) => setChoice((c) => (c.includes(g) ? c.filter((x) => x !== g) : [...c, g]));

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="genre-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85dvh] w-full max-w-[480px] flex-col gap-3.5 rounded-t-[20px] bg-white px-5 pb-7 pt-3 text-[#1F1F1C]"
      >
        <div className="h-1 w-10 self-center rounded-full bg-[#CFCCC2]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 ref={title} id="genre-title" tabIndex={-1} className="text-xl font-semibold outline-none">
            {t("genreSheet.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="-mr-2 flex h-11 w-11 items-center justify-center">
            <svg {...svg}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="text-sm leading-relaxed text-[#5F5E58]">{t("genreSheet.help")}</p>

        <div className="grid grid-cols-2 gap-2 overflow-y-auto">
          {genres.map((g) => {
            const on = choice.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(g)}
                className={`flex min-h-[52px] items-center gap-2.5 rounded-xl px-3.5 text-left text-[15px] ${
                  on ? "border-2 border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border border-[#CFCCC2] bg-white"
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-md ${on ? "bg-[#2457C5]" : "border-2 border-[#8D8B84]"}`}
                  aria-hidden="true"
                >
                  {on && (
                    <svg {...svg} width={14} height={14} strokeWidth={3} className="text-white">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  )}
                </span>
                {genreLabel(g, t)}
              </button>
            );
          })}
        </div>

        <div className="mt-1 flex gap-2">
          <button
            type="button"
            onClick={() => onApply([])}
            className="h-14 flex-none rounded-[14px] border border-[#CFCCC2] px-5 text-base font-semibold"
          >
            {t("genreSheet.clear")}
          </button>
          <button
            type="button"
            onClick={() => onApply(choice)}
            className="h-14 flex-1 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white"
          >
            {t("genreSheet.apply")}
          </button>
        </div>
      </section>
    </div>
  );
}
