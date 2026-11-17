-- 점심 시간에 서버(Render 무료)가 잠들지 않게 10분마다 깨우기 (11/17, OL-71)
-- Render 무료 서버는 15분 동안 요청이 없으면 잠들고 깨는 데 1분쯤 걸림 → 대표 메뉴는 화면이 25초까지만 기다려서 실패하고 구글맵 링크만 보임
-- 알림 예약(014)은 12:00부터 15분마다라 점심을 고르는 11시대가 비어 있었음
-- 시간: UTC 01:00~08:50 = 일본 · 한국 10:00~17:50 (pg_cron 시간은 UTC). 하루 8시간이라 Render 무료(월 750시간) 안
-- 다시 실행해도 됨: 같은 이름의 예약은 새 내용으로 바뀜

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'keep-api-awake',
  '*/10 1-8 * * *',
  $$ select net.http_get(url := 'https://osaka-lunch-api.onrender.com/health', timeout_milliseconds := 90000); $$
);
-- 확인: select status, return_message, start_time from cron.job_run_details
--       where jobid = (select jobid from cron.job where jobname = 'keep-api-awake') order by start_time desc limit 5;
