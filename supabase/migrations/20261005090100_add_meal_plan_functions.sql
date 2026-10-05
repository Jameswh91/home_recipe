-- Functions for meal planning. Split from the tables migration because the Supabase MCP
-- apply_migration/execute_sql tools hang on CREATE FUNCTION; apply this file in the Supabase
-- dashboard SQL editor (or with `supabase db push`).

-- Atomically replaces the plan inside [p_from, p_to] (optionally just one meal) with p_entries:
--   [{ "plan_date": "2026-10-05", "meal": "dinner", "recipe_id": "<uuid>", "notes": null,
--      "portions": [{ "person_id": "<uuid>", "servings": 1.5 }] }]
-- An empty array clears the range. Any failure rolls the whole thing back.
create or replace function public.replace_meal_plan(
  p_from date,
  p_to date,
  p_entries jsonb,
  p_meal text default null
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  p jsonb;
  v_entry uuid;
  n integer := 0;
begin
  if p_from > p_to then
    raise exception 'from (%) is after to (%)', p_from, p_to;
  end if;
  if p_to - p_from > 92 then
    raise exception 'range is longer than 92 days';
  end if;
  if p_meal is not null and p_meal not in ('breakfast', 'lunch', 'dinner') then
    raise exception 'unknown meal %', p_meal;
  end if;

  delete from public.meal_plan_entries
   where plan_date between p_from and p_to
     and (p_meal is null or meal = p_meal);

  for e in select value from jsonb_array_elements(p_entries) loop
    if (e->>'plan_date')::date not between p_from and p_to then
      raise exception 'entry date % is outside % to %', e->>'plan_date', p_from, p_to;
    end if;
    if p_meal is not null and e->>'meal' <> p_meal then
      raise exception 'entry meal % does not match the % being replaced', e->>'meal', p_meal;
    end if;

    insert into public.meal_plan_entries (plan_date, meal, recipe_id, notes)
    values ((e->>'plan_date')::date, e->>'meal', (e->>'recipe_id')::uuid, e->>'notes')
    returning id into v_entry;

    for p in select value from jsonb_array_elements(coalesce(e->'portions', '[]'::jsonb)) loop
      insert into public.meal_plan_portions (entry_id, person_id, servings)
      values (v_entry, (p->>'person_id')::uuid, (p->>'servings')::numeric);
    end loop;

    n := n + 1;
  end loop;

  return n;
end;
$$;

-- Reads the plan for [p_from, p_to] as one JSON document: every date in the range (empty days
-- included), each with its breakfast/lunch/dinner entries, per-person portions and kcal, and
-- per-person daily kcal totals against their target. Used by both the MCP server and the web app.
create or replace function public.get_meal_plan(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_from > p_to then
    raise exception 'from (%) is after to (%)', p_from, p_to;
  end if;
  if p_to - p_from > 92 then
    raise exception 'range is longer than 92 days';
  end if;

  return (
    with entry_json as (
      select
        e.plan_date,
        e.meal,
        e.created_at,
        jsonb_build_object(
          'id', e.id,
          'recipe_id', r.id,
          'recipe_name', r.name,
          'recipe_servings', r.servings,
          'kcal_per_serving', r.kcal_per_serving,
          'prep_minutes', r.prep_minutes,
          'cook_minutes', r.cook_minutes,
          'notes', e.notes,
          'portions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'person', pe.name,
                'servings', mp.servings,
                'kcal', case when r.kcal_per_serving is null then null
                             else round(mp.servings * r.kcal_per_serving) end
              ) order by lower(pe.name)
            )
            from public.meal_plan_portions mp
            join public.people pe on pe.id = mp.person_id
            where mp.entry_id = e.id
          ), '[]'::jsonb)
        ) as j
      from public.meal_plan_entries e
      join public.recipes r on r.id = e.recipe_id
      where e.plan_date between p_from and p_to
    ),
    day_totals as (
      select
        e.plan_date,
        pe.name,
        pe.daily_kcal_target,
        sum(mp.servings * r.kcal_per_serving) as kcal,
        count(*) filter (where r.kcal_per_serving is null) as missing_kcal
      from public.meal_plan_entries e
      join public.meal_plan_portions mp on mp.entry_id = e.id
      join public.people pe on pe.id = mp.person_id
      join public.recipes r on r.id = e.recipe_id
      where e.plan_date between p_from and p_to
      group by e.plan_date, pe.name, pe.daily_kcal_target
    ),
    days as (
      select d::date as plan_date
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'people', coalesce((
        select jsonb_agg(
          jsonb_build_object('name', name, 'daily_kcal_target', daily_kcal_target, 'default_servings', default_servings)
          order by lower(name)
        ) from public.people
      ), '[]'::jsonb),
      'days', coalesce(jsonb_agg(
        jsonb_build_object(
          'date', d.plan_date,
          'meals', (
            select jsonb_object_agg(
              m.meal,
              coalesce((
                select jsonb_agg(ej.j order by ej.created_at)
                from entry_json ej
                where ej.plan_date = d.plan_date and ej.meal = m.meal
              ), '[]'::jsonb)
            )
            from (values ('breakfast'), ('lunch'), ('dinner')) as m(meal)
          ),
          'kcal_by_person', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'person', t.name,
                'kcal', round(t.kcal),
                'target', t.daily_kcal_target,
                'entries_missing_kcal', t.missing_kcal
              ) order by lower(t.name)
            )
            from day_totals t
            where t.plan_date = d.plan_date
          ), '[]'::jsonb)
        ) order by d.plan_date
      ), '[]'::jsonb)
    )
    from days d
  );
end;
$$;

-- Server-only, like the tables.
revoke all on function public.replace_meal_plan(date, date, jsonb, text) from public, anon, authenticated;
revoke all on function public.get_meal_plan(date, date) from public, anon, authenticated;
grant execute on function public.replace_meal_plan(date, date, jsonb, text) to service_role;
grant execute on function public.get_meal_plan(date, date) to service_role;
