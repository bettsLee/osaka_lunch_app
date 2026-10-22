"use client";

// S1 홈 → S2 룰렛 → S3 결과 카드 (와이어프레임 v1). 지도는 세 화면에서 같은 것을 크기만 바꿔 씀
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areaCenters, areaName, DEFAULT_LIMIT, displayPrice, distanceKm, genreLabel, openNow, osakaNow, nextLunch, pickNearby, pickShop, priceBadge, priceLabel,
  rouletteCandidates, spinSteps, tierInfo, underLimit, walkMinutes,
  type LunchShop, type NearbyShop, type Point,
} from "@/lib/lunch";
import { fetchLunchShops } from "@/lib/shops";
import { arriveVisit, cancelVisit, fetchPendingVisit, fetchSharedShops, flushVisits, isStandalone, saveVisit, syncPush, wakeServer } from "@/lib/api";
import { startAnalytics, track, trackError, watchErrors } from "@/lib/analytics";
import { pickLang } from "@/lib/i18n";
import { isIOS } from "@/lib/push";
import { shareCode, sharedIds } from "@/lib/share";
import { arrivedNear, stillGoing, type Going, type PendingVisit } from "@/lib/visits";
import ArriveSheet from "./ArriveSheet";
import FeedbackSheet from "./FeedbackSheet";
import FirstRun from "./FirstRun";
import { GoingBar, GoingPanel } from "./GoingCard";
import InstallHint from "./InstallHint";
import GoScreen from "./GoScreen";
import { useT } from "./I18n";
import { useSheetSwipe } from "./useSheetSwipe";
import Waiting from "./Waiting";
import { svg } from "./icons";
import PriceSheet from "./PriceSheet";
import ResultCard from "./ResultCard";
import SettingsScreen from "./SettingsScreen";
import SharedScreen from "./SharedScreen";
import ZukanScreen from "./ZukanScreen";

const LunchMap = dynamic(() => import("./LunchMap"), { ssr: false }); // 지도는 브라우저에서만

// area: 위치 대신 고른 동네 (10/22 화면 점검 01 · 02 · 04: 동네 골라서 보기)
type Loc = { status: "asking" } | { status: "denied" } | { status: "error" } | { status: "ok"; point: Point; area?: string };
type Data = { status: "loading" } | { status: "error" } | { status: "ok"; shops: LunchShop[] };
type Mode = "home" | "spin" | "result" | "go";
type Tab = "lunch" | "zukan" | "settings";

const LIMIT_KEY = "osaka-lunch-price-limit"; // 고른 가격 상한은 이 휴대폰에만 기억
const STARTED_KEY = "osaka-lunch-started"; // S0 첫 실행에서 '내 위치로 시작하기'를 누른 적 있음
const INSTALL_HINT_KEY = "osaka-lunch-install-hint-closed"; // 홈 화면 추가 안내를 닫음
const GOING_KEY = "osaka-lunch-going"; // 여기 갈래요로 정한 가게 (지도의 파란 핀 · 결과 카드의 길찾기 · 취소)
const yen = (n: number) => n.toLocaleString("ja-JP");

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
  const [pickedFrom, setPickedFrom] = useState<"roulette" | "list" | "map" | "going" | "shared">("roulette"); // 룰렛 vs 목록 vs 지도 핀 지표 (going: 정한 가게 카드의 '가게 정보')
  const [flashId, setFlashId] = useState<string | null>(null);
  const [ask, setAsk] = useState<PendingVisit | null>(null); // 지금 물어볼 '다녀왔어요?'
  const [chosenLimit, setChosenLimit] = useState(DEFAULT_LIMIT); // 가격 상한 (S1b)
  const [priceOpen, setPriceOpen] = useState(false);
  const [installHint, setInstallHint] = useState(false); // 아이폰을 브라우저로 열었고 안내를 닫은 적 없음
  const [sheetHidden, setSheetHidden] = useState(false); // 손잡이를 눌러 아래 시트를 접고 지도를 크게 (10/22 도그푸딩)
  const [cardHidden, setCardHidden] = useState(false); // 결과 카드도 손잡이로 접고 지도를 크게 (새 결과가 나오면 다시 펼침)
  const [going, setGoing] = useState<Going | null>(null); // 여기 갈래요 뒤 1시간 동안 정한 가게 (지도의 파란 핀)
  const [arrival, setArrival] = useState<{ going: Going; by: "auto" | "manual" } | null>(null); // 도착했어요 시트
  const [shared, setShared] = useState<string[]>([]); // 친구가 추천한 가게 (추천 링크로 열었을 때)
  const [sharedLoading, setSharedLoading] = useState(false); // 짧은 링크의 가게 번호를 서버에 묻는 중
  const [fix, setFix] = useState<{ shopId: string; distanceM: number } | null>(null); // 정한 가게까지 마지막으로 잰 거리 (정한 가게 카드)
  const sheetSwipe = useSheetSwipe(sheetHidden, setSheetHidden); // 손잡이를 끌어서 내리고 올리기 (누르기도 그대로)
  const cardSwipe = useSheetSwipe(cardHidden, setCardHidden);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const skipTo = useRef<() => void>(() => {}); // '바로 보기'를 누르면 바로 보여줄 결과
  const openedAt = useRef(0); // 앱을 연(다시 돌아온) 시각. '여기 갈래요'까지 걸린 시간 지표 (구글맵과 비교)
  const checkArrival = useRef<() => void>(() => {}); // 앱을 열거나 돌아올 때 정한 가게 근처인지 (도착했어요 자동)
  const lastCheck = useRef<{ distanceM: number; accuracyM: number } | null>(null); // 마지막으로 잰 거리 · GPS 오차 (80m 기준을 맞추는 지표)

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

  // 동네 골라서 보기 (10/22 화면 점검 01 · 02 · 04): 위치를 못 쓰거나 근처에 가게가 없을 때 그 동네 가운데를 기준으로
  const chooseArea = (code: string, reason: string) => {
    if (data.status !== "ok") return;
    const area = areaCenters(data.shops).find((a) => a.code === code);
    if (!area) return;
    setLoc({ status: "ok", point: area.point, area: code });
    track("area_pick", { code, reason });
  };

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    openedAt.current = performance.now();
    // 홈 화면 앱은 뒤로 갔다가 다음 날 다시 쓰기도 해서, 다시 화면에 돌아온 때부터 다시 잼
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      openedAt.current = performance.now();
      checkArrival.current(); // 길찾기로 구글 지도에 갔다가 돌아오는 경우
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
    try {
      setGoing(stillGoing(JSON.parse(localStorage.getItem(GOING_KEY) ?? "null"), new Date()));
    } catch {
      // 기억 못 하면 가는 중을 안 보여 줌
    }
    startAnalytics();
    watchErrors(); // 화면에서 난 오류를 남김 (베타 중 원격으로 원인 확인)
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from") === "push" ? "push" : params.get("ref") === "share" ? "share" : null; // 알림 · 추천 링크로 열었는지
    const recommended = from === "share" ? sharedIds(window.location.search) : []; // 긴 링크의 가게 번호 (주소에서 지우기 전에)
    const code = from === "share" ? shareCode(window.location.search) : null; // 짧은 링크의 코드 (10/22 결정)
    setShared(recommended);
    if (code) {
      setSharedLoading(true);
      fetchSharedShops(code) // 서버가 잠들어 있으면 깨는 동안 '불러오는 중'
        .then((ids) => {
          setShared(ids);
          track("share_open", { count: ids.length, short: true });
        })
        .catch((e: unknown) => trackError("share_open", e))
        .finally(() => setSharedLoading(false));
    }
    const standalone = isStandalone();
    track("app_open", { lang: pickLang(navigator.languages ?? []), standalone, ...(from ? { from } : {}) }); // 언어: 번역이 필요한 언어 분포 · standalone: 홈 화면 앱으로 연 비율
    try {
      setInstallHint(
        isIOS(navigator.userAgent, navigator.platform, navigator.maxTouchPoints) && !standalone && !localStorage.getItem(INSTALL_HINT_KEY),
      );
    } catch {
      // 저장소를 못 쓰면 안내를 안 띄움 (닫아도 기억 못 해서 매번 뜨게 됨)
    }
    if (from === "share" && !code) track("share_open", { count: recommended.length, short: false });
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

  // 인터넷이 다시 연결되면 못 불러온 가게 목록을 다시 (10/22 화면 점검 08)
  const failed = data.status === "error";
  useEffect(() => {
    if (!failed) return;
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [failed, load]);

  // 앱을 열 때 (위치를 받은 뒤) 정한 가게 근처인지
  useEffect(() => {
    if (loc.status === "ok") checkArrival.current();
  }, [loc.status]);

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
  const next = allOrdersOver && near ? nextLunch(near.shops, day) : null;
  const area = near ? areaName(near.shops, t) : null;
  const rows = listOpen ? visible : []; // 목록은 '목록 보기'를 눌러야 보임 (10/22 도그푸딩: 처음엔 룰렛 버튼만)
  const goingNow = stillGoing(going, now);
  // 친구가 추천한 가게: 지금 가게 목록에서 찾고, 위치를 알면 걸어서 n분
  const sharedShops = useMemo(() => {
    if (!shared.length || data.status !== "ok") return [];
    const byId = new Map(data.shops.map((s) => [s.id, s]));
    return shared.flatMap((id) => {
      const s = byId.get(id);
      if (!s) return [];
      const km = loc.status === "ok" ? distanceKm(loc.point, s) : 0;
      return [{ ...s, km, walk: walkMinutes(km) }];
    });
  }, [shared, data, loc]);
  // 정한 가게 카드 (10/22 도그푸딩: 내비게이션처럼): 가격 · 남은 거리 (앱을 열 때 · 돌아올 때 잰 위치, 없으면 처음 위치)
  const goingShop = goingNow && data.status === "ok" ? data.shops.find((s) => s.id === goingNow.shopId) : undefined;
  const goingNearby = goingNow ? (near?.shops.find((s) => s.id === goingNow.shopId) ?? null) : null;
  const goingDistanceM = !goingNow
    ? null
    : fix?.shopId === goingNow.shopId
      ? fix.distanceM
      : loc.status === "ok"
        ? distanceKm(loc.point, goingNow) * 1000
        : null;

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
      setCardHidden(false);
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
  // 목록 · 지도 핀에서 직접 고르기 (PRD: 목록을 펼쳐 직접 고를 수도 있음). 결과 카드는 룰렛과 같음
  const pickDirect = (shop: NearbyShop, from: "list" | "map" | "going" | "shared") => {
    clearTimers();
    setFlashId(null);
    setCardHidden(false);
    setPicked(shop);
    setPickedFrom(from);
    setMode("result");
    const distanceKm = Math.round(shop.km * 100) / 100;
    track("result_view", { source: from, distance_km: distanceKm, walk_min: shop.walk, badge: priceBadge(shop), price_limit: limit });
    return distanceKm;
  };
  const pickFromList = (shop: NearbyShop, position: number) => {
    const distanceKm = pickDirect(shop, "list");
    track("list_item_click", { position, distance_km: distanceKm, price_limit: limit, list_open: listOpen });
  };
  // 지도 핀을 누르면 그 가게 결과 카드 (10/22 도그푸딩: 이름 말풍선 대신). 룰렛이 도는 중에는 무시
  const pickFromMap = (shopId: string) => {
    if (mode !== "home" && mode !== "result") return;
    const shop = visible.find((s) => s.id === shopId);
    if (!shop) return;
    const distanceKm = pickDirect(shop, "map");
    track("map_pin_click", { distance_km: distanceKm, price_limit: limit, map_big: sheetHidden });
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
  // 가는 중 기억 (이 휴대폰에만)
  const rememberGoing = (next: Going | null) => {
    setGoing(next);
    try {
      if (next) localStorage.setItem(GOING_KEY, JSON.stringify(next));
      else localStorage.removeItem(GOING_KEY);
    } catch {
      // 기억 못 해도 이번에는 화면에 보임
    }
  };
  // 정한 가게 카드 · 결과 카드의 취소 (한 번 더 물어본 뒤)
  const cancelChosen = () => {
    if (goingNow) cancelGoing(goingNow, "cancel");
    rememberGoing(null);
    backHome();
  };
  // 여기 갈래요 취소 (10/22 결정: 따로 기록). changed: 다른 가게로 다시 정해서 앞의 것이 취소됨
  const cancelGoing = (g: Going, reason: "cancel" | "changed") => {
    cancelVisit(g.id);
    track("visit_cancel", { reason, after_min: Math.round((Date.now() - new Date(g.chosenAt).getTime()) / 60000) });
  };

  // 도착했어요 (10/22 결정: 버튼 + 앱을 열 때 가게 근처면 자동): 도감에 바로 넣고, 홈은 처음 상태로 돌린 뒤 영업 여부만 물음
  const arrive = (g: Going, by: "auto" | "manual") => {
    if (stillGoing(going, new Date())?.id !== g.id) return; // 위치를 재는 사이 취소했거나 이미 도착함
    arriveVisit(g.id, by);
    const m = lastCheck.current;
    track("visit_arrive", {
      by,
      after_min: Math.round((Date.now() - new Date(g.chosenAt).getTime()) / 60000),
      distance_m: m ? Math.round(m.distanceM / 10) * 10 : null, // 10m 단위 (여기 갈래요의 distance_km과 같은 정도)
      accuracy_m: m ? Math.round(m.accuracyM / 10) * 10 : null,
    });
    track("zukan_add", { from: "arrive" });
    lastCheck.current = null; // 다음에 정한 가게와 섞이지 않게
    rememberGoing(null);
    if (ask?.id === g.id) setAsk(null);
    setPriceOpen(false);
    setTab("lunch");
    backHome();
    setArrival({ going: g, by });
  };
  // 자동: 휴대폰 안에서 위치를 한 번 재서 가게와 비교 (위치는 보내지 않음). GPS 오차가 크면 판단하지 않고 버튼에 맡김
  checkArrival.current = () => {
    const g = stillGoing(going, new Date());
    if (!g || arrival || loc.status !== "ok" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const distanceM = distanceKm({ lat: p.coords.latitude, lng: p.coords.longitude }, g) * 1000;
        lastCheck.current = { distanceM, accuracyM: p.coords.accuracy };
        setFix({ shopId: g.shopId, distanceM });
        if (arrivedNear(distanceM, p.coords.accuracy)) arriveRef.current(g, "auto");
      },
      () => {}, // 못 재면 버튼으로
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }, // 예전에 잰 위치(가게에 오기 전)를 다시 쓰지 않게
    );
  };
  const arriveRef = useRef(arrive);
  arriveRef.current = arrive; // 위치를 잰 뒤에는 그때의 화면 상태로 판단

  // 여기 갈래요: 화면은 바로 넘기고 저장은 뒤에서 (서버가 잠들어 있어도 기다리지 않게)
  const go = () => {
    if (!picked) return;
    const before = stillGoing(going, new Date());
    if (before) cancelGoing(before, "changed");
    lastCheck.current = null;
    const distanceKm = Math.round(picked.km * 100) / 100;
    const id = crypto.randomUUID();
    const chosenAt = new Date().toISOString();
    saveVisit({
      id,
      shopId: picked.id,
      shopName: picked.name,
      source: pickedFrom === "roulette" ? "roulette" : "list", // 서버에는 직접 고름(list)으로. 지도 핀인지는 이벤트로 봄
      distanceKm,
      priceLimit: limit,
      chosenAt,
    });
    rememberGoing({ id, shopId: picked.id, shopName: picked.name, lat: picked.lat, lng: picked.lng, walk: picked.walk, chosenAt, priceLimit: limit });
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
      <Tab active={tab === "settings"} onClick={() => openTab("settings")} label={t("tab.settings")} icon={<SlidersIcon />} />
    </nav>
  );
  // 도감 · 설정 탭에서도 정한 가게는 탭 위에 한 줄로 (누르면 점심 탭의 카드로)
  const goingBarAboveTabs = goingNow && (
    <GoingBar
      going={goingNow}
      price={null}
      distanceM={goingDistanceM}
      onArrive={() => arrive(goingNow, "manual")}
      onOpen={() => {
        setSheetHidden(false);
        openTab("lunch");
      }}
      className="flex-none border-t border-[#E2E0D8] bg-white px-4 py-1.5"
    />
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

  // 추천 링크로 열었으면 점심 탭 대신 '친구가 추천한 점심' (가게를 누르면 결과 카드, 뒤로 가면 다시 여기)
  if (mode === "home" && tab === "lunch" && (shared.length > 0 || sharedLoading)) {
    return (
      <main className={mainClass} style={mainFont}>
        <SharedScreen
          shops={sharedShops}
          missing={data.status === "ok" ? shared.length - sharedShops.length : 0}
          loading={data.status === "loading" || sharedLoading}
          located={loc.status === "ok"}
          day={day}
          minutes={minutes}
          onOpen={(shop) => pickDirect(shop, "shared")}
          onClose={() => setShared([])}
        />
        {tabs}
      </main>
    );
  }

  // S6 도감 탭 (점심 탭의 지도 · 목록 대신)
  if (mode === "home" && tab === "zukan") {
    return (
      <main className={mainClass} style={mainFont}>
        <ZukanScreen
          shops={data.status === "ok" ? data.shops : null}
          here={loc.status === "ok" ? loc.point : null}
          nearby={visible}
          onGoLunch={() => openTab("lunch")}
        />
        {goingBarAboveTabs}
        {tabs}
      </main>
    );
  }

  // S8 설정 탭
  if (mode === "home" && tab === "settings") {
    return (
      <main className={mainClass} style={mainFont}>
        <SettingsScreen limit={limit} />
        {goingBarAboveTabs}
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
          {/* 작은 화면 · 큰 글자에서 칩 글자가 두 줄로 깨지지 않게 한 줄 + 가로 스크롤 (10/22 기기 점검) */}
          {mode === "home" && (
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5">
              <button
                type="button"
                disabled={!tiers}
                onClick={() => setPriceOpen(true)}
                aria-haspopup="dialog"
                className="flex h-9 flex-none items-center gap-1 whitespace-nowrap rounded-full border border-[#2457C5] bg-[#E8EEFA] px-3.5 text-sm font-semibold text-[#1A3F91]"
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
        className={`relative bg-[#ECEAE3] ${mode === "result" ? (cardHidden ? "flex-1" : "h-[170px] flex-none") : mode === "go" ? "hidden" : "flex-1"}`}
        aria-label={t("home.map")}
      >
        {loc.status === "ok" && near ? (
          <LunchMap
            here={loc.point}
            radiusKm={near.radiusKm}
            shops={visible}
            flashId={mode === "spin" ? flashId : null}
            showLocate={mode === "home" && (!listOpen || sheetHidden || goingNow !== null)} // 목록을 펼치면 지도가 작아져 버튼이 칩 위로 올라감 (시트를 접거나 정한 가게 카드면 다시 보임)
            pickedId={mode === "result" ? (picked?.id ?? null) : null}
            onPick={pickFromMap}
            goingId={goingNow?.shopId ?? null} // 정한 가게는 ✓ 파란 핀으로, 다른 가게를 볼 때도 (10/22 도그푸딩)
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-sm text-[#5F5E58]">
            {loc.status === "asking" && <p>{t("home.locating")}</p>}
            {(loc.status === "denied" || loc.status === "error") && (
              <>
                <p>
                  {loc.status === "denied" ? t("home.locationDenied") : t("home.locationError")}
                </p>
                {loc.status === "error" && <p className="text-[13px]">{t("home.locationErrorHint")}</p>}
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
                {/* 위치 없이도 쓰게: 동네를 고르면 그 동네 가운데를 기준으로 */}
                {data.status === "ok" && (
                  <AreaPicker shops={data.shops} onPick={(code) => chooseArea(code, loc.status)} className="mt-2 items-center" />
                )}
              </>
            )}
            {loc.status === "ok" && data.status === "loading" && <Waiting text={t("home.loading")} />}
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
        <ResultCard
          shop={picked}
          day={day}
          minutes={minutes}
          limit={limit}
          onGo={go}
          onRespin={spin}
          canRespin={pool.length > 1}
          collapsed={cardHidden}
          onToggle={() => setCardHidden((v) => !v)}
          handle={cardSwipe}
          goingAt={goingNow?.shopId === picked.id ? goingNow.chosenAt : null}
          onCancelGoing={cancelChosen}
          onArrive={() => {
            if (goingNow) arrive(goingNow, "manual");
          }}
        />
      )}

      {mode === "go" && picked && <GoScreen shop={picked} onHome={backHome} />}

      {mode === "home" && priceOpen && tiers && (
        <PriceSheet tiers={tiers} current={limit} onApply={applyLimit} onClose={() => setPriceOpen(false)} />
      )}

      {mode === "home" && arrival && (
        <ArriveSheet
          visitId={arrival.going.id}
          shopName={arrival.going.shopName}
          limit={arrival.going.priceLimit ?? limit}
          by={arrival.by}
          onClose={() => setArrival(null)}
          onOpenZukan={() => {
            setArrival(null);
            openTab("zukan");
          }}
          onPickAnother={() => {
            setArrival(null);
            locate(); // 가게 앞에서 다시 고르니 지금 위치로 근처를 다시 찾음
          }}
        />
      )}

      {mode === "home" && ask && !priceOpen && !arrival && (
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
          <section className="relative z-[600] -mt-4 flex flex-col gap-3 rounded-t-[20px] border-t border-[#E2E0D8] bg-white px-5 pb-3.5 pt-0.5">
            <button
              type="button"
              {...sheetSwipe}
              aria-expanded={!sheetHidden}
              aria-label={sheetHidden ? t("home.sheetShow") : t("home.sheetHide")}
              className="-mb-2 flex h-8 w-full items-center justify-center"
            >
              <span className="h-1 w-10 rounded-full bg-[#CFCCC2]" />
            </button>
            {goingNow && sheetHidden && (
              <GoingBar
                going={goingNow}
                price={null}
                distanceM={goingDistanceM}
                onArrive={() => arrive(goingNow, "manual")}
                onOpen={() => setSheetHidden(false)}
              />
            )}
            {goingNow && !sheetHidden && (
              <GoingPanel
                going={goingNow}
                price={goingShop ? priceLabel(goingShop, t) : null}
                distanceM={goingDistanceM}
                onArrive={() => arrive(goingNow, "manual")}
                onCancel={cancelChosen}
                onInfo={goingNearby ? () => pickDirect(goingNearby, "going") : null}
              />
            )}
            {!goingNow && !sheetHidden && near && (
              <div className="flex flex-col gap-1 text-sm text-[#5F5E58]">
                <div className="flex items-center justify-between gap-2">
                  <p>
                    {t(nowOnly ? "home.countOpenNow" : "home.count", { radius: near.radiusKm, limit: yen(limit), n: visible.length })}
                  </p>
                  {visible.length > 0 && (
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
                  <>
                    <p>{t("home.none", { limit: yen(limit) })}</p>
                    {data.status === "ok" && <AreaPicker shops={data.shops} onPick={(code) => chooseArea(code, "none")} className="pt-1" />}
                  </>
                )}
                {loc.status === "ok" && loc.area && (
                  <p className="flex items-center justify-between gap-2">
                    <span>{t("home.pickAreaNote")}</span>
                    <button type="button" onClick={locate} className="-my-2 h-11 flex-none px-1 font-semibold text-[#1A3F91]">
                      {t("home.useMyLocation")}
                    </button>
                  </p>
                )}
                {allOrdersOver && <p>{t("home.ordersOver")}</p>}
                {allOrdersOver && next && ( // 10/22 화면 점검 03: 언제 다시 되는지
                  <p>
                    {next.days === 1
                      ? t("home.nextLunchTomorrow", { time: next.start })
                      : t("home.nextLunchOn", { day: t(`day.${next.day}`), time: next.start })}
                  </p>
                )}
              </div>
            )}
            {!goingNow && !sheetHidden && installHint && (
              <InstallHint
                onClose={() => {
                  setInstallHint(false);
                  try {
                    localStorage.setItem(INSTALL_HINT_KEY, "1");
                  } catch {
                    // 기억 못 해도 이번에는 닫음
                  }
                }}
              />
            )}
            {!goingNow && !sheetHidden && (
              <button
                type="button"
                disabled={pool.length === 0}
                onClick={spin}
                className="h-14 rounded-[14px] bg-[#2457C5] text-lg font-semibold text-white disabled:opacity-50"
              >
                {t("home.spin")}
              </button>
            )}
            {!goingNow && !sheetHidden && rows.length > 0 && (
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
      className={`h-9 flex-none whitespace-nowrap rounded-full border px-3.5 text-sm ${
        on ? "border-[#2457C5] bg-[#E8EEFA] font-semibold text-[#1A3F91]" : "border-[#CFCCC2] bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function Tab(props: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  const { active, onClick, label, icon } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-0.5 pb-3 pt-2 text-xs ${
        active ? "font-semibold text-[#1A3F91]" : "text-[#5F5E58]"
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

// 동네 칩 (가게가 많은 동네부터)
function AreaPicker(props: { shops: LunchShop[]; onPick: (code: string) => void; className?: string }) {
  const { shops, onPick, className = "" } = props;
  const { t } = useT();
  const areas = useMemo(() => areaCenters(shops), [shops]);
  if (!areas.length) return null;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <p className="text-[13px] font-semibold text-[#1F1F1C]">{t("home.pickArea")}</p>
      <div className={`flex flex-wrap gap-2 ${className.includes("items-center") ? "justify-center" : ""}`}>
        {areas.map((a) => (
          <button
            key={a.code}
            type="button"
            onClick={() => onPick(a.code)}
            className="h-9 rounded-full border border-[#2457C5] bg-white px-3.5 text-sm font-semibold text-[#1A3F91]"
          >
            {t(`area.${a.code}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
