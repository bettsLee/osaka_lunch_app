-- 006: 의견 보내기 (10/21 결정: 앱 안 입력칸). 설정 화면(S8)에서 쓴 의견을 서버가 저장
-- 읽는 사람은 상권 (Supabase 표 화면). 화면(anon 키)에서는 읽기 · 쓰기 모두 막음

create table if not exists public.opinions (
  id         uuid primary key,
  user_id    uuid not null,                 -- Supabase 익명 로그인 사용자 (같은 사람이 보낸 것끼리 묶어 보기)
  message    text not null,                 -- 쓴 의견 (1~1,000자)
  lang       text,                          -- 화면 언어 (어느 언어로 썼는지)
  created_at timestamptz not null default now()
);

create index if not exists opinions_user_created_idx on public.opinions (user_id, created_at);

alter table public.opinions enable row level security;
