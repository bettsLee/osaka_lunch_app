"use client";

// S0 첫 실행 (와이어프레임 v1): 한 줄 소개 → '내 위치로 시작하기'를 누를 때 위치 권한을 물음 (이유가 보이는 순간에 묻기)
// 11/23 그림을 식권 발매기로 바꿈 (상권 "디자인이 너무 구려서 특색있는 디자인으로"): 불 들어온 버튼 하나 = 앱이 골라 준 가게 (룰렛과 같은 뜻)
// 버튼 이름은 이미 있는 가게 종류 번역(genre.*)을 써서 새로 번역할 문구는 없음
import { DEFAULT_LIMIT } from "@/lib/lunch";
import { useT } from "./I18n";
import { svg } from "./icons";
import { Face } from "./Shokken";

type Props = { onStart: () => void };

// 기계 버튼 (장식). 가격은 모두 한도 아래, lit이 골라 준 가게
const BUTTONS = [
  { genre: "ramen", price: "¥780" },
  { genre: "japanese", price: "¥920" },
  { genre: "chinese", price: "¥690" },
  { genre: "okonomiyaki", price: "¥880" },
  { genre: "asianEthnic", price: "¥850", lit: true },
  { genre: "western", price: "¥950" },
];
const PICKED = BUTTONS.find((b) => b.lit)!;

// 전광판 숫자 (7세그먼트). 꺼진 칸도 희미하게 그려서 진짜 기계처럼
const ON = ["abcdef", "bc", "abdeg", "abcdg", "bcfg", "acdfg", "acdefg", "abc", "abcdefg", "abcdfg"];
const W = 24, H = 40, T = 5.5, G = 1.2, STEP = 32;
const LONG = W - T - 2 * G, TALL = H / 2 - T / 2 - 2 * G;
const SEG: Record<string, [number, number, number, number]> = {
  a: [T / 2 + G, 0, LONG, T],
  g: [T / 2 + G, (H - T) / 2, LONG, T],
  d: [T / 2 + G, H - T, LONG, T],
  f: [0, T / 2 + G, T, TALL],
  b: [W - T, T / 2 + G, T, TALL],
  e: [0, H / 2 + G, T, TALL],
  c: [W - T, H / 2 + G, T, TALL],
};

function Led({ value }: { value: number }) {
  const digits = String(value).split("").map(Number);
  const width = digits.length * STEP - (STEP - W);
  return (
    <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="-skew-x-6">
      {digits.map((d, i) =>
        Object.entries(SEG).map(([k, [x, y, w, h]]) => (
          <rect key={`${i}${k}`} x={i * STEP + x} y={y} width={w} height={h} rx={T / 2} fill="#FF6A3D" opacity={ON[d].includes(k) ? 1 : 0.1} />
        )),
      )}
    </svg>
  );
}

export default function FirstRun({ onStart }: Props) {
  const { t, machine } = useT();
  const limit = DEFAULT_LIMIT.toLocaleString("ja-JP");
  // 세로가 짧은 폰(760px 이하, 아이폰 SE 등)은 간격을 줄이고 식권을 빼서 시작 버튼이 첫 화면에 보이게
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-6 pb-7 pt-10 [@media(max-height:760px)]:gap-4 [@media(max-height:760px)]:pt-6">
      <div className="relative flex-none rounded-[22px] bg-[#2457C5] px-3.5 pt-3.5 shadow-[inset_0_-6px_0_#1A3F91] [@media(max-height:760px)]:pb-5" aria-hidden="true">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[50px] flex-1 items-center justify-end gap-1.5 rounded-[10px] bg-[#1B2233] px-3.5 shadow-[inset_0_2px_0_rgba(0,0,0,0.35)]">
            <span className="-skew-x-6 text-xl font-extrabold text-[#FF6A3D]">¥</span>
            <Led value={DEFAULT_LIMIT} />
          </div>
          <div className="grid h-[50px] w-[34px] place-items-center rounded-[10px] bg-[#1A3F91]">
            <span className="h-[26px] w-[5px] rounded bg-[#0F2560]" />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {BUTTONS.map((b) => (
            <div
              key={b.genre}
              className={`flex min-h-[60px] flex-col [@media(max-height:760px)]:min-h-[54px] justify-between gap-1 rounded-[9px] px-[9px] pb-1.5 pt-[7px] ${b.lit ? "first-lit" : "bg-[#F3F5FA] shadow-[0_3px_0_#C6CDDC]"}`}
            >
              <span className={`text-xs font-semibold leading-tight ${b.lit ? "text-[#4A3A00]" : "text-[#3A3F4B]"}`}>{t(`genre.${b.genre}`)}</span>
              <span className="text-right text-[15px] font-extrabold">{b.price}</span>
            </div>
          ))}
        </div>

        <div className="relative -mx-3.5 mt-3.5 h-[66px] overflow-hidden [@media(max-height:760px)]:hidden">
          <span className="absolute inset-x-[22%] top-0 z-10 h-2.5 rounded-full bg-[#0F2560]" />
          {/* 나오는 식권 = 마스코트 식권이 (11/23): 얼굴 · 고른 가게 가격, 양손을 들고 나옴 */}
          <div className="first-ticket absolute inset-x-[26%] top-1 h-[58px]">
            <svg viewBox="0 0 24 26" className="absolute -left-[19px] top-3 h-[26px] w-6 overflow-visible">
              <path d="M24 18 q-12 -2 -15 -12" fill="none" stroke="#1F1F1C" strokeWidth={2.6} strokeLinecap="round" />
              <circle cx="8.5" cy="5" r="3.6" fill="#fff" stroke="#1F1F1C" strokeWidth={2} />
            </svg>
            <svg viewBox="0 0 24 26" className="absolute -right-[19px] top-3 h-[26px] w-6 -scale-x-100 overflow-visible">
              <path d="M24 18 q-12 -2 -15 -12" fill="none" stroke="#1F1F1C" strokeWidth={2.6} strokeLinecap="round" />
              <circle cx="8.5" cy="5" r="3.6" fill="#fff" stroke="#1F1F1C" strokeWidth={2} />
            </svg>
            <div className="first-ticket-paper flex h-full items-center justify-between gap-2 rounded-b bg-white px-3 pb-1.5 pt-2">
              <svg viewBox="66 88 68 40" className="h-[28px] w-auto flex-none">
                <Face mood="found" />
              </svg>
              <span className="text-xl font-black tracking-tight">{PICKED.price}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <h1 className="whitespace-pre-line text-[27px] font-extrabold leading-[1.32] tracking-[-0.02em]">{t("first.title", { limit })}</h1>
        <p className="text-[15px] leading-relaxed text-[#5F5E58]">{t("first.body", { limit })}</p>
      </div>

      <ul className="flex flex-col gap-3 text-[15px]">
        {(["first.point1", "first.point2", "first.point3"] as const).map((key) => (
          <li key={key} className="flex items-center gap-2.5">
            <svg {...svg} width={20} height={20} strokeWidth={2.4} className="flex-none text-[#2457C5]">
              <path d="M5 12l5 5 9-10" />
            </svg>
            {t(key)}
          </li>
        ))}
      </ul>

      <div className="flex-1" />

      <div className="flex flex-col gap-2.5">
        {/* 식권 기계 버튼처럼 아래 턱이 있고, 누르면 들어감 */}
        <button
          type="button"
          onClick={onStart}
          className="mb-[5px] h-14 rounded-[14px] bg-[#2457C5] text-lg font-bold text-white shadow-[0_5px_0_#1A3F91] transition-transform duration-75 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#1A3F91] active:translate-y-[5px] active:shadow-none"
        >
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
