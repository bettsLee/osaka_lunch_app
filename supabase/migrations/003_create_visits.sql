-- '여기 갈래요' 기록과 '다녀왔어요?' 답 (Spring Boot 서버가 씀)
-- Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)

create table if not exists public.visits (
  id           uuid primary key,                  -- 화면이 만든 id. 저장을 다시 보내도 한 번만 남음
  user_id      uuid not null,                     -- Supabase 익명 로그인 사용자 id (토큰의 sub)
  shop_id      text not null,                     -- 핫페퍼 가게 id. 가게가 목록에서 빠져도 기록은 남기려고 외래 키 없음
  shop_name    text not null,
  source       text not null check (source in ('roulette', 'list')),
  distance_km  double precision,
  price_limit  integer not null,                  -- 그때 설정한 가격 상한 (지금은 990)
  chosen_at    timestamptz not null,              -- '여기 갈래요'를 누른 시각
  visited      boolean,                           -- 다녀왔는지 (null = 아직 답 없음)
  open_ok      boolean,                           -- 그 시간에 영업하고 있었는지
  price_ok     boolean,                           -- 점심 가격이 상한 이하였는지
  answered_at  timestamptz                        -- 답한 시각
);

create index if not exists visits_unanswered_idx on public.visits (user_id, chosen_at desc) where answered_at is null;

-- 정책을 만들지 않음 = 화면(anon · 로그인 사용자 키)에서는 읽기 · 쓰기 모두 불가. 서버(DB 직접 연결)만 씀
alter table public.visits enable row level security;

notify pgrst, 'reload schema';
