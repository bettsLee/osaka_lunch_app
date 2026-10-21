-- 베타 숫자 (11/9~15 지인 베타, 출시 뒤 기준선에도 그대로 씀)
-- Supabase 대시보드 > SQL Editor에 붙이고, 볼 쿼리 하나를 드래그해서 선택한 뒤 Run (한 번에 하나씩)
--
-- 쿼리마다 맨 위 두 줄만 고치면 돼요
--   params   : 기간 (오사카 시간). 끝 날짜는 그 날 0시 = 그 전날까지
--   excluded : 뺄 사용자 = 상권 휴대폰 · 맥의 익명 ID. 앱을 연 탭의 콘솔에서
--              JSON.parse(localStorage.getItem("osaka-lunch-auth")).user.id  로 확인
-- TEST 가게(콘솔로 만든 테스트 기록)는 항상 뺌
-- 읽기만 해요 (아무것도 바꾸지 않음)


-- 1. 한 표로 보기 -----------------------------------------------------------------------------------------
with params as (select timestamptz '2026-11-09 00:00+09' as start_at, timestamptz '2026-11-16 00:00+09' as end_at),
excluded(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
v as (
  select visits.* from visits, params
  where chosen_at >= params.start_at and chosen_at < params.end_at
    and shop_id <> 'TEST' and user_id not in (select user_id from excluded)
),
m(k, metric, n, d) as (
  select 1, '여기 갈래요 (건)', count(*), null::bigint from v
  union all select 2, '여기 갈래요를 누른 사람', count(distinct user_id), null from v
  union all select 3, '룰렛으로 고른 비율 (나머지는 목록)', count(*) filter (where source = 'roulette'), count(*) from v
  union all select 4, '다녀왔어요?에 답한 비율 (고른 지 1시간 지난 것)',
    count(*) filter (where answered_at is not null and chosen_at < now() - interval '1 hour'),
    count(*) filter (where chosen_at < now() - interval '1 hour') from v
  union all select 5, '실제로 다녀온 비율 (답한 것 중)', count(*) filter (where visited), count(*) filter (where visited is not null) from v
  union all select 6, '영업 맞음 (다녀온 것 중)', count(*) filter (where open_ok), count(*) filter (where open_ok is not null) from v
  union all select 7, '가격 맞음 (다녀온 것 중)', count(*) filter (where price_ok), count(*) filter (where price_ok is not null) from v
  union all select 8, '알림을 받고 답한 비율', count(*) filter (where notified_at is not null and answered_at is not null),
    count(*) filter (where notified_at is not null) from v
  union all select 9, '알림 없이 답한 비율 (앱을 다시 열어서)',
    count(*) filter (where notified_at is null and answered_at is not null and chosen_at < now() - interval '1 hour'),
    count(*) filter (where notified_at is null and chosen_at < now() - interval '1 hour') from v
  union all select 10, '이틀 이상 여기 갈래요를 누른 사람 (재방문)', count(*) filter (where days >= 2), count(*)
    from (select user_id, count(distinct (chosen_at at time zone 'Asia/Tokyo')::date) as days from v group by user_id) u
)
select metric as "지표", n as "분자", d as "분모",
       case when d > 0 then round(100.0 * n / d, 1) end as "%"
from m order by k;


-- 2. 날짜별 ----------------------------------------------------------------------------------------------
with params as (select timestamptz '2026-11-09 00:00+09' as start_at, timestamptz '2026-11-16 00:00+09' as end_at),
excluded(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
v as (
  select visits.* from visits, params
  where chosen_at >= params.start_at and chosen_at < params.end_at
    and shop_id <> 'TEST' and user_id not in (select user_id from excluded)
)
select (chosen_at at time zone 'Asia/Tokyo')::date as "날짜",
       count(*) as "여기 갈래요", count(distinct user_id) as "사람",
       count(*) filter (where answered_at is not null) as "답함",
       count(*) filter (where visited) as "다녀옴",
       count(*) filter (where open_ok = false or price_ok = false) as "틀렸다는 답"
from v group by 1 order by 1;


-- 3. 가격 정확도: '가격 확인' 배지 vs 'AI 판단' 배지 (가격 상한별) ---------------------------------------
-- 배지는 화면과 같은 규칙 (점심 최고가가 상한 이하면 '가격 확인'). shop_ai는 매일 새로 쓰여서 '지금' 값 기준이에요
with params as (select timestamptz '2026-11-09 00:00+09' as start_at, timestamptz '2026-11-16 00:00+09' as end_at),
excluded(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
v as (
  select visits.* from visits, params
  where chosen_at >= params.start_at and chosen_at < params.end_at
    and shop_id <> 'TEST' and user_id not in (select user_id from excluded)
)
select case when a.shop_id is null then '가게 정보 없음 (목록에서 빠짐)'
            when a.lunch_price_max is not null and a.lunch_price_max <= v.price_limit then '가격 확인' else 'AI 판단' end as "배지",
       v.price_limit as "가격 상한",
       count(*) filter (where v.price_ok) as "맞음",
       count(*) filter (where v.price_ok is not null) as "답",
       round(100.0 * count(*) filter (where v.price_ok) / nullif(count(*) filter (where v.price_ok is not null), 0), 1) as "%"
from v left join shop_ai a on a.shop_id = v.shop_id
group by 1, 2 order by 1, 2;


-- 4. 틀렸다고 답한 가게 (AI가 왜 틀렸는지 볼 목록) --------------------------------------------------------
with params as (select timestamptz '2026-11-09 00:00+09' as start_at, timestamptz '2026-11-16 00:00+09' as end_at),
excluded(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
v as (
  select visits.* from visits, params
  where chosen_at >= params.start_at and chosen_at < params.end_at
    and shop_id <> 'TEST' and user_id not in (select user_id from excluded)
)
select v.shop_name as "가게", v.shop_id,
       to_char(v.chosen_at at time zone 'Asia/Tokyo', 'MM-DD Dy HH24:MI') as "고른 때",
       v.open_ok as "영업 맞음", v.price_ok as "가격 맞음", v.price_limit as "상한",
       a.lunch_days as "점심 요일",
       a.lunch_window -> lower(to_char(v.chosen_at at time zone 'Asia/Tokyo', 'Dy')) as "그날 카드 점심 시간",
       a.typical_lunch_price as "대표 메뉴", a.lunch_price_max as "점심 최고가", a.price_evidence as "가격 근거"
from v left join shop_ai a on a.shop_id = v.shop_id
where v.open_ok = false or v.price_ok = false
order by v.chosen_at;


-- 5. 받은 의견 --------------------------------------------------------------------------------------------
with params as (select timestamptz '2026-11-09 00:00+09' as start_at, timestamptz '2026-11-16 00:00+09' as end_at),
excluded(user_id) as (values ('00000000-0000-0000-0000-000000000000'::uuid))
select to_char(o.created_at at time zone 'Asia/Tokyo', 'MM-DD HH24:MI') as "보낸 때", o.lang as "언어", o.message as "의견"
from opinions o, params
where o.created_at >= params.start_at and o.created_at < params.end_at
  and o.user_id not in (select user_id from excluded)
order by o.created_at;
