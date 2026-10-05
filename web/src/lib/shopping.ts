// Pure logic, safe to import from client components. Same rules as server/src/shopping.ts and server/src/plan.ts (get_plan_shopping_list), so the web
// list and Claude's list can't disagree. Keep the two in step.

export interface IngredientRow {
  recipe_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string | null;
}

export interface PlannedRecipe {
  recipe_id: string;
  name: string;
  recipe_servings: number;
  /** Total servings to cook across the plan. */
  servings: number;
}

export interface ShoppingItem {
  /** Stable id (name + unit, lowercased), used to remember what's been ticked. */
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  used_in: string[];
}

export interface ShoppingAisle {
  aisle: string;
  items: ShoppingItem[];
}

export type EntryWithPortions = { recipe_id: string; meal_plan_portions: { servings: number | string }[] };

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
const round = (n: number) => Math.round(n * 100) / 100;

/** Total recipe servings to cook per recipe across the plan (all people, all days). */
export function totalServingsByRecipe(rows: EntryWithPortions[]): { recipe_id: string; servings: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const sum = r.meal_plan_portions.reduce((acc, p) => acc + Number(p.servings), 0);
    totals.set(r.recipe_id, (totals.get(r.recipe_id) ?? 0) + sum);
  }
  return [...totals].filter(([, servings]) => servings > 0).map(([recipe_id, servings]) => ({ recipe_id, servings }));
}

/** Scale each planned recipe's ingredients, merge by name + unit, group by aisle (A-Z, "Other" last). */
export function buildShoppingList(planned: PlannedRecipe[], ingredients: IngredientRow[]): ShoppingAisle[] {
  const byRecipe = new Map(planned.map((p) => [p.recipe_id, p]));
  const merged = new Map<string, ShoppingItem & { aisle: string }>();

  for (const ing of ingredients) {
    const plan = byRecipe.get(ing.recipe_id);
    if (!plan) continue;
    const scale = plan.servings / plan.recipe_servings;
    const key = `${norm(ing.name)}|${norm(ing.unit)}`;
    const existing = merged.get(key);
    const qty = ing.quantity === null ? null : ing.quantity * scale;

    if (existing) {
      if (qty !== null) existing.quantity = (existing.quantity ?? 0) + qty;
      if (!existing.used_in.includes(plan.name)) existing.used_in.push(plan.name);
    } else {
      merged.set(key, {
        key,
        name: ing.name.trim(),
        quantity: qty,
        unit: ing.unit,
        aisle: ing.aisle?.trim() || "Other",
        used_in: [plan.name],
      });
    }
  }

  const byAisle = new Map<string, ShoppingItem[]>();
  for (const { aisle, ...item } of merged.values()) {
    if (item.quantity !== null) item.quantity = round(item.quantity);
    byAisle.set(aisle, [...(byAisle.get(aisle) ?? []), item]);
  }
  return [...byAisle]
    .map(([aisle, items]) => ({ aisle, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => Number(a.aisle === "Other") - Number(b.aisle === "Other") || a.aisle.localeCompare(b.aisle));
}

/** "300 g", "2", or "" when there's no quantity. */
export function formatQuantity(item: Pick<ShoppingItem, "quantity" | "unit">): string {
  if (item.quantity === null) return "";
  return [item.quantity.toLocaleString("en-GB", { maximumFractionDigits: 2 }), item.unit?.trim()]
    .filter(Boolean)
    .join(" ");
}
