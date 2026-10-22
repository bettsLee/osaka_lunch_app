-- '또 갈래요' (10/22 결정: 다녀온 곳과 좋았던 곳을 구분). 질문 카드에서 켜거나 도감에서 가게마다 켜고 끔
-- null: 답하지 않음 · true: 또 갈래요 · false: 도감에서 껐음
alter table public.visits add column if not exists again boolean;
