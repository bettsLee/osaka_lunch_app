-- 대표 메뉴 · 손님 사진의 하루 사용량 (11/24, OL-93)
-- 지금까지는 서버 메모리로만 세서, Render 무료 서버가 쉬었다 다시 켜지면(저녁 · 배포) 그날 쓴 수가 0으로 돌아가 하루 한도가 새어 나감
-- 서버가 이 표에 세면 다시 켜져도 이어서 셈. 줄은 하루에 종류마다 하나 (오사카 날짜)
-- 화면(anon 키)에서는 읽기 · 쓰기 모두 막음 (서버만 씀. 숫자를 0으로 되돌리지 못하게)
-- 다시 실행해도 됨

create table if not exists public.daily_usage (
  day  date not null,               -- 오사카 날짜
  kind text not null,               -- menu_hint (대표 메뉴 물은 횟수) · place_photos (사진 장 수)
  used integer not null default 0,
  primary key (day, kind)
);

alter table public.daily_usage enable row level security;
