-- 012: 리크루트 답장 반영 (10/22 답장, 10/24 결정)
-- ① 가게 소개 AI 번역을 끔 (약관: 핫페퍼 정보의 번안 · 가공 금지) → 저장해 둔 번역을 지움
-- ② 캐시는 24시간 안에 갱신 → 도감 가게 이름은 그날 가게 목록에서 가져오고,
--    visits에 저장한 가게 이름은 24시간이 지나면 수집 배치(collect.py)가 비움. 이미 지난 기록은 여기서 한 번 비움
-- 서버(Render)에 새 버전이 배포된 뒤 Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)
drop table if exists public.shop_translations;
alter table public.visits alter column shop_name drop not null;
update public.visits set shop_name = null where shop_name is not null and chosen_at < now() - interval '24 hours';
notify pgrst, 'reload schema';
