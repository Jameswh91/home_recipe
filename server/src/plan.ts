export const PLAN_MEALS = ["breakfast", "lunch", "dinner"] as const;
export type PlanMeal = (typeof PLAN_MEALS)[number];

export type Person = { id: string; name: string; default_servings: number };

export type PlanEntryInput = {
  date: string;
  meal: PlanMeal;
  recipe_id: string;
  notes?: string;
  /** Person name -> recipe servings they eat. Unlisted people get their default; 0 means they skip it. */
  servings?: Record<string, number>;
};

export type DbPlanEntry = {
  plan_date: string;
  meal: PlanMeal;
  recipe_id: string;
  notes: string | null;
  portions: { person_id: string; servings: number }[];
};

export const isIsoDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** Turns tool input into rows for replace_meal_plan, filling in default portions for every person. */
export function toDbEntries(
  entries: PlanEntryInput[],
  people: Person[],
): { ok: true; entries: DbPlanEntry[] } | { ok: false; error: string } {
  if (entries.length && !people.length) {
    return { ok: false, error: "No people yet. Add everyone who eats the plan with save_person first." };
  }
  const byName = new Map(people.map((p) => [p.name.toLowerCase(), p]));
  const out: DbPlanEntry[] = [];

  for (const e of entries) {
    const overrides = new Map<string, number>();
    for (const [name, servings] of Object.entries(e.servings ?? {})) {
      const person = byName.get(name.toLowerCase());
      if (!person) {
        return { ok: false, error: `Unknown person "${name}". Known people: ${people.map((p) => p.name).join(", ")}` };
      }
      if (!(servings >= 0)) return { ok: false, error: `Servings for ${name} must be 0 or more` };
      overrides.set(person.id, servings);
    }
    const portions = people
      .map((p) => ({ person_id: p.id, servings: overrides.get(p.id) ?? Number(p.default_servings) }))
      .filter((p) => p.servings > 0);
    out.push({ plan_date: e.date, meal: e.meal, recipe_id: e.recipe_id, notes: e.notes ?? null, portions });
  }
  return { ok: true, entries: out };
}

type EntryWithPortions = { recipe_id: string; meal_plan_portions: { servings: number | string }[] };

/** Total recipe servings to cook per recipe across the plan (all people, all days). */
export function totalServingsByRecipe(rows: EntryWithPortions[]): { recipe_id: string; servings: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const sum = r.meal_plan_portions.reduce((acc, p) => acc + Number(p.servings), 0);
    totals.set(r.recipe_id, (totals.get(r.recipe_id) ?? 0) + sum);
  }
  return [...totals].filter(([, servings]) => servings > 0).map(([recipe_id, servings]) => ({ recipe_id, servings }));
}
