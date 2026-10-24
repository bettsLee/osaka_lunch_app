"use client";

// 친구가 추천한 점심 (10/22 결정: 공유 카드 이미지 대신 맛집 추천 링크). 링크의 가게를 카드로, 누르면 결과 카드 → 여기 갈래요
// 핫페퍼 사진은 앱 화면 안에서 출처와 같이 보여 줌
import { genreLabel, lunchTimeText, priceRange, type Day, type NearbyShop } from "@/lib/lunch";
import { useT } from "./I18n";
import Waiting from "./Waiting";

type Props = {
  shops: NearbyShop[]; // 지금 가게 목록에 있는 추천 가게 (링크 순서)
  missing: number; // 목록에 없는 가게 수
  loading: boolean;
  located: boolean; // 위치를 알면 걸어서 n분 · 누르면 결과 카드
  day: Day;
  minutes: number;
  onOpen: (shop: NearbyShop) => void;
  onClose: () => void;
};

export default function SharedScreen({ shops, missing, loading, located, day, minutes, onOpen, onClose }: Props) {
  const { t } = useT();
  return (
    <>
      <header className="flex flex-col gap-0.5 px-5 pb-3 pt-5">
        <h1 className="text-[22px] font-semibold">{t("shared.title")}</h1>
        {!loading && <p className="text-sm text-[#5F5E58]">{t("shared.count", { n: shops.length })}</p>}
      </header>
      <section className="flex flex-1 flex-col gap-3 overflow-y-auto bg-[#F4F3EF] px-4 pb-4 pt-4">
        {loading && <Waiting text={t("home.loading")} />}
        {!located && !loading && <p className="rounded-[14px] bg-[#E8EEFA] px-4 py-3 text-sm leading-relaxed text-[#1A3F91]">{t("shared.needLocation")}</p>}
        {shops.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!located}
            onClick={() => onOpen(s)}
            className="flex flex-none gap-3 rounded-[14px] border border-[#E2E0D8] bg-white p-3 text-left"
          >
            {s.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- 핫페퍼 사진을 그대로 씀
              <img src={s.photoUrl} alt="" loading="lazy" className="h-20 w-20 flex-none rounded-xl bg-[#ECEAE3] object-cover" />
            ) : (
              <div className="h-20 w-20 flex-none rounded-xl bg-[#ECEAE3]" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="truncate text-base font-semibold">{s.name}</p>
              <p className="text-[13px] text-[#5F5E58]">
                {[s.genre ? genreLabel(s.genre, t) : null, located ? t("common.walk", { n: s.walk }) : null].filter(Boolean).join(" · ")}
              </p>
              <p className="text-[13px] text-[#5F5E58]">{lunchTimeText(s, day, minutes, t).text}</p>
              <p className="text-[15px] font-semibold">{priceRange(s, t)}</p>
            </div>
          </button>
        ))}
        {missing > 0 && <p className="px-1 text-[13px] text-[#5F5E58]">{t("shared.missing", { n: missing })}</p>}
        <button type="button" onClick={onClose} className="mt-1 h-[52px] flex-none rounded-[14px] border border-[#2457C5] bg-white text-base font-semibold text-[#1A3F91]">
          {t("shared.home")}
        </button>
        <p className="text-[10px] text-[#5F5E58]">
          {t("credit.shop")}: Powered by ホットペッパー グルメ Webサービス · 画像提供：ホットペッパー グルメ
          <br />
          {t("credit.ai")}
        </p>
      </section>
    </>
  );
}
