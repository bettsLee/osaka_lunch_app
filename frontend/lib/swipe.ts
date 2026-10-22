// 아래 시트 · 결과 카드 손잡이 스와이프 (10/22 결정: 누르기는 그대로, 끌어서 내리고 올리기)
export const SWIPE_MIN_PX = 30; // 이보다 짧게 움직이면 누른 것으로 봄

// 손가락이 움직인 세로 거리(아래로 +)로 할 일: 내리면 접기, 올리면 펼치기, 짧으면 null(누른 것)
export function swipeAction(dy: number): "collapse" | "expand" | null {
  if (dy >= SWIPE_MIN_PX) return "collapse";
  if (dy <= -SWIPE_MIN_PX) return "expand";
  return null;
}
