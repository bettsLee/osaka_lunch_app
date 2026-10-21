-- 004: '다녀왔어요?' 알림 (웹 푸시)
-- push_subscriptions: 휴대폰 브라우저가 알림을 허용하면 받는 주소와 암호화 키. 서버만 읽고 씀
-- visits.notified_at: 알림을 보낸 시각. 한 번만 보내려고 씀

create table if not exists public.push_subscriptions (
  id         uuid primary key,
  user_id    uuid not null,                 -- Supabase 익명 로그인 사용자
  endpoint   text not null unique,          -- 푸시 서비스 주소 (브라우저마다 하나)
  p256dh     text not null,                 -- 브라우저 공개 키 (내용 암호화용)
  auth       text not null,                 -- 브라우저 비밀 값 (내용 암호화용)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- 화면(anon 키)에서는 읽기 · 쓰기 모두 막음. 정책이 없으면 아무도 못 씀 (서버는 DB 계정으로 직접 접속)
alter table public.push_subscriptions enable row level security;

alter table public.visits add column if not exists notified_at timestamptz;
