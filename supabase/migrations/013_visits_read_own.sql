-- 013: 도감을 Supabase에서 바로 읽기 (10/26 결정: Render 무료 서버가 잠들어 있으면 도감이 최대 1분 늦게 떠서)
-- 익명 로그인한 사람은 자기 기록(user_id = 로그인 토큰의 사용자)만 읽을 수 있음
-- 쓰기와 다른 사람 기록 읽기는 지금처럼 막힘 (기록 저장 · 답은 서버만)
-- 화면 새 버전을 배포하기 전에 Supabase 대시보드 > SQL Editor에서 한 번 실행 (여러 번 실행해도 괜찮음)
drop policy if exists "내 기록 읽기" on public.visits;
create policy "내 기록 읽기" on public.visits
  for select to authenticated
  using (auth.uid() = user_id);
notify pgrst, 'reload schema';
