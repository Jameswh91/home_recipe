create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  servings integer not null default 4 check (servings > 0),
  prep_minutes integer check (prep_minutes >= 0),
  cook_minutes integer check (cook_minutes >= 0),
  instructions text,
  tags text[] not null default '{}',
  source_url text,
  created_at timestamptz not null default now()
);

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  name text not null,
  quantity numeric check (quantity >= 0),
  unit text,
  aisle text,
  notes text
);

create index ingredients_recipe_id_idx on public.ingredients(recipe_id);
create index recipes_tags_idx on public.recipes using gin(tags);

-- Only the server (service role) accesses these; no anon/authenticated policies.
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
