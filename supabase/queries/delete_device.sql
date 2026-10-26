-- 이 기기 기록 지우기 (개인정보 안내: 의견 보내기로 '기록을 지워 주세요'를 받았을 때. 10/26 체크인 결정)
-- Supabase 대시보드 > SQL Editor에서 상권이 실행. 지우면 되돌릴 수 없어요
--   1번으로 지울 기기의 user_id를 찾고 → 2번 맨 위 user_id를 바꿔서 실행 (한 기기씩)
-- 익명 로그인 계정(auth.users)은 그대로 둠: 지우면 그 휴대폰 앱이 로그인 오류가 나서. 기록만 지우면 이름 · 연락처 없는 빈 익명 ID만 남음
-- Amplitude 사용 기록은 이 SQL로 지워지지 않음 (Amplitude 쪽에서 같은 익명 ID로 따로)


-- 1. 지울 기기 찾기: '지워 주세요' 의견을 보낸 기기 (기기 번호를 받았으면 아래 줄 대신 left(o.user_id::text, 8) = '기기 번호')
select o.user_id, left(o.user_id::text, 8) as "기기 번호",
       to_char(o.created_at at time zone 'Asia/Tokyo', 'MM-DD HH24:MI') as "보낸 때", o.message as "의견",
       (select count(*) from visits v where v.user_id = o.user_id) as "여기 갈래요"
from opinions o
where o.message like '%지워%' or o.message ilike '%delete%'
order by o.created_at desc;


-- 2. 지우기: 아래 user_id를 1번 결과로 바꿔서 실행. 지운 줄 수가 나옴 (한 문장이라 중간에 실패하면 하나도 안 지워짐)
with target(id) as (values ('00000000-0000-0000-0000-000000000000'::uuid)),
v as (delete from visits where user_id = (select id from target) returning 1),
o as (delete from opinions where user_id = (select id from target) returning 1),
p as (delete from push_subscriptions where user_id = (select id from target) returning 1),
s as (delete from share_links where user_id = (select id from target) returning 1)
select (select count(*) from v) as "여기 갈래요", (select count(*) from o) as "의견",
       (select count(*) from p) as "알림 구독", (select count(*) from s) as "추천 링크";
