"use client";

// S0 첫 실행 (와이어프레임 v1): 한 줄 소개 → '내 위치로 시작하기'를 누를 때 위치 권한을 물음 (이유가 보이는 순간에 묻기)
import { DEFAULT_LIMIT } from "@/lib/lunch";
import { useT } from "./I18n";
import { svg } from "./icons";

type Props = { onStart: () => void };

// 그림 속 가격 핀 (장식). 가운데가 룰렛이 고른 핀
const PINS = [
  { left: "22%", top: "30%", label: "¥780" },
  { left: "74%", top: "24%", label: "¥920" },
  { left: "30%", top: "74%", label: "¥690" },
  { left: "78%", top: "70%", label: "¥880" },
];

export default function FirstRun({ onStart }: Props) {
  const { t, machine } = useT();
  const limit = DEFAULT_LIMIT.toLocaleString("ja-JP");
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 pb-7 pt-10">
      <div className="relative h-[220px] flex-none overflow-hidden rounded-[20px] bg-[#ECEAE3]" aria-hidden="true">
        <svg viewBox="0 0 342 220" className="absolute inset-0 h-full w-full" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round">
          <path d="M-10 70 L360 40" />
          <path d="M-10 160 L360 185" />
          <path d="M120 -10 L95 230" />
          <path d="M250 -10 L265 230" />
        </svg>
        {PINS.map((p) => (
          <span
            key={p.label}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#CFCCC2] bg-white px-2 py-0.5 text-xs font-semibold text-[#5F5E58]"
            style={{ left: p.left, top: p.top }}
          >
            {p.label}
          </span>
        ))}
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[#2457C5] px-3.5 py-1.5 text-base font-semibold text-white shadow">
          ¥850
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <h1 className="whitespace-pre-line text-[26px] font-semibold leading-snug">{t("first.title", { limit })}</h1>
        <p className="text-[15px] leading-relaxed text-[#5F5E58]">{t("first.body", { limit })}</p>
      </div>

      <ul className="flex flex-col gap-3 text-[15px]">
        {(["first.point1", "first.point2", "first.point3"] as const).map((key) => (
          <li key={key} className="flex items-center gap-2.5">
            <svg {...svg} width={20} height={20} strokeWidth={2.2} className="flex-none text-[#1A3F91]">
              <path d="M5 12l5 5 9-10" />
            </svg>
            {t(key)}
          </li>
        ))}
      </ul>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5">
        <button type="button" onClick={onStart} className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white">
          {t("first.start")}
        </button>
        <p className="text-center text-[13px] leading-relaxed text-[#5F5E58]">{t("first.privacy")}</p>
        <p className="text-center text-[11px] text-[#5F5E58]">
          <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
            Powered by ホットペッパー グルメ Webサービス
          </a>
          {machine && ` · ${t("i18n.ai")}`}
        </p>
      </div>
    </div>
  );
}
