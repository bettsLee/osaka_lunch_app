"use client";

// S4 여기 갈래요 후: 길찾기 + '다녀온 뒤에 알려 주세요'. 알림 권한은 여기서 물음 (10/21 결정: 이유가 보이는 순간)
// 알림을 못 쓰거나 거절하면 1시간 뒤 앱을 열 때 질문 카드로 물어봄
import { useEffect, useRef, useState } from "react";
import { directionsUrl, priceRange, type NearbyShop } from "@/lib/lunch";
import { currentPushState, enablePush } from "@/lib/api";
import { track } from "@/lib/analytics";
import type { PushState } from "@/lib/push";
import { useT } from "./I18n";
import { svg } from "./icons";

export default function GoScreen({ shop, onHome }: { shop: NearbyShop; onHome: () => void }) {
  const { t } = useT();
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  const [push, setPush] = useState<PushState | "working" | "error">(() => currentPushState());

  const turnOn = () => {
    setPush("working");
    enablePush()
      .then((result) => {
        setPush(result);
        track("push_permission", { result });
      })
      .catch(() => {
        setPush("error");
        track("push_permission", { result: "error" });
      });
  };

  return (
    <section className="flex flex-1 flex-col gap-5 overflow-y-auto px-6 pb-7 pt-12">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E8EEFA] text-[#1A3F91]">
        <svg {...svg} width={28} height={28} strokeWidth={2.4}>
          <path d="M5 12l5 5 9-10" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 ref={title} tabIndex={-1} className="text-2xl font-semibold outline-none">
          {t("go.title")}
        </h1>
        <p className="text-[15px] text-[#5F5E58]">
          {shop.name} · {t("common.walk", { n: shop.walk })} · {priceRange(shop, t)}
        </p>
      </div>
      <a
        href={directionsUrl(shop)}
        target="_blank"
        rel="noreferrer"
        onClick={() => track("directions_click", { from: "go" })}
        className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white"
      >
        {t("result.directions")}
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
          {t("go.askTitle")}
        </p>
        <p className="text-sm leading-relaxed text-[#5F5E58]" aria-live="polite">
          {push === "on"
            ? `${t("go.pushOn")} ${t("go.why")}`
            : push === "ask" || push === "working"
              ? `${t("go.pushAsk")} ${t("go.why")}`
              : `${push === "error" ? `${t("go.pushError")} ` : ""}${t("go.appAsk")} ${t("go.why")}`}
        </p>
        {push === "install" && (
          <p className="text-sm leading-relaxed text-[#5F5E58]">
            {t("go.install")}
          </p>
        )}
        {(push === "ask" || push === "working") && (
          <button
            type="button"
            onClick={turnOn}
            disabled={push === "working"}
            className="mt-1 h-12 rounded-xl border border-[#2457C5] text-base font-semibold text-[#1A3F91] disabled:opacity-60"
          >
            {push === "working" ? t("go.pushWorking") : t("go.pushButton")}
          </button>
        )}
        {push === "on" && <p className="text-sm font-semibold text-[#1A3F91]">{t("go.pushOnLabel")}</p>}
      </div>
      <div className="flex-1" />
      <button type="button" onClick={onHome} className="min-h-11 text-sm text-[#2457C5]">
        {t("home.back")}
      </button>
    </section>
  );
}
