-- 005: 앱 문구 번역 (10/21 결정: 처음 보는 휴대폰 언어는 서버가 Gemini로 한 번 번역해 저장)
-- 원문은 화면의 /i18n/ko.json. 원문이 바뀌면 version이 바뀌어 다시 번역함

create table if not exists public.translations (
  id         text primary key,               -- 언어:원문버전 (예: vi:3f2a9c...)
  lang       text not null,                  -- 언어 코드 (vi, ne, zh-Hans ...)
  version    text not null,                  -- 원문 ko.json의 SHA-256 앞 16자리
  messages   text not null,                  -- 번역된 문구 (JSON)
  model      text not null,                  -- 번역한 AI 모델
  created_at timestamptz not null default now()
);

-- 화면(anon 키)에서는 읽기 · 쓰기 모두 막음. 서버가 DB 계정으로 읽고 씀
alter table public.translations enable row level security;
