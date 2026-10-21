-- 008: 가게 소개(핫페퍼 catch) AI 번역 (10/22 결정: 지금 AI 번역으로 보여 주기)
-- 결과 카드를 처음 연 가게 × 휴대폰 언어마다 서버가 Gemini로 한 번 번역해 저장. 원문이 바뀌면(source_hash) 다시 번역
-- 가게가 목록에서 빠지면 같이 지워짐 (약관: 24시간 안 갱신). 화면(anon 키)에서는 읽기 · 쓰기 모두 막음
-- Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)

create table if not exists public.shop_translations (
  id          text primary key,                                              -- 가게 id:언어 (예: J001234567:ko)
  shop_id     text not null references public.shops (id) on delete cascade,
  lang        text not null,
  source_hash text not null,                                                 -- 번역할 때 원문의 SHA-256 앞 16자리
  text        text not null,                                                 -- 번역한 글
  model       text not null,
  created_at  timestamptz not null default now()
);

alter table public.shop_translations enable row level security;
