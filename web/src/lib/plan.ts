import { db } from "./db";
import { addDays } from "./week";

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export type PlanEntry = {
  id: string;
  recipe_id: string;
  recipe_name: string;
  recipe_servings: number;
  kcal_per_serving: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  notes: string | null;
  portions: { person: string; servings: number; kcal: number | null }[];
};

export type PlanDay = {
  date: string;
  meals: Record<Meal, PlanEntry[]>;
  kcal_by_person: { person: string; kcal: number; target: number | null; entries_missing_kcal: number }[];
};

export type WeekPlan = {
  from: string;
  to: string;
  people: { name: string; daily_kcal_target: number | null; default_servings: number }[];
  days: PlanDay[];
};

/** Reads one Monday-to-Sunday week via the same SQL function the MCP server uses. */
export async function loadWeek(monday: string): Promise<WeekPlan> {
  const { data, error } = await db().rpc("get_meal_plan", { p_from: monday, p_to: addDays(monday, 6) });
  if (error) throw new Error(error.message);
  return data as WeekPlan;
}
