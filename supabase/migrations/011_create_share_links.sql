-- 011: 맛집 추천 짧은 링크 (10/22 결정: 링크가 너무 길어서 /r/k7Qx2 같은 짧은 코드)
-- 코드 → 가게 번호만 저장. 받는 사람에게는 가게 번호만 돌려주고, 보낸 사람(user_id)은 하루 개수 제한에만 씀
-- 화면(anon 키)에서는 읽기 · 쓰기 모두 막음 (서버만 씀)

create table if not exists public.share_links (
  code       text primary key,              -- 짧은 코드 (영문 대소문자 · 숫자 6자)
  user_id    uuid not null,                 -- 만든 사람 (Supabase 익명 로그인 사용자, 하루 개수 제한용)
  shop_ids   text not null,                 -- 추천한 가게 번호 (쉼표로 이음, 최대 10곳)
  created_at timestamptz not null default now()
);

create index if not exists share_links_user_created_idx on public.share_links (user_id, created_at);

alter table public.share_links enable row level security;
