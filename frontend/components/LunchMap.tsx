"use client";

// 홈 지도: 오픈스트리트맵 위에 가격 핀 · 내 위치 · 반경 원 (10/21 결정: 키 · 결제 없이 쓰는 오픈스트리트맵)
// 룰렛 중에는 깜빡이는 핀(flashId)을, 결과에서는 고른 핀(pickedId)을 강조하고 그 가게와 내 위치가 보이게 맞춤
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { priceLabel, type NearbyShop, type Point } from "@/lib/lunch";
import { useT } from "./I18n";

type Props = {
  here: Point;
  radiusKm: number;
  shops: NearbyShop[];
  flashId?: string | null;
  pickedId?: string | null;
  showLocate?: boolean; // '내 위치로' 버튼
  visitedIds?: ReadonlySet<string>; // 도감: 다녀온 가게는 ✓ 핀, 나머지는 점선 핀. 다녀온 곳이 다 보이게 맞춤 (고르면 그 가게로)
  onPick?: (shopId: string) => void; // 핀을 누르면 그 가게 결과 카드 (10/22 도그푸딩). 없으면 이름 말풍선 (도감)
  goingId?: string | null; // 여기 갈래요로 정한 가게: 파란 핀으로 크게, 다른 핀 위로
};

const TOP_Z = 100000; // 강조한 핀은 다른 핀 위로

export default function LunchMap({ here, radiusKm, shops, flashId = null, pickedId = null, showLocate = true, visitedIds, onPick, goingId = null }: Props) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.LayerGroup | null>(null);
  const markers = useRef(new Map<string, { marker: L.Marker; z: number }>());
  const pick = useRef(onPick); // 핀을 다시 그리지 않고 늘 최신 함수를 부르게
  pick.current = onPick;
  const pickable = onPick !== undefined;
  const fit = useRef<() => void>(() => {}); // 지금 기준으로 보이는 범위 맞추기 (숨겨졌다 다시 보일 때도 씀)

  // 지도는 한 번만 만듦. 지도 칸 크기가 바뀌면(결과 화면 등) 다시 잼
  useEffect(() => {
    if (!box.current) return;
    const m = L.map(box.current, { zoomControl: false, zoomSnap: 0.25 }); // 반경 원이 화면에 꽉 차게
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    pins.current = L.layerGroup().addTo(m);
    me.current = L.layerGroup().addTo(m);
    map.current = m;
    // 여기 갈래요 뒤 화면에서는 지도가 숨겨졌다가 홈에서 다시 보임 → 크기가 0이었다가 돌아오면 범위를 다시 맞춤
    let hidden = false;
    const resize = new ResizeObserver(([entry]) => {
      m.invalidateSize();
      const zero = entry.contentRect.width === 0 || entry.contentRect.height === 0;
      if (hidden && !zero) fit.current();
      hidden = zero;
    });
    resize.observe(box.current);
    return () => {
      resize.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  // 위치 · 반경이 바뀔 때만 반경 원 · 내 위치를 다시 그림
  useEffect(() => {
    const group = me.current;
    if (!group) return;
    group.clearLayers();
    L.circle([here.lat, here.lng], {
      radius: radiusKm * 1000,
      color: "#2457C5",
      weight: 1,
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(group);
    L.circleMarker([here.lat, here.lng], {
      radius: 8,
      color: "#FFFFFF",
      weight: 3,
      fillColor: "#2457C5",
      fillOpacity: 1,
      interactive: false,
    }).addTo(group);
  }, [here, radiusKm]);

  // 보이는 범위: 결과가 있으면 그 가게와 내 위치, 아니면 반경 전체 (사용자가 움직인 지도를 함부로 되돌리지 않게 이때만)
  const picked = shops.find((s) => s.id === pickedId) ?? null;
  const pickedLat = picked?.lat;
  const pickedLng = picked?.lng;
  // 다른 가게를 볼 때 정한 가게도 화면 안에 (10/22 도그푸딩: 다른 핀을 누르면 정한 핀이 안 보였음)
  const goingShop = goingId !== null && goingId !== pickedId ? (shops.find((s) => s.id === goingId) ?? null) : null;
  const goingSpot = goingShop ? `${goingShop.lat},${goingShop.lng}` : "";
  const visitedSpots = visitedIds ? shops.filter((s) => visitedIds.has(s.id)).map((s) => `${s.lat},${s.lng}`).join(";") : "";
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    fit.current = () => {
      m.invalidateSize();
      if (pickedLat !== undefined && pickedLng !== undefined) {
        if (visitedSpots) {
          m.setView([pickedLat, pickedLng], Math.max(m.getZoom(), 15)); // 도감: 고른 가게로 옮김 (다른 다녀온 곳은 그대로 보이게 확대는 조금만)
          return;
        }
        const points: [number, number][] = [[here.lat, here.lng], [pickedLat, pickedLng]];
        if (goingSpot) points.push(goingSpot.split(",").map(Number) as [number, number]);
        m.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 17 });
      } else if (visitedSpots) {
        const points = visitedSpots.split(";").map((p) => p.split(",").map(Number) as [number, number]);
        m.fitBounds(L.latLngBounds([[here.lat, here.lng], ...points]), { padding: [40, 40], maxZoom: 16 });
      } else {
        m.fitBounds(L.latLng(here.lat, here.lng).toBounds(radiusKm * 2000));
      }
    };
    fit.current();
  }, [here, radiusKm, pickedLat, pickedLng, visitedSpots, goingSpot]);

  // 보여줄 가게가 바뀌면 가격 핀을 다시 그림
  useEffect(() => {
    const group = pins.current;
    if (!group) return;
    group.clearLayers();
    markers.current.clear();
    shops.forEach((s, i) => {
      const pin = document.createElement("span");
      pin.className = visitedIds ? `price-pin ${visitedIds.has(s.id) ? "is-visited" : "is-unvisited"}` : "price-pin";
      pin.textContent = priceLabel(s, t);
      const z = (shops.length - i) * 10; // 겹치면 목록 앞쪽(싼 곳 · 가까운 곳)이 위로
      const marker = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: "price-pin-icon", html: pin, iconSize: [0, 0] }),
        keyboard: false,
        zIndexOffset: z,
      }).addTo(group);
      if (pickable) {
        marker.on("click", () => pick.current?.(s.id));
      } else {
        const popup = document.createElement("div");
        popup.textContent = `${s.name} · ${t("common.walk", { n: s.walk })}`; // 가게 이름은 바깥 데이터라 글자로만 넣음
        marker.bindPopup(popup);
      }
      markers.current.set(s.id, { marker, z });
    });
  }, [shops, t, visitedIds, pickable]);

  // 룰렛 깜빡임 · 결과 강조 · 정한 가게
  useEffect(() => {
    box.current?.classList.toggle("is-choosing", flashId !== null || pickedId !== null);
    markers.current.forEach(({ marker, z }, id) => {
      const el = marker.getElement()?.querySelector(".price-pin");
      el?.classList.toggle("is-flash", id === flashId && pickedId === null);
      el?.classList.toggle("is-picked", id === pickedId);
      // 정한 가게는 다른 가게를 보거나 룰렛을 돌릴 때도 표시 (10/22 도그푸딩: 다른 핀을 누르면 파란 핀이 사라졌음)
      const going = id === goingId && id !== pickedId;
      el?.classList.toggle("is-going", going);
      const top = id === pickedId || (id === flashId && pickedId === null);
      marker.setZIndexOffset(top ? TOP_Z : going ? TOP_Z - 1 : z);
    });
  }, [flashId, pickedId, shops, goingId]);

  return (
    // isolate: 지도 안의 z-index(출처 표시 1000 등)가 밖으로 새어 주문 문장 · 질문 시트 위에 뜨지 않게
    <div className="absolute inset-0 isolate">
      <div ref={box} className="h-full w-full bg-[#ECEAE3]" />
      {showLocate && pickedId === null && flashId === null && (
        <button
          type="button"
          aria-label={t("map.locate")}
          onClick={() => map.current?.fitBounds(L.latLng(here.lat, here.lng).toBounds(radiusKm * 2000))}
          className="absolute bottom-6 right-4 z-[500] flex h-11 w-11 items-center justify-center rounded-full border border-[#CFCCC2] bg-white text-[#1F1F1C]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
          </svg>
        </button>
      )}
    </div>
  );
}
