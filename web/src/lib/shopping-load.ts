import { db } from "./db";
import {
  buildShoppingList,
  totalServingsByRecipe,
  type EntryWithPortions,
  type IngredientRow,
  type ShoppingAisle,
} from "./shopping";
import { addDays } from "./week";

/** Shopping list for everything planned in one Monday-to-Sunday week. Empty array = nothing planned. */
export async function loadShoppingList(monday: string): Promise<ShoppingAisle[]> {
  const entries = await db()
    .from("meal_plan_entries")
    .select("recipe_id, meal_plan_portions(servings)")
    .gte("plan_date", monday)
    .lte("plan_date", addDays(monday, 6));
  if (entries.error) throw new Error(entries.error.message);

  const totals = totalServingsByRecipe((entries.data ?? []) as EntryWithPortions[]);
  if (!totals.length) return [];

  const ids = totals.map((t) => t.recipe_id);
  const [recipes, ingredients] = await Promise.all([
    db().from("recipes").select("id, name, servings").in("id", ids),
    db().from("ingredients").select("recipe_id, name, quantity, unit, aisle").in("recipe_id", ids),
  ]);
  if (recipes.error) throw new Error(recipes.error.message);
  if (ingredients.error) throw new Error(ingredients.error.message);

  const known = new Map(recipes.data.map((r) => [r.id as string, r]));
  const planned = totals.flatMap((t) => {
    const r = known.get(t.recipe_id);
    return r ? [{ recipe_id: t.recipe_id, name: r.name as string, recipe_servings: Number(r.servings), servings: t.servings }] : [];
  });
  const rows = ingredients.data.map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) }));
  return buildShoppingList(planned, rows as IngredientRow[]);
}
