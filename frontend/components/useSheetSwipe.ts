"use client";

// 시트 스와이프 (10/22 결정: 손잡이 → 10/29: 시트 넓게). 끌어서 내리면 접고 올리면 펼침, 손잡이를 누르면 지금처럼 바꿈
import { useRef } from "react";
import { SWIPE_MIN_PX, swipeAction } from "@/lib/swipe";

export function useSheetSwipe(collapsed: boolean, setCollapsed: (next: boolean) => void) {
  const startY = useRef<number | null>(null);
  const dragged = useRef(false); // 끌었으면 손을 뗄 때 오는 click은 무시
  return {
    // 끌 수 있는 곳(시트 전체)에 붙임. 끌기가 시작된 뒤에만 손가락을 잡아서 안의 버튼 누르기는 그대로 됨
    area: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        startY.current = e.clientY;
        dragged.current = false;
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (startY.current === null || dragged.current) return;
        if (Math.abs(e.clientY - startY.current) >= SWIPE_MIN_PX) {
          dragged.current = true;
          e.currentTarget.setPointerCapture(e.pointerId); // 손가락이 시트 밖으로 나가도 끝까지 받음
        }
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        if (startY.current === null) return;
        const action = swipeAction(e.clientY - startY.current);
        startY.current = null;
        if (action === "collapse" && !collapsed) setCollapsed(true);
        if (action === "expand" && collapsed) setCollapsed(false);
      },
      onPointerCancel: () => {
        startY.current = null; // 브라우저가 스크롤로 가져감 (목록 · 카드 스크롤)
      },
    },
    // 손잡이 누르기
    onClick: () => {
      if (dragged.current) {
        dragged.current = false;
        return;
      }
      setCollapsed(!collapsed);
    },
  };
}
