-- People who eat the plan. Portions are per person; the meals are shared.
create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  -- Optional. Used to show daily totals against a target, never to block a plan.
  daily_kcal_target integer check (daily_kcal_target > 0),
  -- How many recipe servings this person gets when a plan entry doesn't say otherwise.
  default_servings numeric not null default 1 check (default_servings > 0),
  created_at timestamptz not null default now()
);
create unique index people_name_lower_idx on public.people (lower(name));

-- One row per recipe in a meal slot. A slot can hold several recipes (e.g. a main and a side).
create table public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  meal text not null check (meal in ('breakfast', 'lunch', 'dinner')),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (plan_date, meal, recipe_id)
);
create index meal_plan_entries_date_idx on public.meal_plan_entries(plan_date);
create index meal_plan_entries_recipe_idx on public.meal_plan_entries(recipe_id);

-- How many servings of that recipe each person eats. Absent row = that person skips the meal.
create table public.meal_plan_portions (
  entry_id uuid not null references public.meal_plan_entries(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  servings numeric not null check (servings > 0),
  primary key (entry_id, person_id)
);
create index meal_plan_portions_person_idx on public.meal_plan_portions(person_id);

-- Log of every photo import: what the model extracted vs what the user confirmed.
-- Lets us measure which fields get corrected most and tune the extraction prompt from real data.
create table public.recipe_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'discarded')),
  image_path text not null,
  model text not null,
  usage jsonb,
  extracted jsonb not null,          -- normalised model output: { recipe, confidence, warnings }
  scored jsonb not null,             -- confidence scoring applied to it
  confirmed jsonb,                   -- recipe exactly as saved
  changed_fields text[] not null default '{}',
  ingredient_edits jsonb,            -- { added, removed, edited }
  mode text check (mode in ('create', 'overwrite')),
  recipe_id uuid references public.recipes(id) on delete set null,
  confirmed_at timestamptz
);
create index recipe_imports_status_idx on public.recipe_imports(status, created_at);

-- Only the server (service role) accesses these; no anon/authenticated policies.
alter table public.people enable row level security;
alter table public.meal_plan_entries enable row level security;
alter table public.meal_plan_portions enable row level security;
alter table public.recipe_imports enable row level security;
