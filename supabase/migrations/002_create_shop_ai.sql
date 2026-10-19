-- AI가 읽은 가게 정보 (batch/structure_shops.py가 채움). 가게가 지워지면 같이 지워짐
-- Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)

create table if not exists public.shop_ai (
  shop_id              text primary key references public.shops (id) on delete cascade,
  text_hash            text not null,     -- 처리할 때의 shops.text_hash. 달라지면 다시 처리
  model                text not null,
  prompt_version       text not null,
  lunch_days           text,              -- 월~일 7글자 O / X / ? (예: OOOOOXX)
  open_hours           jsonb,             -- 요일별 실제 영업 구간 {"mon": [{"open": "11:30", "close": "14:00", "last_order": "13:30"}], ...}
  lunch_window         jsonb,             -- 요일별 카드에 보여줄 점심 시간 {"mon": {"start": "11:30", "end": "14:00", "last_order": null}, ...}
  lunch_price_min      integer,
  lunch_price_max      integer,
  typical_lunch_price  integer,
  under_990            text check (under_990 in ('yes', 'no', 'unknown')),
  price_evidence       text,              -- 가격 판단의 근거 문구 (원문 그대로)
  evidence_ok          boolean,           -- 근거 문구가 원문에 실제로 있는지
  days_hours_conflict  boolean,           -- 점심 요일과 영업 구간이 서로 안 맞음 → 사람이 볼 대상
  error                text,              -- 실패 이유. 다음 실행 때 다시 시도
  processed_at         timestamptz not null default now()
);

-- 화면(익명 로그인 포함)은 읽기만. 쓰기는 배치(service role 키)만
alter table public.shop_ai enable row level security;

drop policy if exists "shop_ai 읽기" on public.shop_ai;
create policy "shop_ai 읽기" on public.shop_ai
  for select to anon, authenticated
  using (true);

notify pgrst, 'reload schema';
