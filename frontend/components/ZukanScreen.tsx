"use client";

// S6 내 점심 도감: '네, 다녀왔어요'라고 답한 가게를 지도 · 목록으로 모음 (10/21 결정) + 공유 카드 만들기
// 지도는 홈과 같은 부품. 다녀온 곳은 채운 핀, 지금 근처의 아직 안 간 곳은 점선 핀
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { distanceKm, genreLabel, priceLabel, walkMinutes, type LunchShop, type NearbyShop, type Point } from "@/lib/lunch";
import { fetchZukan } from "@/lib/api";
import { trackError } from "@/lib/analytics";
import { collect, monthDay, topArea, type ZukanItem, type ZukanVisit } from "@/lib/zukan";
import { useT } from "./I18n";
import ShareCard from "./ShareCard";

const LunchMap = dynamic(() => import("./LunchMap"), { ssr: false });

type Props = { shops: LunchShop[] | null; here: Point | null; nearby: NearbyShop[] };
type State = { status: "loading" } | { status: "error" } | { status: "ok"; visits: ZukanVisit[] };

export default function ZukanScreen({ shops, here, nearby }: Props) {
  const { t } = useT();
  const [state, setState] = useState<State>({ status: "loading" });
  const [sharing, setSharing] = useState(false);

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetchZukan()
      .then((visits) => setState({ status: "ok", visits }))
      .catch((e: unknown) => {
        trackError("zukan", e);
        setState({ status: "error" });
      });
  }, []);
  useEffect(load, [load]);

  // 가게 목록이 늦게 불러와져도 서버에 다시 묻지 않고 다시 합침
  const items = useMemo(() => (state.status === "ok" ? collect(state.visits, shops ?? []) : []), [state, shops]);
  const area = topArea(items);
  const visitedIds = useMemo(() => new Set(items.map((i) => i.shopId)), [items]);
  // 지도: 다녀온 곳(위치를 아는 것) + 지금 근처의 아직 안 간 곳
  const pins = useMemo(() => {
    if (!here) return [];
    const visited: NearbyShop[] = items
      .filter((i): i is ZukanItem & { shop: LunchShop } => i.shop !== null)
      .map((i) => {
        const km = distanceKm(here, i.shop);
        return { ...i.shop, km, walk: walkMinutes(km) };
      });
    return [...visited, ...nearby.filter((s) => !visitedIds.has(s.id))];
  }, [here, items, nearby, visitedIds]);

  return (
    <>
      <header className="flex flex-col gap-0.5 px-5 pb-3.5 pt-5">
        <h1 className="text-[22px] font-semibold">{t("zukan.title")}</h1>
        {state.status === "ok" && items.length > 0 && (
          <p className="text-sm text-[#5F5E58]">
            {area ? t("zukan.count", { area: t(`area.${area}`), n: items.length }) : t("zukan.countNoArea", { n: items.length })}
          </p>
        )}
      </header>

      {here && state.status === "ok" && items.length > 0 && (
        <section className="relative h-[210px] flex-none bg-[#ECEAE3]" aria-label={t("home.map")}>
          <LunchMap here={here} radiusKm={1} shops={pins} visitedIds={visitedIds} showLocate={false} />
          <span className="absolute bottom-3 left-3 z-[500] rounded-xl bg-white px-2.5 py-1 text-xs text-[#5F5E58]">{t("zukan.legend")}</span>
        </section>
      )}

      <section className="flex flex-1 flex-col overflow-y-auto px-5 pb-4 pt-2">
        {state.status === "loading" && <p className="py-8 text-center text-sm text-[#5F5E58]">{t("zukan.loading")}</p>}
        {state.status === "error" && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-[#5F5E58]">
            <p>{t("zukan.error")}</p>
            <button type="button" onClick={load} className="h-11 rounded-xl border border-[#CFCCC2] bg-white px-4 text-[#1F1F1C]">
              {t("home.retry")}
            </button>
          </div>
        )}
        {state.status === "ok" && items.length === 0 && (
          <p className="py-8 text-center text-sm leading-relaxed text-[#5F5E58]">{t("zukan.empty")}</p>
        )}
        {items.length > 0 && (
          <>
            <ul>
              {items.map((it) => (
                <li key={it.shopId} className="flex items-center gap-3 border-b border-[#ECEAE3] py-3">
                  {it.shop?.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 핫페퍼 사진을 그대로 씀
                    <img src={it.shop.photoUrl} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-[10px] bg-[#ECEAE3] object-cover" />
                  ) : (
                    <div className="h-12 w-12 flex-none rounded-[10px] bg-[#ECEAE3]" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-base font-semibold">{it.name}</p>
                    <p className="text-[13px] text-[#5F5E58]">
                      {[
                        it.shop?.genre ? genreLabel(it.shop.genre, t) : null,
                        it.shop ? priceLabel(it.shop, t) : null,
                        t("zukan.date", monthDay(it.lastAt)),
                        it.times > 1 ? t("zukan.times", { n: it.times }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setSharing(true)}
              className="mt-4 h-[52px] flex-none rounded-[14px] border border-[#2457C5] text-base font-semibold text-[#1A3F91]"
            >
              {t("zukan.share")}
            </button>
            <p className="mt-3 text-[10px] text-[#5F5E58]">Powered by ホットペッパー グルメ Webサービス · 画像提供：ホットペッパー グルメ</p>
          </>
        )}
      </section>

      {sharing && <ShareCard items={items} area={area} onClose={() => setSharing(false)} />}
    </>
  );
}
