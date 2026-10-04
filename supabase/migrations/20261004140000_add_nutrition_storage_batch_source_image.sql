-- Per-serving nutrition. null = unknown (not every cookbook page prints every macro).
alter table public.recipes
  add column kcal_per_serving integer check (kcal_per_serving >= 0),
  add column carbs_g numeric check (carbs_g >= 0),
  add column protein_g numeric check (protein_g >= 0),
  add column fat_g numeric check (fat_g >= 0);

-- Storage + batch-cooking info.
alter table public.recipes
  add column freezable boolean not null default false,
  add column freezer_months smallint check (freezer_months > 0),
  add column fridge_days smallint check (fridge_days > 0),
  add column reheating text,
  add column is_base_recipe boolean not null default false,
  add column is_multi_serve boolean not null default false,
  add constraint recipes_freezer_months_needs_freezable
    check (freezer_months is null or freezable);

-- Path of the original photo in the private `recipe-images` bucket.
alter table public.recipes
  add column source_image_path text;

create index recipes_freezable_idx on public.recipes(freezable) where freezable;
create index recipes_base_recipe_idx on public.recipes(is_base_recipe) where is_base_recipe;

-- Private bucket for imported recipe photos. RLS on storage.objects has no policies for it,
-- so only the service role (the web app server) can read or write.
insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;
