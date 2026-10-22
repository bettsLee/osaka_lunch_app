"use client";

// 손잡이에 붙이는 스와이프 (10/22 결정): 끌어서 내리면 접고 올리면 펼침, 그냥 누르면 지금처럼 바꿈
import { useRef } from "react";
import { SWIPE_MIN_PX, swipeAction } from "@/lib/swipe";

export function useSheetSwipe(collapsed: boolean, setCollapsed: (next: boolean) => void) {
  const startY = useRef<number | null>(null);
  const dragged = useRef(false); // 끌었으면 손을 뗄 때 오는 click은 무시
  return {
    style: { touchAction: "none" as const }, // 손잡이 위에서는 화면 스크롤 대신 끌기
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      startY.current = e.clientY;
      dragged.current = false;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (startY.current !== null && Math.abs(e.clientY - startY.current) >= SWIPE_MIN_PX) dragged.current = true;
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (startY.current === null) return;
      const action = swipeAction(e.clientY - startY.current);
      startY.current = null;
      if (action === "collapse" && !collapsed) setCollapsed(true);
      if (action === "expand" && collapsed) setCollapsed(false);
    },
    onPointerCancel: () => {
      startY.current = null;
    },
    onClick: () => {
      if (dragged.current) {
        dragged.current = false;
        return;
      }
      setCollapsed(!collapsed);
    },
  };
}
