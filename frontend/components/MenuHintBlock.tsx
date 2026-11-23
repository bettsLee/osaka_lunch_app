"use client";

// 결과 카드의 메뉴 칸 (11/17, OL-65 · OL-66)
// - 손님 사진 3장 (구글 장소 API): 상권 "메뉴사진도 같이 넣을 수 없어? 이게 제일 중요한 거 같은데" → 맨 위에. 사진마다 올린 사람 표시
// - 점심 메뉴 / 가게 대표 메뉴 (구글 지도 그라운딩): 점심 메뉴로 알려진 것만 '점심 메뉴', 아니면 '가게 대표 메뉴'
// - AI 추측 (11/17 상권 "(나)로 해줘"): 구글 지도를 안 보고 쓴 메뉴. 점선 칸 + 'AI 추측 · 구글 지도에서 확인 못 함', 출처 · Google Maps 표시 없음
// - 기다리는 동안 문구가 시간에 따라 바뀜 (11/17 상권 "기다릴 때 문구도 시간에 따라 바뀌게")
// - 기다리는 동안: 메뉴 칸 모양(회색) + 시간에 맞춰 차는 막대 + 주문 팁 한 문장 (11/17 상권 "가 나 둘다도 가능한가?")
//   답이 오면 잠깐(1.2초) 높이를 유지했다가 부드럽게 줄임 → 버튼이 갑자기 올라가 '다른 가게 보기'를 잘못 누르지 않게
// 표시 규칙: 그라운딩 출처는 내용 바로 아래에 제목 + 링크, 'Google Maps' 글자는 바꾸거나 번역하지 않음 (굵기 400 · #5E5E5E · 12px)
import { useEffect, useRef, useState } from "react";
import { fetchMenuHint, fetchPlacePhotos } from "@/lib/api";
import { track } from "@/lib/analytics";
import { LOADING_STEPS, loadingStep, mapsLink, priceRange, splitDish, takeMenuHint, type MenuHint, type PlacePhoto } from "@/lib/menuHint";
import { orderTip, type OrderPhrase } from "@/lib/order";
import { useT } from "./I18n";
import { svg } from "./icons";
import Shokken from "./Shokken";

const ATTRIBUTION_STYLE = { fontFamily: "Roboto, Arial, Helvetica, sans-serif", fontWeight: 400, color: "#5E5E5E", fontSize: 12 } as const;

// 메뉴 칸: 이름은 크게, 일본어 이름 · 가격은 아래 (주문할 때 보여 주기). AI 추측은 점선으로 구분 (가격 없음)
function Dishes({ menus, guess }: { menus: string[]; guess: boolean }) {
  const { t } = useT();
  return (
    <ul className="flex flex-wrap gap-2">
      {menus.map((m) => {
        const dish = splitDish(m);
        return (
          <li
            key={m}
            className={`flex flex-col rounded-xl px-3 py-2 ${guess ? "border border-dashed border-[#B9B6AC] bg-white" : "bg-[#F4F2EC]"}`}
          >
            <span className={`text-[16px] font-semibold leading-tight ${guess ? "text-[#4A4944]" : "text-[#1F1F1C]"}`}>{dish.name}</span>
            {(dish.original || dish.price !== null) && (
              <span className="text-[12px] leading-tight text-[#5F5E58]">
                {dish.original && <span lang="ja">{dish.original}</span>}
                {dish.original && dish.price !== null && " · "}
                {dish.price !== null && (
                  <span className="text-[13px] font-semibold text-[#1F1F1C]">{t("menu.dishPrice", { p: dish.price.toLocaleString("ja-JP") })}</span>
                )}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// 기다리는 동안 메뉴 칸 자리 (회색)
function DishesSkeleton() {
  return (
    <ul className="flex gap-2" aria-hidden="true">
      {[92, 76, 112].map((w) => (
        <li key={w} className="flex h-[52px] animate-pulse flex-col justify-center gap-1.5 rounded-xl bg-[#F4F2EC] px-3" style={{ width: w }}>
          <span className="h-3.5 w-4/5 rounded bg-[#E2DFD6]" />
          <span className="h-2.5 w-3/5 rounded bg-[#E9E6DE]" />
        </li>
      ))}
    </ul>
  );
}

// 시간에 맞춰 차는 막대 (실제 진행이 아님): 5초쯤 70%, 그 뒤로 천천히 95%까지 (서버는 20초까지 물어봄)
function WaitBar() {
  const [go, setGo] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGo(true), 30);
    return () => clearTimeout(id);
  }, []);
  const move = "duration-[20000ms] ease-[cubic-bezier(0.15,0.75,0.3,1)] motion-reduce:transition-none";
  // 11/23: 막대 끝을 식권이가 달려감 (찾으러 뛰는 중)
  return (
    <div className="relative pt-[38px]" aria-hidden="true">
      <div className={`absolute bottom-0.5 transition-[left] ${move}`} style={{ left: `calc(${go ? 95 : 4}% - 22px)` }}>
        <Shokken mood="run" size={36} />
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-[#ECEAE3]">
        <div className={`h-full rounded-full bg-[#2457C5] transition-[width] ${move}`} style={{ width: go ? "95%" : "4%" }} />
      </div>
    </div>
  );
}

// 기다리는 동안 주문 팁 (주문 도우미 문장 + 읽는 법 + 뜻)
function OrderTip({ tip }: { tip: OrderPhrase }) {
  const { t, lang } = useT();
  return (
    <div className="mt-1 rounded-xl bg-[#EEF3FC] px-3 py-2.5">
      <p className="text-[12px] font-semibold text-[#1A3F91]">{t("menu.tipTitle")}</p>
      <p lang="ja" className="text-[15px] font-semibold text-[#1F1F1C]">
        {tip.ja}
      </p>
      <p className="text-[13px] text-[#5F5E58]">
        {lang === "ko" ? tip.say.ko : tip.say.latin} · {t(tip.meaning)}
      </p>
    </div>
  );
}

function GoogleMaps() {
  return (
    <span translate="no" className="notranslate" style={ATTRIBUTION_STYLE}>
      Google Maps
    </span>
  );
}

export default function MenuHintBlock({ shopId, shopName }: { shopId: string; shopName: string }) {
  const { t, lang } = useT();
  const [hint, setHint] = useState<MenuHint | null>(null); // null: 물어보는 중
  const [photos, setPhotos] = useState<PlacePhoto[] | null>(null); // null: 받는 중 (가게 ID가 있을 때만)
  const [waited, setWaited] = useState(0); // 기다린 시간 (문구 단계용, ms)
  const box = useRef<HTMLDivElement>(null);
  const [hold, setHold] = useState<number | null>(null); // 답이 온 직후 유지할 높이 (px)

  useEffect(() => {
    let alive = true;
    setHint(null);
    setPhotos(null);
    setWaited(0);
    setHold(null);
    const steps = LOADING_STEPS.slice(1).map(([at]) => setTimeout(() => alive && setWaited(at), at));
    let release: ReturnType<typeof setTimeout> | undefined;
    const started = performance.now();
    const { hint: answer, prefetched } = takeMenuHint(shopId, lang, fetchMenuHint);
    void answer.then((h) => {
      if (!alive) return;
      setHold(box.current?.offsetHeight ?? null);
      release = setTimeout(() => alive && setHold(null), 1200);
      setHint(h);
      // 대표 메뉴가 보인 비율 · 기다린 시간 (미리 물어봤는지에 따라)
      track("menu_hint", { status: h.status, place: h.place, kind: h.kind, ms: Math.round(performance.now() - started), prefetched });
      if (!h.placeId) return setPhotos([]);
      void fetchPlacePhotos(h.placeId).then((list) => {
        if (!alive) return;
        setPhotos(list);
        track("menu_photos", { count: list.length, ms: Math.round(performance.now() - started) });
      });
    });
    return () => {
      alive = false;
      steps.forEach(clearTimeout);
      clearTimeout(release);
    };
  }, [shopId, lang]);

  // 높이를 잠깐 유지하는 틀 (줄일 때만 부드럽게). 카드가 짧아도 줄어들어 겹치지 않게 flex-none
  const frame = (body: React.ReactNode) => (
    <div
      ref={box}
      style={{ minHeight: hold ?? 0 }}
      className={`flex-none ${hold === null ? "transition-[min-height] duration-300 ease-out motion-reduce:transition-none" : ""}`}
    >
      {body}
    </div>
  );

  if (hint === null) {
    const step = loadingStep(waited);
    return frame(
      <div className="flex flex-col gap-1.5">
        <p className="text-[13px] font-semibold text-[#5F5E58]" aria-live="polite">
          {t(LOADING_STEPS[step][1])}
        </p>
        <DishesSkeleton />
        <WaitBar />
        {lang !== "ja" && <OrderTip tip={orderTip(shopId, step)} />}
      </div>,
    );
  }

  const grounded = hint.sources.length > 0; // 구글 지도에서 찾은 답일 때만 메뉴 · 영업 안내를 보여 줌
  const warning = grounded && hint.place === "closed" ? t("menu.closed") : grounded && hint.place === "no_lunch" ? t("menu.noLunch") : null;
  const placeLink = mapsLink(hint, shopName);
  const link = (
    <a
      href={placeLink}
      target="_blank"
      rel="noreferrer"
      onClick={() => track("menu_link_click", { to: "google_maps" })}
      className="flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#1A3F91]"
    >
      {t("menu.mapsLink")}
      <svg {...svg} width={16} height={16}>
        <path d="M14 4h6v6" />
        <path d="M20 4l-9 9" />
        <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </a>
  );

  // 손님 사진: 받는 중이면 회색 칸, 0장이면 숨김. 메뉴 아래에 '손님이 올린 사진'으로 (메뉴 순서와 상관없다는 게 보이게)
  // 누르면 구글 지도에서 그 사진 (올린 사람의 리뷰에서 무슨 메뉴인지 확인). 사진 링크가 없으면 가게 페이지 (11/17 상권 "가) … 이걸로 해 줘")
  // 6장까지 가로로 넘겨 봄 (11/18 상권 "이게 좋을거 같아"). 칸 너비를 줄 너비의 28%로 해서 어느 휴대폰에서든 4번째 사진이 조금 보이게
  // 누를 때 몇 번째 사진인지 남김 (4~6번째도 누르는지 봄)
  const photoRow =
    photos === null ? (
      <div className="flex gap-2 overflow-hidden" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-square w-[28%] flex-none animate-pulse rounded-xl bg-[#ECEAE3]" />
        ))}
      </div>
    ) : photos.length > 0 ? (
      <div className="mt-1 flex flex-col gap-1">
        <p className="text-[13px] font-semibold text-[#5F5E58]">
          {t("menu.photosTitle")} <span className="font-normal">· {t("menu.photosHint")}</span>
        </p>
        <div className="flex snap-x gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <a
              key={p.url}
              href={p.mapsUri || placeLink}
              target="_blank"
              rel="noreferrer"
              onClick={() => track("menu_link_click", { to: "google_maps_photo", photo: i + 1 })}
              className="aspect-square w-[28%] flex-none snap-start overflow-hidden rounded-xl bg-[#ECEAE3]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 구글 사진 주소를 그대로 씀 (저장 · 가공 안 함) */}
              <img src={p.url} alt={t("menu.photoAlt", { n: i + 1 })} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
        {/* 사진마다 올린 사람 (구글 표시 규칙) */}
        <p className="flex flex-wrap items-center gap-x-1 text-[12px] text-[#5F5E58]">
          {t("menu.photosBy")}
          {photos.map((p, i) => (
            <span key={p.url}>
              {p.authorUri ? (
                <a href={p.authorUri} target="_blank" rel="noreferrer" className="underline">
                  {p.author || "Google user"}
                </a>
              ) : (
                p.author || "Google user"
              )}
              {i < photos.length - 1 ? "," : ""}
            </span>
          ))}
          <span className="ml-1">
            <GoogleMaps />
          </span>
        </p>
      </div>
    ) : null;

  // 구글 지도 가격대 (11/17 상권 "대략적인 가격이라도 가시적으로"): 메뉴가 없어도 지도에서 찾은 가게면 보여 줌
  const price = grounded && hint.price ? hint.price : null;
  const shown = hint.status === "ok" || hint.status === "guess" || price !== null;
  if (!shown && !warning) {
    return frame(
      <div className="flex flex-col gap-1">
        {photoRow}
        <div className="-my-1">{link}</div>
      </div>,
    );
  }

  return frame(
    <div className="flex flex-col gap-1.5" aria-live="polite">
      {warning && <p className="text-sm font-semibold text-[#9A4A00]">{warning}</p>}
      {(hint.status === "ok" || price) && (
        <div className="flex flex-col gap-1.5">
          {hint.status === "ok" && (
            <p className="text-[13px] font-semibold text-[#5F5E58]">
              {t(hint.kind === "lunch" ? "menu.lunchTitle" : "menu.title")}
              {/* 11/18: 점심 메뉴로 못 찾은 대표 메뉴는 위 점심 가격과 상관없을 수 있어서 */}
              {hint.kind !== "lunch" && <span className="font-normal"> · {t("menu.signatureNote")}</span>}
            </p>
          )}
          {/* 11/17 30곳 테스트: 점심 가격대는 27곳 중 3곳만, 대부분 가게 전체 가격대(저녁 포함) → 점심만 크게, 전체는 작게 */}
          {price && (
            <p className={price.kind === "lunch" ? "text-[16px] font-semibold text-[#1F1F1C]" : "text-[13px] text-[#5F5E58]"}>
              {t(price.kind === "lunch" ? "menu.priceLunch" : "menu.priceAll", { range: priceRange(price) })}
            </p>
          )}
          {/* 11/17 상권 "눈에 안 들어와" → 메뉴마다 칸 (가안) */}
          {hint.status === "ok" && <Dishes menus={hint.menus} guess={false} />}
          {/* 출처: 내용 바로 아래 (표시 규칙) */}
          <div className="flex flex-wrap items-center gap-x-2 text-[12px]">
            {hint.sources.map((s) => (
              <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer" className="max-w-full truncate text-[#1A3F91] underline">
                {s.title}
              </a>
            ))}
            <GoogleMaps />
            <span className="text-[#5F5E58]">· {t("menu.aiShort")}</span>
          </div>
        </div>
      )}
      {hint.status === "guess" && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[13px] font-semibold text-[#9A4A00]">
            {t("menu.guess")} <span className="font-normal text-[#5F5E58]">· {t("menu.guessNote")}</span>
          </p>
          <Dishes menus={hint.menus} guess />
        </div>
      )}
      {photoRow}
      {hint.status !== "ok" && link}
    </div>,
  );
}
