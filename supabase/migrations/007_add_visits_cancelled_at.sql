-- 007: '여기 갈래요' 취소 (10/22 결정: 취소를 따로 기록)
-- 정했다가 취소하거나 다른 가게로 다시 정하면 그 시각을 남김. 취소한 기록은 알림 · 질문 카드에서 빠짐
-- Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)

alter table public.visits add column if not exists cancelled_at timestamptz;
