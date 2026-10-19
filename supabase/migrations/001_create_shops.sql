-- 핫페퍼에서 받은 점심 가게 (batch/collect.py가 매일 갱신하고, 이번에 안 보인 가게는 지움)
-- Supabase 대시보드 > SQL Editor에서 한 번 실행

create table if not exists public.shops (
  id                text primary key,          -- 핫페퍼 가게 id
  name              text not null,
  address           text,
  lat               double precision,
  lng               double precision,
  genre_name        text,
  genre_catch       text,
  catch             text,
  budget_name       text,
  budget_average    text,
  budget_memo       text,
  open_text         text,                      -- 영업시간 원문 (AI가 요일별 시간표로 바꿀 글)
  close_text        text,                      -- 정기휴일 원문
  shop_detail_memo  text,
  other_memo        text,
  photo_url         text,
  hotpepper_url     text,
  middle_area_code  text,
  text_hash         text not null,             -- AI가 읽을 글의 해시. 바뀐 가게만 AI를 다시 돌림
  fetched_at        timestamptz not null       -- 마지막으로 받은 시각 (24시간 안에 갱신)
);

create index if not exists shops_fetched_at_idx on public.shops (fetched_at);

-- 화면(익명 로그인 포함)은 읽기만. 쓰기는 배치(service role 키)만
alter table public.shops enable row level security;

create policy "shops 읽기" on public.shops
  for select to anon, authenticated
  using (true);
