-- 알림 예약(014_push_cron.sql)이 잘 도는지 보기 (OL-57)

-- 1) 지금 바로 한 번 불러 보기 (예약 시간 밖에서 확인할 때). 1~2분 뒤 3)번으로 결과 확인
do $$ begin execute (select command from cron.job where jobname = 'push-feedback'); end $$;

-- 2) 예약 상태와 최근 실행 (succeeded = 요청을 보내는 데까지 성공)
select jobname, schedule, active from cron.job where jobname = 'push-feedback';
select start_time, status, return_message
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'push-feedback')
order by start_time desc
limit 5;

-- 3) 서버 답 (6시간 동안 남음)
-- status_code 200 + {"due":..,"sent":..} 면 정상 · 403 이면 Vault 값이 Render 값과 다름 · 비어 있고 error_msg 가 있으면 시간 초과
select created, status_code, content, error_msg
from net._http_response
order by created desc
limit 5;
