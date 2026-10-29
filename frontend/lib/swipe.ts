// 아래 시트 · 결과 카드 손잡이 스와이프 (10/22 결정: 누르기는 그대로, 끌어서 내리고 올리기)
export const SWIPE_MIN_PX = 30; // 이보다 짧게 움직이면 누른 것으로 봄

// 손가락이 움직인 세로 거리(아래로 +)로 할 일: 내리면 접기, 올리면 펼치기, 짧으면 null(누른 것)
export function swipeAction(dy: number): "collapse" | "expand" | null {
  if (dy >= SWIPE_MIN_PX) return "collapse";
  if (dy <= -SWIPE_MIN_PX) return "expand";
  return null;
}

// 결과 카드에서 브라우저가 맡을 손가락 움직임 (10/29: 손잡이만 → 카드 전체에서 끌기)
// 접혀 있으면 모두 끌기(none) · 펼쳐서 맨 위면 손가락을 위로 밀기만 스크롤, 아래로 끌기는 접기(pan-down) · 내려 본 상태면 스크롤만(auto)
// pan-down = 아래쪽 내용으로 스크롤하는 손가락(위로 밀기)만 브라우저가 맡음. 모르는 브라우저(아이폰 사파리)는 auto로 보고 지금처럼 손잡이로만 접음
export function cardTouchAction(collapsed: boolean, atTop: boolean): "none" | "pan-down" | "auto" {
  if (collapsed) return "none";
  return atTop ? "pan-down" : "auto";
}
