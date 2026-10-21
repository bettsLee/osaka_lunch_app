"use client";

// 홈의 '○○에 가는 중' (10/22 도그푸딩): 여기 갈래요 뒤 1시간 동안. 길찾기를 다시 열거나 취소할 수 있음
// 취소는 한 번 더 물어봄 (브라우저 확인 창 대신 화면 안에서)
import { useState } from "react";
import { directionsUrl } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { clockTime, type Going } from "@/lib/visits";
import { useT } from "./I18n";
import { svg } from "./icons";

export default function GoingBanner({ going, onCancel }: { going: Going; onCancel: () => void }) {
  const { t } = useT();
  const [asking, setAsking] = useState(false);
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-[#2457C5] bg-[#E8EEFA] px-4 py-3 text-[#1A3F91]" aria-live="polite">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-2.5 w-2.5 flex-none animate-pulse rounded-full bg-[#2457C5]" aria-hidden="true" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-base font-semibold">{t("going.title", { shop: going.shopName })}</p>
          <p className="text-[13px]">{t("going.meta", { time: clockTime(going.chosenAt), n: going.walk })}</p>
        </div>
      </div>
      {asking ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{t("going.confirm")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onCancel} className="h-11 rounded-xl bg-[#1A3F91] text-[15px] font-semibold text-white">
              {t("going.confirmYes")}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="h-11 rounded-xl border border-[#9DB3E3] bg-white text-[15px]">
              {t("going.confirmNo")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <a
            href={directionsUrl(going)}
            target="_blank"
            rel="noreferrer"
            onClick={() => track("directions_click", { from: "going" })}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#2457C5] text-[15px] font-semibold text-white"
          >
            {t("going.directions")}
            <svg {...svg} width={16} height={16}>
              <path d="M14 4h6v6" />
              <path d="M20 4l-9 9" />
              <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
            </svg>
          </a>
          <button type="button" onClick={() => setAsking(true)} className="h-11 rounded-xl border border-[#9DB3E3] bg-white text-[15px]">
            {t("going.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
