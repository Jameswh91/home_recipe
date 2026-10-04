-- Meal type(s): a recipe can be several (e.g. pancakes = breakfast + dessert)
alter table public.recipes
  add column meal_types text[] not null default '{}'
    check (meal_types <@ array['breakfast','lunch','dinner','dessert','snack','side']::text[]);

-- null = not yet set
alter table public.recipes
  add column difficulty text
    check (difficulty in ('easy','medium','hard'));

-- Flags placeholder data so it can be wiped once real recipes are loaded.
-- Every row that exists right now is seed data; new rows default to false.
alter table public.recipes
  add column is_seed boolean not null default false;
update public.recipes set is_seed = true;

create index recipes_meal_types_idx on public.recipes using gin(meal_types);
