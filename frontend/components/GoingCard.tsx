"use client";

// 정한 가게 카드 (10/22 도그푸딩: 내비게이션처럼 늘 보이게). 여기 갈래요 뒤 1시간, 도착하거나 취소할 때까지
// full: 홈 아래 시트 자리 · bar: 시트를 접었을 때 · 도감 · 설정 탭에서 탭 위 한 줄
import { useState } from "react";
import { directionsUrl, walkMinutes } from "@/lib/lunch";
import { track } from "@/lib/analytics";
import { clockTime, distanceLabel, type Going } from "@/lib/visits";
import { useT } from "./I18n";
import { svg } from "./icons";

type Props = {
  going: Going;
  price: string | null; // 가게 목록에 있으면 가격 표시
  distanceM: number | null; // 마지막으로 잰 위치에서 가게까지 (앱을 열거나 돌아올 때 다시 잼)
  onArrive: () => void;
};

// 남은 거리 · 걸어서 n분 (거리를 모르면 여기 갈래요 때의 걸어서 n분)
function useDistanceText(going: Going, distanceM: number | null): string {
  const { t } = useT();
  const walk = t("common.walk", { n: distanceM === null ? going.walk : walkMinutes(distanceM / 1000) });
  return distanceM === null ? walk : `${t("going.about", { d: distanceLabel(distanceM) })} · ${walk}`;
}

export function GoingPanel(props: Props & { onCancel: () => void; onInfo: (() => void) | null }) {
  const { going, price, distanceM, onArrive, onCancel, onInfo } = props;
  const { t } = useT();
  const [asking, setAsking] = useState(false); // 취소를 한 번 더 물어보는 중
  const distance = useDistanceText(going, distanceM);

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      <div className="flex flex-col gap-0.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#1A3F91]">
          <span className="h-2.5 w-2.5 rounded-full bg-[#2457C5]" aria-hidden="true" />
          {t("result.goingChosen", { time: clockTime(going.chosenAt) })}
        </p>
        <h2 className="truncate text-xl font-semibold">{going.shopName}</h2>
        <p className="text-sm text-[#5F5E58]">
          {distance}
          {price && ` · ${price}`}
        </p>
      </div>
      {asking ? (
        <div className="flex flex-col gap-2 rounded-[14px] border border-[#9DB3E3] bg-[#E8EEFA] p-3 text-[#1A3F91]">
          <p className="text-sm">{t("going.confirm")}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onCancel} className="h-12 rounded-xl bg-[#1A3F91] text-[15px] font-semibold text-white">
              {t("going.confirmYes")}
            </button>
            <button type="button" onClick={() => setAsking(false)} className="h-12 rounded-xl border border-[#9DB3E3] bg-white text-[15px]">
              {t("going.confirmNo")}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <a
              href={directionsUrl(going)}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("directions_click", { from: "going_card" })}
              className="flex h-14 items-center justify-center gap-1.5 rounded-[14px] bg-[#2457C5] text-base font-semibold text-white"
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
              className="flex h-14 items-center justify-center gap-1.5 rounded-[14px] bg-[#1A3F91] text-base font-semibold text-white"
            >
              <svg {...svg} width={16} height={16} strokeWidth={2.5}>
                <path d="M5 12l5 5 9-10" />
              </svg>
              {t("result.arrive")}
            </button>
          </div>
          <div className="-my-1 flex justify-center gap-2 text-sm text-[#1A3F91]">
            {onInfo && (
              <button type="button" onClick={onInfo} className="min-h-11 px-3 underline">
                {t("going.info")}
              </button>
            )}
            <button type="button" onClick={() => setAsking(true)} className="min-h-11 px-3 underline">
              {t("going.cancel")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// 한 줄: 누르면 카드를 펼침(점심 탭으로), 도착했어요는 바로
export function GoingBar(props: Props & { onOpen: () => void; className?: string }) {
  const { going, distanceM, onArrive, onOpen, className = "" } = props;
  const { t } = useT();
  const distance = useDistanceText(going, distanceM);
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* 버튼 이름에 보이는 글자(가게 이름 · 거리)를 그대로 넣고 '펼치기'는 덧붙임 (10/26 접근성 점검: 음성 조작은 보이는 글자로 부름) */}
      <button type="button" onClick={onOpen} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 text-left">
        <span className="h-2.5 w-2.5 flex-none rounded-full bg-[#2457C5]" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{going.shopName}</span>
          <span className="text-[13px] text-[#5F5E58]">{distance}</span>
        </span>
        <span className="sr-only">{t("going.expand")}</span>
      </button>
      <button
        type="button"
        onClick={onArrive}
        className="flex h-10 flex-none items-center gap-1 rounded-xl bg-[#1A3F91] px-3 text-sm font-semibold text-white"
      >
        <svg {...svg} width={14} height={14} strokeWidth={2.5}>
          <path d="M5 12l5 5 9-10" />
        </svg>
        {t("result.arrive")}
      </button>
    </div>
  );
}
