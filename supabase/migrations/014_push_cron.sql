-- '다녀왔어요?' 알림 서버를 Supabase 예약(pg_cron)으로 15분마다 부르기 (OL-57)
-- GitHub Actions 예약은 실제로 하루 2번쯤만 돌아서(10/22~28 기록) 점심 뒤 알림 시간을 놓침. GitHub 쪽은 예비로 남김
-- 시간: UTC 03:00~08:45 = 일본 · 한국 12:00~17:45 (pg_cron 시간은 UTC)
-- 먼저 할 일: Vault에 이름 push_cron_secret 으로 Render의 PUSH_CRON_SECRET 값을 넣기 (값은 이 파일 · 저장소에 적지 않음)
-- 다시 실행해도 됨: 같은 이름의 예약은 새 내용으로 바뀜

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'push-feedback',
  '*/15 3-8 * * *',
  $$
  select net.http_post(
    url := 'https://osaka-lunch-api.onrender.com/internal/push/send-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret')
    ),
    timeout_milliseconds := 90000
  );
  $$
);
-- timeout 90초: 서버(Render 무료)가 자고 있으면 깨는 데 1분쯤 걸림. 기본값 2초면 깨기 전에 끊김
