"use client";

// 도착했어요 (10/22 결정: 버튼 + 앱을 열 때 가게 근처면 자동). 도감에는 이미 넣었고, 그 자리에서 영업 여부만 물음
// 가격은 먹고 나서: 1시간 반 뒤 알림 · 다음에 열 때 질문 카드가 가격만 물음
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { arriveVisit } from "@/lib/api";
import { useT } from "./I18n";

type Props = {
  visitId: string;
  shopName: string;
  limit: number; // 여기 갈래요 때 고른 가격 상한
  by: "auto" | "manual";
  onClose: () => void;
  onOpenZukan: () => void;
  onPickAnother: () => void; // 영업을 안 해서 다른 가게를 고름
};

export default function ArriveSheet({ visitId, shopName, limit, by, onClose, onOpenZukan, onPickAnother }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState<boolean | null>(null); // 영업 중인지 답 (null: 아직)
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), [open]);

  const answer = (openOk: boolean) => {
    arriveVisit(visitId, by, openOk); // 닫혀 있었으면 서버가 더 묻지 않음 (가격은 알 수 없어서)
    track("arrive_answer", { open_ok: openOk, by });
    setOpen(openOk);
  };

  const primary = "h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white";
  const secondary = "h-12 rounded-[14px] border border-[#CFCCC2] text-base";

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="arrive-title"
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-white px-6 pb-7 pt-6 text-[#1F1F1C]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            {by === "auto" && <p className="text-[13px] text-[#5F5E58]">{t("arrive.auto")}</p>}
            <h1 ref={title} id="arrive-title" tabIndex={-1} className="text-2xl font-semibold outline-none">
              {t("arrive.title")}
            </h1>
            <p className="text-[15px] text-[#1A3F91]">{t("arrive.saved", { shop: shopName })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="-mr-2 -mt-2 flex h-11 w-11 flex-none items-center justify-center text-[#5F5E58]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {open === null && (
          <>
            <p className="border-t border-[#ECEAE3] pt-4 text-base font-semibold">{t("arrive.openQ")}</p>
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => answer(true)} className="h-[52px] rounded-xl border border-[#CFCCC2] bg-white text-base">
                {t("arrive.openYes")}
              </button>
              <button type="button" onClick={() => answer(false)} className="h-[52px] rounded-xl border border-[#CFCCC2] bg-white text-base">
                {t("arrive.openNo")}
              </button>
            </div>
            <button type="button" onClick={onClose} className="min-h-11 self-center px-3 text-sm text-[#5F5E58] underline">
              {t("arrive.later")}
            </button>
          </>
        )}

        {open === true && (
          <>
            <p className="text-sm leading-relaxed text-[#5F5E58]" aria-live="polite">
              {t("arrive.thanksOpen", { limit: limit.toLocaleString("ja-JP") })}
            </p>
            <button type="button" onClick={onOpenZukan} className={primary}>
              {t("feedback.openZukan")}
            </button>
            <button type="button" onClick={onClose} className={secondary}>
              {t("common.close")}
            </button>
          </>
        )}

        {open === false && (
          <>
            <p className="text-sm leading-relaxed text-[#5F5E58]" aria-live="polite">
              {t("arrive.thanksClosed")}
            </p>
            <button type="button" onClick={onPickAnother} className={primary}>
              {t("arrive.pickAnother")}
            </button>
            <button type="button" onClick={onClose} className={secondary}>
              {t("common.close")}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
