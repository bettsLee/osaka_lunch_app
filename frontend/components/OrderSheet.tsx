"use client";

// S3 '주문 도우미'(10/22: '주문 문장 보기'에서 이름 바꿈): 직원에게 보여 줄 일본어 문장과 휴대폰 언어 뜻 (10/21 결정: 주문 · 추천 · 카드 3문장)
// 10/22 결정: 설정에서 고른 알레르기 · 식사 제한 문장을 맨 위에. 일본어는 우리가 쓴 그대로 두고 뜻만 번역함
import { useEffect, useRef, useState } from "react";
import { dietPhrases, loadDiet, type DietPhrase } from "@/lib/diet";
import { useT } from "./I18n";
import { svg } from "./icons";

const PHRASES = [
  { ja: "ランチをひとつお願いします。", meaning: "order.1" },
  { ja: "おすすめのランチはどれですか？", meaning: "order.2" },
  { ja: "カードは使えますか？", meaning: "order.3" },
];

export default function OrderSheet({ onClose }: { onClose: () => void }) {
  const { t, lang, machine } = useT();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const [mine] = useState(() => dietPhrases(loadDiet()));
  // 문장 안의 알레르기 이름: 영어는 문장 중간이라 소문자로 (Shrimp → shrimp)
  const item = (a: string) => (lang === "en" ? t(`diet.a.${a}`).toLowerCase() : t(`diet.a.${a}`));
  const meaning = (p: DietPhrase) => t(p.meaning, { items: (p.items ?? []).map(item).join(", ") });
  const jaStyle = { fontFamily: "'Hiragino Sans', 'Noto Sans JP', sans-serif" };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-[480px] flex-col gap-3.5 overflow-y-auto rounded-t-[20px] bg-white px-5 pb-7 pt-3 text-[#1F1F1C]"
      >
        <div className="h-1 w-10 self-center rounded-full bg-[#CFCCC2]" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 ref={title} id="order-title" tabIndex={-1} className="text-xl font-semibold outline-none">
            {t("order.title")}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="-mr-2 flex h-11 w-11 items-center justify-center">
            <svg {...svg}>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <p className="text-sm text-[#5F5E58]">{t("order.help")}</p>
        {mine.length > 0 && (
          <section aria-label={t("order.mine")} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-[#1A3F91]">{t("order.mine")}</p>
            <ul className="flex flex-col gap-2.5">
              {mine.map((p) => (
                <li key={p.ja} className="flex flex-col gap-1 rounded-xl border-2 border-[#2457C5] bg-[#E8EEFA] px-4 py-3.5">
                  <p lang="ja" className="text-[20px] font-semibold leading-snug" style={jaStyle}>
                    {p.ja}
                  </p>
                  {lang !== "ja" && <p className="text-sm text-[#1A3F91]">{meaning(p)}</p>}
                </li>
              ))}
            </ul>
            <p className="text-xs leading-relaxed text-[#5F5E58]">{t("diet.warning")}</p>
          </section>
        )}
        <ul className="flex flex-col gap-2.5">
          {PHRASES.map((p) => (
            <li key={p.ja} className="flex flex-col gap-1 rounded-xl border border-[#D6D4CC] px-4 py-3.5">
              <p lang="ja" className="text-[20px] font-semibold leading-snug" style={jaStyle}>
                {p.ja}
              </p>
              {lang !== "ja" && <p className="text-sm text-[#5F5E58]">{t(p.meaning)}</p>}
            </li>
          ))}
        </ul>
        {mine.length === 0 && <p className="text-xs leading-relaxed text-[#5F5E58]">{t("order.dietHint")}</p>}
        {machine && <p className="text-xs text-[#5F5E58]">{t("i18n.ai")}</p>}
      </section>
    </div>
  );
}
