-- 009: 도착했어요 (10/22 결정: '도착했어요' 버튼 + 앱을 열 때 가게 근처면 자동)
-- 도착하면 다녀온 것(visited)으로 보고 도감에 바로 넣음. 그 자리에서 영업 여부를 답하면 open_ok도 같이
-- 위치(좌표)는 휴대폰 안에서만 비교하고 서버에는 보내지 않음. 자동인지 직접 눌렀는지만 남겨 GPS 판단이 맞는지 잼
-- Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)

alter table public.visits add column if not exists arrived_at timestamptz;
alter table public.visits add column if not exists arrived_by text check (arrived_by in ('auto', 'manual'));
