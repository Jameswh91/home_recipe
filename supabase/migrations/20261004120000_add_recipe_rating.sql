-- 1-5 star rating, null = not yet rated
alter table public.recipes
  add column rating smallint check (rating between 1 and 5);
