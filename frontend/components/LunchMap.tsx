"use client";

// 홈 지도: 오픈스트리트맵 위에 가격 핀 · 내 위치 · 반경 원 (10/21 결정: 키 · 결제 없이 쓰는 오픈스트리트맵)
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { priceLabel, type NearbyShop, type Point } from "@/lib/lunch";

type Props = { here: Point; radiusKm: number; shops: NearbyShop[] };

export default function LunchMap({ here, radiusKm, shops }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const pins = useRef<L.LayerGroup | null>(null);
  const me = useRef<L.LayerGroup | null>(null);

  // 지도는 한 번만 만듦
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
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // 위치 · 반경이 바뀔 때만 반경 원 · 내 위치를 그리고 화면을 맞춤 (사용자가 움직인 지도를 함부로 되돌리지 않게)
  useEffect(() => {
    const m = map.current;
    const group = me.current;
    if (!m || !group) return;
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
    m.fitBounds(L.latLng(here.lat, here.lng).toBounds(radiusKm * 2000));
  }, [here, radiusKm]);

  // 보여줄 가게가 바뀌면 가격 핀만 다시 그림
  useEffect(() => {
    const group = pins.current;
    if (!group) return;
    group.clearLayers();
    shops.forEach((s, i) => {
      const pin = document.createElement("span");
      pin.className = "price-pin";
      pin.textContent = priceLabel(s);
      const popup = document.createElement("div");
      popup.textContent = `${s.name} · 걸어서 ${s.walk}분`; // 가게 이름은 바깥 데이터라 글자로만 넣음
      L.marker([s.lat, s.lng], {
        icon: L.divIcon({ className: "price-pin-icon", html: pin, iconSize: [0, 0] }),
        keyboard: false,
        zIndexOffset: (shops.length - i) * 10, // 겹치면 목록 앞쪽(싼 곳 · 가까운 곳)이 위로
      })
        .bindPopup(popup)
        .addTo(group);
    });
  }, [shops]);

  return (
    <div className="absolute inset-0">
      <div ref={box} className="h-full w-full bg-[#ECEAE3]" />
      <button
        type="button"
        aria-label="내 위치로 이동"
        onClick={() => map.current?.fitBounds(L.latLng(here.lat, here.lng).toBounds(radiusKm * 2000))}
        className="absolute bottom-6 right-4 z-[500] flex h-11 w-11 items-center justify-center rounded-full border border-[#CFCCC2] bg-white text-[#1F1F1C]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      </button>
    </div>
  );
}
