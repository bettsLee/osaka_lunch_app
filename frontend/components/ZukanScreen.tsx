"use client";

// S6 내 점심 도감: '네, 다녀왔어요'라고 답한 가게를 지도 · 목록으로 모음 (10/21 결정) + 맛집 추천 (10/22 결정: 공유 카드 이미지 대신 링크)
// 지도는 홈과 같은 부품. 다녀온 곳은 ✓ 핀, 지금 근처의 아직 안 간 곳은 점선 핀
// 처음에는 아무것도 고르지 않은 상태, 목록 줄이나 다녀온 곳 핀을 누르면 그 가게를 파랗게 (10/22 도그푸딩)
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { distanceKm, genreLabel, priceLabel, walkMinutes, type LunchShop, type NearbyShop, type Point } from "@/lib/lunch";
import { SHARE_MAX, shareLink, shareMessage, shortLink } from "@/lib/share";
import { createShareCode, fetchZukan, setAgain } from "@/lib/api";
import { track, trackError } from "@/lib/analytics";
import {
  collect, FILTER_PERIODS, FILTER_PRICES, filterItems, filterOptions, isFiltering, monthDayTime, NO_FILTER, topArea,
  type ZukanFilter, type ZukanItem, type ZukanVisit,
} from "@/lib/zukan";
import { useT } from "./I18n";
import { Heart } from "./FeedbackSheet";
import Waiting from "./Waiting";


const LunchMap = dynamic(() => import("./LunchMap"), { ssr: false });

type Props = { shops: LunchShop[] | null; here: Point | null; nearby: NearbyShop[]; onGoLunch: () => void };
type State = { status: "loading" } | { status: "error" } | { status: "ok"; visits: ZukanVisit[] };

export default function ZukanScreen({ shops, here, nearby, onGoLunch }: Props) {
  const { t } = useT();
  const [state, setState] = useState<State>({ status: "loading" });
  const [picking, setPicking] = useState<Set<string> | null>(null); // 맛집 골라서 추천하기 중이면 고른 가게
  const [note, setNote] = useState<string | null>(null); // 링크를 복사했어요
  const [selected, setSelected] = useState<string | null>(null); // 목록 · 지도에서 고른 가게
  const rows = useRef(new Map<string, HTMLLIElement>());
  const [likedNow, setLikedNow] = useState(new Map<string, boolean>()); // 이 화면에서 ♥를 누른 결과 (서버에 보내는 사이에도 바로 보이게)
  const [filter, setFilter] = useState<ZukanFilter>(NO_FILTER); // 동네 · 가격 · 종류 · ♥ (10/22 결정)
  const select = (id: string, from: "list" | "map") => {
    const next = selected === id ? null : id; // 다시 누르면 풀림
    setSelected(next);
    if (next && from === "map") rows.current.get(next)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

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
  // 인터넷이 다시 연결되면 다시 불러옴 (10/22 화면 점검 08)
  const failed = state.status === "error";
  useEffect(() => {
    if (!failed) return;
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [failed, load]);

  // 가게 목록이 늦게 불러와져도 서버에 다시 묻지 않고 다시 합침
  const items = useMemo(() => (state.status === "ok" ? collect(state.visits, shops ?? []) : []), [state, shops]);
  const area = topArea(items);
  const visitedIds = useMemo(() => new Set(items.map((i) => i.shopId)), [items]);
  const isLiked = (it: ZukanItem) => likedNow.get(it.shopId) ?? it.liked;
  const likedIds = useMemo(
    () => new Set(items.filter((it) => likedNow.get(it.shopId) ?? it.liked).map((it) => it.shopId)),
    [items, likedNow],
  );
  // 필터: ♥는 이 화면에서 누른 것까지 반영. 고른 가게가 걸러지면 고름을 풂
  const options = useMemo(() => filterOptions(items), [items]);
  const shown = useMemo(
    () => filterItems(items.map((it) => ({ ...it, liked: likedNow.get(it.shopId) ?? it.liked })), filter),
    [items, likedNow, filter],
  );
  const filtering = isFiltering(filter);
  const changeFilter = (next: ZukanFilter, kind: string) => {
    setFilter(next);
    track("zukan_filter", { kind, on: isFiltering(next) });
    if (selected && !filterItems(items, next).some((it) => it.shopId === selected)) setSelected(null);
  };
  // 맛집 추천 (10/22 결정: 이미지 대신 링크, 한 곳 + 여러 곳). 휴대폰 공유 창 → 카톡 · 라인. 못 쓰면 복사
  const recommend = async (chosen: ZukanItem[], from: "row" | "pick") => {
    const list = chosen.filter((it): it is ZukanItem & { shop: LunchShop } => it.shop !== null).slice(0, SHARE_MAX);
    if (!list.length) return;
    // 글에는 제목만: 가게 이름 · 장르 같은 핫페퍼 정보를 앱 밖으로 내보내지 않음 (10/24 리크루트 답: 재배포 금지). 가게는 링크를 열면 그날 목록에서
    const text = t("share.recHeader", { n: list.length });
    const ids = list.map((it) => it.shopId);
    // 짧은 링크 (10/22 결정). 서버가 잠들어 있거나 실패하면 긴 링크로 (받는 쪽은 둘 다 열림)
    let short = true;
    const link = await createShareCode(ids)
      .then((code) => shortLink(window.location.origin, code))
      .catch((e: unknown) => {
        short = false;
        trackError("share_code", e);
        return shareLink(window.location.origin, ids);
      });
    const message = shareMessage(text, link);
    let method = "share";
    try {
      if (navigator.share) await navigator.share({ text: message });
      else {
        method = "copy";
        await navigator.clipboard.writeText(message);
        setNote(t("share.copied"));
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return; // 공유 창을 닫음
      method = "copy";
      try {
        await navigator.clipboard.writeText(message);
        setNote(t("share.copied"));
      } catch {
        trackError("share", e);
        return;
      }
    }
    track("share_create", { count: list.length, from, method, short });
    setPicking(null);
  };
  const togglePick = (id: string) =>
    setPicking((cur) => {
      if (!cur) return cur;
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else if (next.size < SHARE_MAX) next.add(id);
      return next;
    });
  // 또 갈래요 ♥ 켜고 끄기 (10/22 결정: 다녀온 곳과 좋았던 곳을 구분). 못 보내면 되돌림
  const toggleLike = (it: ZukanItem) => {
    const next = !isLiked(it);
    setLikedNow((m) => new Map(m).set(it.shopId, next));
    track("again_toggle", { again: next, from: "zukan" });
    setAgain(it.shopId, next).catch((e: unknown) => {
      trackError("again", e);
      setLikedNow((m) => new Map(m).set(it.shopId, !next));
    });
  };
  // 지도: 다녀온 곳(위치를 아는 것) + 지금 근처의 아직 안 간 곳
  const pins = useMemo(() => {
    if (!here) return [];
    const visited: NearbyShop[] = shown
      .filter((i): i is ZukanItem & { shop: LunchShop } => i.shop !== null)
      .map((i) => {
        const km = distanceKm(here, i.shop);
        return { ...i.shop, km, walk: walkMinutes(km) };
      });
    return [...visited, ...nearby.filter((s) => !visitedIds.has(s.id))];
  }, [here, shown, nearby, visitedIds]);

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
        <section className="relative h-[clamp(130px,26dvh,210px)] flex-none bg-[#ECEAE3]" aria-label={t("home.map")}>{/* 화면이 낮으면 지도를 줄여 목록을 보이게 */}
          <LunchMap
            here={here}
            radiusKm={1}
            shops={pins}
            visitedIds={visitedIds}
            likedIds={likedIds}
            showLocate={false}
            pickedId={selected}
            onPick={(id) => visitedIds.has(id) && select(id, "map")} // 아직 안 간 곳은 누르지 않음
          />
          <span className="absolute bottom-3 left-3 z-[500] rounded-xl bg-white px-2.5 py-1 text-xs text-[#5F5E58]">{t("zukan.legend")}</span>
        </section>
      )}

      <section className="flex flex-1 flex-col overflow-y-auto px-5 pb-4 pt-2">
        {state.status === "loading" && <Waiting text={t("zukan.loading")} />}
        {state.status === "error" && (
          <div className="flex flex-col items-center gap-3 py-8 text-sm text-[#5F5E58]">
            <p>{t("zukan.error")}</p>
            <button type="button" onClick={load} className="h-11 rounded-xl border border-[#CFCCC2] bg-white px-4 text-[#1F1F1C]">
              {t("home.retry")}
            </button>
          </div>
        )}
        {state.status === "ok" && items.length === 0 && (
          // 10/22 화면 점검 10: 빈 도감에 다음 행동
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-base font-semibold">{t("zukan.empty")}</p>
            <p className="max-w-[300px] text-sm leading-relaxed text-[#5F5E58]">{t("zukan.emptyHow")}</p>
            <button type="button" onClick={onGoLunch} className="mt-1 h-12 rounded-[14px] bg-[#2457C5] px-6 text-base font-semibold text-white">
              {t("zukan.goLunch")}
            </button>
          </div>
        )}
        {items.length > 0 && (
          <>
            {/* 필터: 동네 · 가격 · 종류 · ♥ 또 갈 곳 (도감에 있는 것만 고를 수 있음) */}
            {/* flex-none: 가로 스크롤 줄이라 세로로 찌그러질 수 있음 (10/22 도그푸딩: 맥 크롬 낮은 창에서 칩이 반쯤 잘림) */}
            <div className="-mx-5 flex flex-none gap-2 overflow-x-auto px-5 pb-1 pt-2" role="group" aria-label={t("zukan.filter")}>
              <FilterSelect
                label={t("zukan.filterPeriodLabel")}
                value={filter.period ?? ""}
                onChange={(v) => changeFilter({ ...filter, period: (v || null) as ZukanFilter["period"] }, "period")}
                options={[["", t("zukan.filterPeriod")], ...FILTER_PERIODS.map((p): [string, string] => [p, t(`zukan.period.${p}`)])]}
              />
              <FilterSelect
                label={t("zukan.filterAreaLabel")}
                value={filter.area ?? ""}
                onChange={(v) => changeFilter({ ...filter, area: v || null }, "area")}
                options={[["", t("zukan.filterArea")], ...options.areas.map((a): [string, string] => [a, t(`area.${a}`)])]}
              />
              <FilterSelect
                label={t("zukan.filterPriceLabel")}
                value={filter.maxPrice === null ? "" : String(filter.maxPrice)}
                onChange={(v) => changeFilter({ ...filter, maxPrice: v ? Number(v) : null }, "price")}
                options={[["", t("zukan.filterPrice")], ...FILTER_PRICES.map((p): [string, string] => [String(p), t("home.limitChip", { limit: p.toLocaleString("ja-JP") })])]}
              />
              <FilterSelect
                label={t("zukan.filterGenreLabel")}
                value={filter.genre ?? ""}
                onChange={(v) => changeFilter({ ...filter, genre: v || null }, "genre")}
                options={[["", t("zukan.filterGenre")], ...options.genres.map((g): [string, string] => [g, genreLabel(g, t)])]}
              />
              <button
                type="button"
                aria-pressed={filter.liked}
                onClick={() => changeFilter({ ...filter, liked: !filter.liked }, "liked")}
                className={`flex h-9 flex-none items-center gap-1 rounded-full border px-3.5 text-sm ${
                  filter.liked ? "border-[#D43F5E] bg-[#FDECEF] font-semibold text-[#A3213D]" : "border-[#CFCCC2] bg-white"
                }`}
              >
                <Heart filled={filter.liked} size={15} />
                {t("zukan.filterLiked")}
              </button>
            </div>
            {filtering && (
              <div className="flex items-center justify-between pt-1 text-[13px] text-[#5F5E58]">
                <span aria-live="polite">{t("zukan.filtered", { n: shown.length })}</span>
                <button type="button" onClick={() => changeFilter(NO_FILTER, "clear")} className="-my-2 min-h-11 px-1 font-semibold text-[#1A3F91]">
                  {t("zukan.filterClear")}
                </button>
              </div>
            )}
            {shown.length === 0 && <p className="py-6 text-center text-sm text-[#5F5E58]">{t("zukan.filterEmpty")}</p>}
            <ul>
              {shown.map((it) => (
                <li
                  key={it.shopId}
                  ref={(el) => {
                    if (el) rows.current.set(it.shopId, el);
                    else rows.current.delete(it.shopId);
                  }}
                  className="-mx-2 border-b border-[#ECEAE3]"
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => (picking ? togglePick(it.shopId) : select(it.shopId, "list"))}
                      disabled={it.shop === null} // 지금 가게 목록에 없으면 지도에 핀이 없고 추천도 못 함
                      aria-pressed={picking ? picking.has(it.shopId) : selected === it.shopId}
                      className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-3 text-left ${
                        (picking ? picking.has(it.shopId) : selected === it.shopId) ? "bg-[#E8EEFA]" : ""
                      }`}
                    >
                      {picking && (
                        <span
                          className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border-2 ${
                            picking.has(it.shopId) ? "border-[#2457C5] bg-[#2457C5] text-white" : "border-[#CFCCC2]"
                          }`}
                          aria-hidden="true"
                        >
                          {picking.has(it.shopId) && (
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                              <path d="M5 12l5 5 9-10" />
                            </svg>
                          )}
                        </span>
                      )}
                      {it.shop?.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- 핫페퍼 사진을 그대로 씀
                        <img src={it.shop.photoUrl} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-[10px] bg-[#ECEAE3] object-cover" />
                      ) : (
                        <div className="h-12 w-12 flex-none rounded-[10px] bg-[#ECEAE3]" />
                      )}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className={`truncate text-base font-semibold ${it.name === null ? "text-[#5F5E58]" : ""}`}>{it.name ?? t("zukan.gone")}</p>
                        <p className="text-[13px] text-[#5F5E58]">
                          {[
                            it.shop?.genre ? genreLabel(it.shop.genre, t) : null,
                            it.shop ? priceLabel(it.shop, t) : null,
                            t("zukan.dateTime", monthDayTime(it.lastAt)),
                            it.times > 1 ? t("zukan.times", { n: it.times }) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleLike(it)}
                      aria-pressed={isLiked(it)}
                      aria-label={t("zukan.again")}
                      className={`flex h-12 w-12 flex-none items-center justify-center ${isLiked(it) ? "" : "text-[#9C9A92]"}`}
                    >
                      <Heart filled={isLiked(it)} size={22} />
                    </button>
                  </div>
                  {!picking && selected === it.shopId && it.shop && (
                    <button
                      type="button"
                      onClick={() => recommend([it], "row")}
                      className="mb-3 ml-2 flex h-11 items-center gap-1.5 rounded-xl bg-[#2457C5] px-4 text-[15px] font-semibold text-white"
                    >
                      <ShareIcon />
                      {t("zukan.recommendOne")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {note && (
              <p className="pt-3 text-center text-sm font-semibold text-[#1A3F91]" aria-live="polite">
                {note}
              </p>
            )}
            {picking ? (
              // 맛집 골라서 추천하기: 목록 아래에 붙는 바 (필터를 걸고 '모두 고르기'도 됨)
              <div className="sticky bottom-0 -mx-5 mt-3 flex flex-col gap-2 border-t border-[#E2E0D8] bg-white px-5 pb-2 pt-3">
                <div className="flex items-center justify-between text-[13px] text-[#5F5E58]">
                  <span aria-live="polite">{t("zukan.pickCount", { n: picking.size, max: SHARE_MAX })}</span>
                  <button
                    type="button"
                    onClick={() => setPicking(new Set(shown.filter((it) => it.shop !== null).slice(0, SHARE_MAX).map((it) => it.shopId)))}
                    className="-my-2 min-h-11 px-1 font-semibold text-[#1A3F91]"
                  >
                    {t("zukan.pickAll")}
                  </button>
                </div>
                <div className="grid grid-cols-[1fr_2fr] gap-2">
                  <button type="button" onClick={() => setPicking(null)} className="h-12 rounded-[14px] border border-[#CFCCC2] bg-white text-base">
                    {t("zukan.pickCancel")}
                  </button>
                  <button
                    type="button"
                    disabled={picking.size === 0}
                    onClick={() => recommend(items.filter((it) => picking.has(it.shopId)), "pick")}
                    className="h-12 rounded-[14px] bg-[#2457C5] text-base font-semibold text-white disabled:opacity-50"
                  >
                    {t("zukan.pickSend", { n: picking.size })}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setNote(null);
                  setPicking(new Set());
                }}
                className="mt-4 flex h-[52px] flex-none items-center justify-center gap-1.5 rounded-[14px] border border-[#2457C5] text-base font-semibold text-[#1A3F91]"
              >
                <ShareIcon />
                {t("zukan.pickStart")}
              </button>
            )}
            <p className="mt-3 text-[10px] text-[#5F5E58]">{t("credit.shop")}: Powered by ホットペッパー グルメ Webサービス · 画像提供：ホットペッパー グルメ</p>
            <p className="text-[10px] text-[#5F5E58]">{t("credit.ai")}</p>
          </>
        )}
      </section>

    </>
  );
}

// 필터 칩 모양의 고르기 (휴대폰에서는 기본 고르기 창이 뜸)
function FilterSelect(props: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const { label, value, onChange, options } = props;
  const on = value !== "";
  return (
    <label className="relative flex-none">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 appearance-none rounded-full border py-0 pl-3.5 pr-8 text-sm ${
          on ? "border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border-[#CFCCC2] bg-white text-[#1F1F1C]"
        }`}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </label>
  );
}

const ShareIcon = () => (
  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12M7 8l5-5 5 5" />
    <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
  </svg>
);
