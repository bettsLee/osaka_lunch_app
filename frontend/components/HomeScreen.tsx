"use client";

// S1 홈 → S2 룰렛 → S3 결과 카드 (와이어프레임 v1). 지도는 세 화면에서 같은 것을 크기만 바꿔 씀
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areaName, DEFAULT_LIMIT, displayPrice, genreLabel, openNow, osakaNow, pickNearby, pickShop, priceBadge, priceLabel,
  rouletteCandidates, spinSteps, tierInfo, underLimit,
  type LunchShop, type NearbyShop, type Point,
} from "@/lib/lunch";
import { fetchLunchShops } from "@/lib/shops";
import { fetchPendingVisit, flushVisits, saveVisit, syncPush, wakeServer } from "@/lib/api";
import { startAnalytics, track, trackError, watchErrors } from "@/lib/analytics";
import { pickLang } from "@/lib/i18n";
import { isIOS } from "@/lib/push";
import type { PendingVisit } from "@/lib/visits";
import FeedbackSheet from "./FeedbackSheet";
import FirstRun from "./FirstRun";
import GoScreen from "./GoScreen";
import { useT } from "./I18n";
import { svg } from "./icons";
import PriceSheet from "./PriceSheet";
import ResultCard from "./ResultCard";
import ZukanScreen from "./ZukanScreen";

const LunchMap = dynamic(() => import("./LunchMap"), { ssr: false }); // 지도는 브라우저에서만

type Loc = { status: "asking" } | { status: "denied" } | { status: "error" } | { status: "ok"; point: Point };
type Data = { status: "loading" } | { status: "error" } | { status: "ok"; shops: LunchShop[] };
type Mode = "home" | "spin" | "result" | "go";
type Tab = "lunch" | "zukan";

const LIMIT_KEY = "osaka-lunch-price-limit"; // 고른 가격 상한은 이 휴대폰에만 기억
const STARTED_KEY = "osaka-lunch-started"; // S0 첫 실행에서 '내 위치로 시작하기'를 누른 적 있음
const yen = (n: number) => n.toLocaleString("ja-JP");

const COLLAPSED_ROWS = 2; // 접힌 목록에 보이는 줄 수
const SPIN_END_PAUSE_MS = 500; // 핀이 멈춘 뒤 결과 카드를 띄우기까지

export default function HomeScreen() {
  const { t, machine } = useT();
  const [firstRun, setFirstRun] = useState<boolean | null>(null); // S0을 보여줄지 (null: 확인 중)
  const [loc, setLoc] = useState<Loc>({ status: "asking" });
  const [data, setData] = useState<Data>({ status: "loading" });
  const [now, setNow] = useState(() => new Date());
  const [nowOnly, setNowOnly] = useState(false); // 지금 영업 중
  const [byDistance, setByDistance] = useState(false); // 가까운순 (아니면 싼 순)
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("home");
  const [tab, setTab] = useState<Tab>("lunch");
  const [picked, setPicked] = useState<NearbyShop | null>(null);
  const [pickedFrom, setPickedFrom] = useState<"roulette" | "list">("roulette"); // 룰렛 vs 목록 지표
  const [flashId, setFlashId] = useState<string | null>(null);
  const [ask, setAsk] = useState<PendingVisit | null>(null); // 지금 물어볼 '다녀왔어요?'
  const [chosenLimit, setChosenLimit] = useState(DEFAULT_LIMIT); // 가격 상한 (S1b)
  const [priceOpen, setPriceOpen] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const skipTo = useRef<() => void>(() => {}); // '바로 보기'를 누르면 바로 보여줄 결과
  const openedAt = useRef(0); // 앱을 연(다시 돌아온) 시각. '여기 갈래요'까지 걸린 시간 지표 (구글맵과 비교)

  const locate = useCallback(() => {
    if (!navigator.geolocation) return setLoc({ status: "error" });
    setLoc({ status: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ status: "ok", point: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      (e) => setLoc({ status: e.code === e.PERMISSION_DENIED ? "denied" : "error" }),
      { timeout: 10000, maximumAge: 60000 },
    );
  }, []);

  const load = useCallback(() => {
    setData({ status: "loading" });
    fetchLunchShops()
      .then((shops) => setData({ status: "ok", shops }))
      .catch((e: unknown) => {
        trackError("shops", e);
        setData({ status: "error" });
      });
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    openedAt.current = performance.now();
    // 홈 화면 앱은 뒤로 갔다가 다음 날 다시 쓰기도 해서, 다시 화면에 돌아온 때부터 다시 잼
    const onVisible = () => {
      if (document.visibilityState === "visible") openedAt.current = performance.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    // 처음이면 S0부터 (위치는 버튼을 누를 때 물음). 이미 시작했거나 위치를 허용해 둔 브라우저면 바로 홈
    let started = false;
    try {
      started = localStorage.getItem(STARTED_KEY) === "1";
    } catch {
      // 저장소를 못 쓰면 권한 상태로만 판단
    }
    const granted = started
      ? Promise.resolve(true)
      : (navigator.permissions?.query({ name: "geolocation" }).then((s) => s.state === "granted") ?? Promise.resolve(false));
    void granted
      .catch(() => false)
      .then((skip) => {
        setFirstRun(!skip);
        if (skip) locate();
      });
    load(); // 가게 목록은 S0을 보는 동안 미리 불러 둠
    startAnalytics();
    watchErrors(); // 화면에서 난 오류를 남김 (베타 중 원격으로 원인 확인)
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from") === "push" ? "push" : params.get("ref") === "share" ? "share" : null; // 알림 · 공유 카드로 열었는지
    track("app_open", { lang: pickLang(navigator.languages ?? []), ...(from ? { from } : {}) }); // 언어: 번역이 필요한 언어 분포
    if (from === "share") track("share_open");
    if (from) window.history.replaceState(null, "", window.location.pathname);
    try {
      const saved = Number(localStorage.getItem(LIMIT_KEY));
      if (saved) setChosenLimit(saved);
    } catch {
      // 저장소를 못 쓰면 기본 990엔
    }
    wakeServer(); // 룰렛을 돌리는 동안 잠든 서버가 일어나게
    syncPush(); // 알림을 허용했던 휴대폰이면 구독을 다시 저장
    fetchPendingVisit() // 보관해 둔 '여기 갈래요'를 먼저 보내고, 물어볼 게 있으면 카드로
      .then(setAsk)
      .catch(() => {}); // 서버가 아직 안 일어났으면 다음에 열 때 물어봄
    const t = setInterval(() => setNow(new Date()), 60_000); // '지금 영업 중' · 마감까지 n분이 시간에 맞게
    return () => {
      clearInterval(t);
      clearTimers();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locate, load]);

  const { day, minutes } = osakaNow(now);
  // 가격 단계: 단계마다 근처 가게 수 · 잠금. 고른 단계가 여기서 잠기면 기본 990엔으로
  const tiers = useMemo(
    () => (loc.status === "ok" && data.status === "ok" ? tierInfo(data.shops, loc.point, day) : null),
    [loc, data, day],
  );
  const limit = tiers?.find((t) => t.limit === chosenLimit && !t.locked) ? chosenLimit : DEFAULT_LIMIT;
  const near = useMemo(
    () =>
      loc.status === "ok" && data.status === "ok"
        ? pickNearby(data.shops.filter((s) => underLimit(s, limit)), loc.point, day)
        : null,
    [loc, data, day, limit],
  );
  const nowKey = nowOnly ? minutes : -1; // '지금 영업 중'일 때만 1분마다 다시 거름 (아니면 핀이 매분 다시 그려짐)
  const visible = useMemo(() => {
    if (!near) return [];
    const list = nowOnly ? near.shops.filter((s) => openNow(s, day, nowKey)) : near.shops;
    const price = (s: LunchShop) => displayPrice(s)?.yen ?? Infinity;
    return [...list].sort((a, b) => (byDistance ? a.km - b.km : price(a) - price(b) || a.km - b.km));
  }, [near, nowOnly, byDistance, day, nowKey]);

  const pool = rouletteCandidates(visible, day, minutes);
  const allOrdersOver = near !== null && near.shops.length > 0 && rouletteCandidates(near.shops, day, minutes).length === 0;
  const area = near ? areaName(near.shops, t) : null;
  const rows = listOpen ? visible : visible.slice(0, COLLAPSED_ROWS);

  // 룰렛: 결과를 먼저 정하고, 핀을 점점 느리게 깜빡이다 결과에서 멈춤. 움직임 줄이기 설정이면 바로 결과
  const spin = () => {
    const winner = pickShop(pool, picked?.id ?? null);
    if (!winner) return;
    track("roulette_spin", {
      respin: mode === "result", // 다시 돌리기 횟수 지표
      pool_size: pool.length,
      radius_km: near?.radiusKm ?? null,
      price_limit: limit,
      now_only: nowOnly,
    });
    clearTimers();
    setPicked(null);
    const showResult = () => {
      setFlashId(null);
      setPicked(winner);
      setPickedFrom("roulette");
      setMode("result");
      track("result_view", {
        source: "roulette",
        distance_km: Math.round(winner.km * 100) / 100,
        walk_min: winner.walk,
        badge: priceBadge(winner),
        price_limit: limit,
      });
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return showResult();
    setMode("spin");
    let at = 0;
    for (const step of spinSteps(pool, winner.id)) {
      timers.current.push(setTimeout(() => setFlashId(step.id), at));
      at += step.ms;
    }
    timers.current.push(setTimeout(showResult, at + SPIN_END_PAUSE_MS));
    skipTo.current = showResult;
  };
  // 목록에서 직접 고르기 (PRD: 목록을 펼쳐 직접 고를 수도 있음). 결과 카드는 룰렛과 같음
  const pickFromList = (shop: NearbyShop, position: number) => {
    clearTimers();
    setFlashId(null);
    setPicked(shop);
    setPickedFrom("list");
    setMode("result");
    const distanceKm = Math.round(shop.km * 100) / 100;
    track("list_item_click", { position, distance_km: distanceKm, price_limit: limit, list_open: listOpen });
    track("result_view", { source: "list", distance_km: distanceKm, walk_min: shop.walk, badge: priceBadge(shop), price_limit: limit });
  };
  const skip = () => {
    clearTimers();
    skipTo.current();
  };
  const applyLimit = (next: number) => {
    if (next !== limit) track("price_limit_change", { from: limit, to: next });
    setChosenLimit(next);
    try {
      localStorage.setItem(LIMIT_KEY, String(next));
    } catch {
      // 기억 못 해도 이번에는 적용
    }
    setPriceOpen(false);
  };
  const backHome = () => {
    clearTimers();
    setFlashId(null);
    setPicked(null);
    setMode("home");
  };
  // 여기 갈래요: 화면은 바로 넘기고 저장은 뒤에서 (서버가 잠들어 있어도 기다리지 않게)
  const go = () => {
    if (!picked) return;
    const distanceKm = Math.round(picked.km * 100) / 100;
    saveVisit({
      id: crypto.randomUUID(),
      shopId: picked.id,
      shopName: picked.name,
      source: pickedFrom,
      distanceKm,
      priceLimit: limit,
      chosenAt: new Date().toISOString(),
    });
    track("go_here_click", {
      source: pickedFrom,
      distance_km: distanceKm,
      price_limit: limit,
      decide_sec: Math.round((performance.now() - openedAt.current) / 100) / 10, // 열고 → 여기 갈래요 (초, 소수 첫째 자리)
    });
    setMode("go");
  };

  const openTab = (next: Tab) => {
    if (next === "zukan" && tab !== "zukan") track("zukan_open");
    setTab(next);
  };
  const tabs = (
    <nav className="flex border-t border-[#E2E0D8] bg-white" aria-label={t("home.tabs")}>
      <Tab active={tab === "lunch"} onClick={() => openTab("lunch")} label={t("tab.lunch")} icon={<MapIcon />} />
      <Tab active={tab === "zukan"} onClick={() => openTab("zukan")} label={t("tab.zukan")} icon={<BookIcon />} />
      <Tab label={t("tab.settings")} icon={<SlidersIcon />} />
    </nav>
  );
  const mainClass = "mx-auto flex h-[100dvh] max-w-[480px] flex-col overflow-hidden bg-white text-[#1F1F1C]";
  const mainFont = { fontFamily: "-apple-system, 'Apple SD Gothic Neo', 'Hiragino Sans', 'Noto Sans KR', sans-serif" };

  // S0 첫 실행 (확인 중에는 빈 화면: 홈이 잠깐 보였다 바뀌지 않게)
  if (firstRun !== false) {
    const start = () => {
      try {
        localStorage.setItem(STARTED_KEY, "1");
      } catch {
        // 기억 못 하면 다음에 S0을 한 번 더 봄
      }
      setFirstRun(false);
      locate();
    };
    return <main className={mainClass} style={mainFont}>{firstRun && <FirstRun onStart={start} />}</main>;
  }

  // S6 도감 탭 (점심 탭의 지도 · 목록 대신)
  if (mode === "home" && tab === "zukan") {
    return (
      <main className={mainClass} style={mainFont}>
        <ZukanScreen shops={data.status === "ok" ? data.shops : null} here={loc.status === "ok" ? loc.point : null} nearby={visible} />
        {tabs}
      </main>
    );
  }

  return (
    <main className={mainClass} style={mainFont}>
      {(mode === "home" || mode === "spin") && (
        <header className="flex flex-col gap-3 px-5 pb-3 pt-5">
          <h1 className="flex items-center gap-1.5 text-[17px] font-semibold">
            <PinIcon />
            {area ? t("home.near", { area }) : t("home.nearHere")}
          </h1>
          {mode === "home" && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!tiers}
                onClick={() => setPriceOpen(true)}
                aria-haspopup="dialog"
                className="flex h-9 items-center gap-1 rounded-full border border-[#2457C5] bg-[#E8EEFA] px-3.5 text-sm font-semibold text-[#1A3F91]"
              >
                {t("home.limitChip", { limit: yen(limit) })}
                <svg {...svg} width={14} height={14} strokeWidth={2.5}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              <Chip on={nowOnly} onClick={() => setNowOnly((v) => !v)}>{t("home.openNow")}</Chip>
              <Chip on={byDistance} onClick={() => setByDistance((v) => !v)}>{t("home.byDistance")}</Chip>
            </div>
          )}
        </header>
      )}

      <section
        className={`relative bg-[#ECEAE3] ${mode === "result" ? "h-[170px] flex-none" : mode === "go" ? "hidden" : "flex-1"}`}
        aria-label={t("home.map")}
      >
        {loc.status === "ok" && near ? (
          <LunchMap
            here={loc.point}
            radiusKm={near.radiusKm}
            shops={visible}
            flashId={mode === "spin" ? flashId : null}
            showLocate={mode === "home" && !listOpen} // 목록을 펼치면 지도가 작아져 버튼이 칩 위로 올라감
            pickedId={mode === "result" ? (picked?.id ?? null) : null}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-[#5F5E58]">
            {loc.status === "asking" && <p>{t("home.locating")}</p>}
            {(loc.status === "denied" || loc.status === "error") && (
              <>
                <p>
                  {loc.status === "denied" ? t("home.locationDenied") : t("home.locationError")}
                </p>
                {loc.status === "denied" && ( // 거부한 뒤에는 다시 눌러도 묻지 않아서, 설정에서 켜는 방법을 알려 줌
                  <p className="text-left text-[13px] leading-relaxed">
                    {isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
                      ? t("home.locationHowIOS")
                      : t("home.locationHowOther")}
                  </p>
                )}
                <button type="button" onClick={locate} className="h-11 rounded-xl border border-[#CFCCC2] bg-white px-4 text-[#1F1F1C]">
                  {t("home.retry")}
                </button>
              </>
            )}
            {loc.status === "ok" && data.status === "loading" && <p>{t("home.loading")}</p>}
            {loc.status === "ok" && data.status === "error" && (
              <>
                <p>{t("home.loadError")}</p>
                <button type="button" onClick={load} className="h-11 rounded-xl border border-[#CFCCC2] bg-white px-4 text-[#1F1F1C]">
                  {t("home.retry")}
                </button>
              </>
            )}
          </div>
        )}
        {mode === "result" && (
          <button
            type="button"
            aria-label={t("home.back")}
            onClick={backHome}
            className="absolute left-3 top-3 z-[700] flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#1F1F1C] shadow"
          >
            <svg {...svg} width={20} height={20}>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
        )}
      </section>

      {mode === "spin" && (
        <section className="relative z-[600] -mt-4 flex flex-col items-center gap-2.5 rounded-t-[20px] border-t border-[#E2E0D8] bg-white px-5 pb-7 pt-4">
          <div className="h-1 w-10 rounded-full bg-[#CFCCC2]" aria-hidden="true" />
          <p className="text-xl font-semibold" aria-live="polite">{t("home.spinning")}</p>
          <div className="flex gap-2" aria-hidden="true">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#2457C5]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#9DB3E3] [animation-delay:150ms]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#D6D4CC] [animation-delay:300ms]" />
          </div>
          <button type="button" onClick={skip} className="min-h-11 px-3 text-sm text-[#2457C5]">
            {t("home.skip")}
          </button>
        </section>
      )}

      {mode === "result" && picked && (
        <ResultCard shop={picked} day={day} minutes={minutes} limit={limit} onGo={go} onRespin={spin} canRespin={pool.length > 1} />
      )}

      {mode === "go" && picked && <GoScreen shop={picked} onHome={backHome} />}

      {mode === "home" && priceOpen && tiers && (
        <PriceSheet tiers={tiers} current={limit} onApply={applyLimit} onClose={() => setPriceOpen(false)} />
      )}

      {mode === "home" && ask && !priceOpen && (
        <FeedbackSheet
          visit={ask}
          onClose={() => {
            setAsk(null);
            void flushVisits();
          }}
          onOpenZukan={() => {
            setAsk(null);
            openTab("zukan");
          }}
        />
      )}

      {mode === "home" && (
        <>
          <section className="relative z-[600] -mt-4 flex flex-col gap-3 rounded-t-[20px] border-t border-[#E2E0D8] bg-white px-5 pb-3.5 pt-2.5">
            <div className="h-1 w-10 self-center rounded-full bg-[#CFCCC2]" aria-hidden="true" />
            {near && (
              <div className="flex flex-col gap-1 text-sm text-[#5F5E58]">
                <div className="flex items-center justify-between gap-2">
                  <p>
                    {t(nowOnly ? "home.countOpenNow" : "home.count", { radius: near.radiusKm, limit: yen(limit), n: visible.length })}
                  </p>
                  {visible.length > COLLAPSED_ROWS && (
                    <button
                      type="button"
                      aria-expanded={listOpen}
                      onClick={() => {
                        if (!listOpen) track("list_open", { count: visible.length });
                        setListOpen(!listOpen);
                      }}
                      className="-my-2 h-11 px-1 font-semibold text-[#1A3F91]"
                    >
                      {listOpen ? t("home.listCollapse") : t("home.listExpand")}
                    </button>
                  )}
                </div>
                {near.widened && near.shops.length > 0 && <p>{t("home.widened", { radius: near.radiusKm })}</p>}
                {near.shops.length === 0 && (
                  <p>{t("home.none", { limit: yen(limit) })}</p>
                )}
                {allOrdersOver && <p>{t("home.ordersOver")}</p>}
              </div>
            )}
            <button
              type="button"
              disabled={pool.length === 0}
              onClick={spin}
              className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white disabled:opacity-50"
            >
              {t("home.spin")}
            </button>
            {rows.length > 0 && (
              <ul className={listOpen ? "max-h-[40dvh] overflow-y-auto" : ""}>
                {rows.map((s, i) => (
                  <li key={s.id} className="border-t border-[#ECEAE3]">
                    <button type="button" onClick={() => pickFromList(s, i)} className="flex w-full items-center gap-3 py-2.5 text-left">
                    {s.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 핫페퍼 사진을 그대로 씀 (이미지 최적화 비용 없음)
                      <img src={s.photoUrl} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-lg bg-[#ECEAE3] object-cover" />
                    ) : (
                      <div className="h-12 w-12 flex-none rounded-lg bg-[#ECEAE3]" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-[15px] font-semibold">{s.name}</p>
                      <p className="text-[13px] text-[#5F5E58]">
                        {s.genre ? `${genreLabel(s.genre, t)} · ` : ""}
                        <span className="text-[#1A3F91]">{t("common.walk", { n: s.walk })}</span>
                      </p>
                    </div>
                    <p className="text-base font-semibold">{priceLabel(s, t)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-[#5F5E58]">
              <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
                Powered by ホットペッパー グルメ Webサービス
              </a>
              {" · "}画像提供：ホットペッパー グルメ
              {machine && ` · ${t("i18n.ai")}`}
            </p>
          </section>

          {tabs}
        </>
      )}
    </main>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-9 rounded-full border px-3.5 text-sm ${
        on ? "border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border-[#CFCCC2] bg-white"
      }`}
    >
      {children}
    </button>
  );
}

// 설정 화면은 아직 없어서 점심 · 도감 탭만 켜 둠 (onClick이 없으면 꺼짐)
function Tab(props: { active?: boolean; onClick?: () => void; label: string; icon: React.ReactNode }) {
  const { active = false, onClick, label, icon } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 pb-3 pt-2 text-xs ${
        active ? "font-semibold text-[#1A3F91]" : "text-[#5F5E58] disabled:opacity-60"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

const PinIcon = () => (
  <svg {...svg} width={18} height={18}>
    <path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" />
    <circle cx="12" cy="10" r="2.5" />
  </svg>
);
const MapIcon = () => (
  <svg {...svg}>
    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
    <path d="M9 3v15M15 6v15" />
  </svg>
);
const BookIcon = () => (
  <svg {...svg}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19V5" />
  </svg>
);
const SlidersIcon = () => (
  <svg {...svg}>
    <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
    <circle cx="16" cy="6" r="2" />
    <circle cx="10" cy="12" r="2" />
    <circle cx="18" cy="18" r="2" />
  </svg>
);
