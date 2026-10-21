"use client";

// S1 홈 → S2 룰렛 → S3 결과 카드 (와이어프레임 v1). 지도는 세 화면에서 같은 것을 크기만 바꿔 씀
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areaName, displayPrice, genreLabel, openNow, osakaNow, pickNearby, pickShop, priceLabel, rouletteCandidates, spinSteps,
  type LunchShop, type NearbyShop, type Point,
} from "@/lib/lunch";
import { fetchLunchShops } from "@/lib/shops";
import { fetchPendingVisit, flushVisits, saveVisit, wakeServer } from "@/lib/api";
import type { PendingVisit } from "@/lib/visits";
import FeedbackSheet from "./FeedbackSheet";
import GoScreen from "./GoScreen";
import { svg } from "./icons";
import ResultCard from "./ResultCard";

const LunchMap = dynamic(() => import("./LunchMap"), { ssr: false }); // 지도는 브라우저에서만

type Loc = { status: "asking" } | { status: "denied" } | { status: "error" } | { status: "ok"; point: Point };
type Data = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; shops: LunchShop[] };
type Mode = "home" | "spin" | "result" | "go";

const PRICE_LIMIT = 990; // 가격 단계(790 / 1,190) 시트를 붙이기 전까지 고정

const COLLAPSED_ROWS = 2; // 접힌 목록에 보이는 줄 수
const SPIN_END_PAUSE_MS = 500; // 핀이 멈춘 뒤 결과 카드를 띄우기까지

export default function HomeScreen() {
  const [loc, setLoc] = useState<Loc>({ status: "asking" });
  const [data, setData] = useState<Data>({ status: "loading" });
  const [now, setNow] = useState(() => new Date());
  const [nowOnly, setNowOnly] = useState(false); // 지금 영업 중
  const [byDistance, setByDistance] = useState(false); // 가까운순 (아니면 싼 순)
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("home");
  const [picked, setPicked] = useState<NearbyShop | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [ask, setAsk] = useState<PendingVisit | null>(null); // 지금 물어볼 '다녀왔어요?'
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const skipTo = useRef<() => void>(() => {}); // '바로 보기'를 누르면 바로 보여줄 결과

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
      .catch((e: Error) => setData({ status: "error", message: e.message }));
  }, []);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    locate();
    load();
    wakeServer(); // 룰렛을 돌리는 동안 잠든 서버가 일어나게
    fetchPendingVisit() // 보관해 둔 '여기 갈래요'를 먼저 보내고, 물어볼 게 있으면 카드로
      .then(setAsk)
      .catch(() => {}); // 서버가 아직 안 일어났으면 다음에 열 때 물어봄
    const t = setInterval(() => setNow(new Date()), 60_000); // '지금 영업 중' · 마감까지 n분이 시간에 맞게
    return () => {
      clearInterval(t);
      clearTimers();
    };
  }, [locate, load]);

  const { day, minutes } = osakaNow(now);
  const near = useMemo(
    () => (loc.status === "ok" && data.status === "ok" ? pickNearby(data.shops, loc.point, day) : null),
    [loc, data, day],
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
  const area = near ? areaName(near.shops) : null;
  const rows = listOpen ? visible : visible.slice(0, COLLAPSED_ROWS);

  // 룰렛: 결과를 먼저 정하고, 핀을 점점 느리게 깜빡이다 결과에서 멈춤. 움직임 줄이기 설정이면 바로 결과
  const spin = () => {
    const winner = pickShop(pool, picked?.id ?? null);
    if (!winner) return;
    clearTimers();
    setPicked(null);
    const showResult = () => {
      setFlashId(null);
      setPicked(winner);
      setMode("result");
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
  const skip = () => {
    clearTimers();
    skipTo.current();
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
    saveVisit({
      id: crypto.randomUUID(),
      shopId: picked.id,
      shopName: picked.name,
      source: "roulette",
      distanceKm: Math.round(picked.km * 100) / 100,
      priceLimit: PRICE_LIMIT,
      chosenAt: new Date().toISOString(),
    });
    setMode("go");
  };

  return (
    <main
      className="mx-auto flex h-[100dvh] max-w-[480px] flex-col overflow-hidden bg-white text-[#1F1F1C]"
      style={{ fontFamily: "-apple-system, 'Apple SD Gothic Neo', 'Hiragino Sans', 'Noto Sans KR', sans-serif" }}
    >
      {(mode === "home" || mode === "spin") && (
        <header className="flex flex-col gap-3 px-5 pb-3 pt-5">
          <h1 className="flex items-center gap-1.5 text-[17px] font-semibold">
            <PinIcon />
            {area ? `${area} 근처` : "지금 위치 근처"}
          </h1>
          {mode === "home" && (
            <div className="flex gap-2">
              <span className="flex h-9 items-center rounded-full border border-[#2457C5] bg-[#E8EEFA] px-3.5 text-sm font-semibold text-[#1A3F91]">
                990엔 이하
              </span>
              <Chip on={nowOnly} onClick={() => setNowOnly((v) => !v)}>지금 영업 중</Chip>
              <Chip on={byDistance} onClick={() => setByDistance((v) => !v)}>가까운순</Chip>
            </div>
          )}
        </header>
      )}

      <section
        className={`relative bg-[#ECEAE3] ${mode === "result" ? "h-[170px] flex-none" : mode === "go" ? "hidden" : "flex-1"}`}
        aria-label="지도"
      >
        {loc.status === "ok" && near ? (
          <LunchMap
            here={loc.point}
            radiusKm={near.radiusKm}
            shops={visible}
            flashId={mode === "spin" ? flashId : null}
            pickedId={mode === "result" ? (picked?.id ?? null) : null}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-[#5F5E58]">
            {loc.status === "asking" && <p>지금 위치를 확인하고 있어요</p>}
            {(loc.status === "denied" || loc.status === "error") && (
              <>
                <p>
                  {loc.status === "denied"
                    ? "위치를 허용하면 근처 990엔 점심 가게를 보여 드려요. 브라우저 설정에서 이 사이트의 위치 권한을 켜 주세요."
                    : "지금 위치를 알 수 없어요."}
                </p>
                <button type="button" onClick={locate} className="h-11 rounded-xl border border-[#CFCCC2] bg-white px-4 text-[#1F1F1C]">
                  다시 시도
                </button>
              </>
            )}
            {loc.status === "ok" && data.status === "loading" && <p>가게를 불러오는 중이에요</p>}
            {loc.status === "ok" && data.status === "error" && (
              <>
                <p>{data.message}</p>
                <button type="button" onClick={load} className="h-11 rounded-xl border border-[#CFCCC2] bg-white px-4 text-[#1F1F1C]">
                  다시 시도
                </button>
              </>
            )}
          </div>
        )}
        {mode === "result" && (
          <button
            type="button"
            aria-label="홈으로"
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
          <p className="text-xl font-semibold" aria-live="polite">고르는 중…</p>
          <div className="flex gap-2" aria-hidden="true">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#2457C5]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#9DB3E3] [animation-delay:150ms]" />
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#D6D4CC] [animation-delay:300ms]" />
          </div>
          <button type="button" onClick={skip} className="min-h-11 px-3 text-sm text-[#2457C5]">
            바로 보기
          </button>
        </section>
      )}

      {mode === "result" && picked && (
        <ResultCard shop={picked} day={day} minutes={minutes} onGo={go} onRespin={spin} canRespin={pool.length > 1} />
      )}

      {mode === "go" && picked && <GoScreen shop={picked} onHome={backHome} />}

      {mode === "home" && ask && (
        <FeedbackSheet
          visit={ask}
          onClose={() => {
            setAsk(null);
            void flushVisits();
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
                    {near.radiusKm}km 안 990엔 이하 {nowOnly ? "지금 영업 중 " : ""}
                    {visible.length}곳
                  </p>
                  {visible.length > COLLAPSED_ROWS && (
                    <button
                      type="button"
                      aria-expanded={listOpen}
                      onClick={() => setListOpen((v) => !v)}
                      className="-my-2 h-11 px-1 font-semibold text-[#1A3F91]"
                    >
                      {listOpen ? "목록 접기" : "목록 모두 보기"}
                    </button>
                  )}
                </div>
                {near.widened && near.shops.length > 0 && <p>가까운 가게가 적어서 {near.radiusKm}km까지 넓혔어요</p>}
                {near.shops.length === 0 && (
                  <p>2km 안에 오늘 점심 영업하는 990엔 이하 가게가 없어요. 지금은 오사카 시내 중심 6개 지역만 보여 줘요.</p>
                )}
                {allOrdersOver && <p>오늘 점심 주문은 모두 끝났어요</p>}
              </div>
            )}
            <button
              type="button"
              disabled={pool.length === 0}
              onClick={spin}
              className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white disabled:opacity-50"
            >
              오늘 점심 정해줘
            </button>
            {rows.length > 0 && (
              <ul className={listOpen ? "max-h-[40dvh] overflow-y-auto" : ""}>
                {rows.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 border-t border-[#ECEAE3] py-2.5">
                    {s.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 핫페퍼 사진을 그대로 씀 (이미지 최적화 비용 없음)
                      <img src={s.photoUrl} alt="" loading="lazy" className="h-12 w-12 flex-none rounded-lg bg-[#ECEAE3] object-cover" />
                    ) : (
                      <div className="h-12 w-12 flex-none rounded-lg bg-[#ECEAE3]" />
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-[15px] font-semibold">{s.name}</p>
                      <p className="text-[13px] text-[#5F5E58]">
                        {s.genre ? `${genreLabel(s.genre)} · ` : ""}
                        <span className="text-[#1A3F91]">걸어서 {s.walk}분</span>
                      </p>
                    </div>
                    <p className="text-base font-semibold">{priceLabel(s)}</p>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-[#5F5E58]">
              <a href="https://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
                Powered by ホットペッパー グルメ Webサービス
              </a>
              {" · "}画像提供：ホットペッパー グルメ
            </p>
          </section>

          <nav className="flex border-t border-[#E2E0D8] bg-white" aria-label="아래 탭">
            <Tab active label="점심" icon={<MapIcon />} />
            <Tab label="도감" icon={<BookIcon />} />
            <Tab label="설정" icon={<SlidersIcon />} />
          </nav>
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

// 도감 · 설정 화면은 아직 없어서 점심 탭만 켜 둠
function Tab({ active = false, label, icon }: { active?: boolean; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={!active}
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
