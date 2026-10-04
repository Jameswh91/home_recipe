export interface IngredientRow {
  recipe_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  aisle: string | null;
  notes: string | null;
}

export interface PlannedRecipe {
  recipe_id: string;
  name: string;
  recipe_servings: number;
  /** Servings wanted; defaults to the recipe's own servings. */
  servings?: number;
}

export interface ShoppingItem {
  name: string;
  quantity: number | null;
  unit: string | null;
  used_in: string[];
}

export type ShoppingList = Record<string, ShoppingItem[]>;

const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
const round = (n: number) => Math.round(n * 100) / 100;

/** Scale each planned recipe's ingredients, then merge by name + unit, grouped by aisle. */
export function buildShoppingList(
  planned: PlannedRecipe[],
  ingredients: IngredientRow[],
): ShoppingList {
  const byRecipe = new Map(planned.map((p) => [p.recipe_id, p]));
  const merged = new Map<string, ShoppingItem & { aisle: string }>();

  for (const ing of ingredients) {
    const plan = byRecipe.get(ing.recipe_id);
    if (!plan) continue;
    const scale = (plan.servings ?? plan.recipe_servings) / plan.recipe_servings;
    const key = `${norm(ing.name)}|${norm(ing.unit)}`;
    const existing = merged.get(key);
    const qty = ing.quantity === null ? null : ing.quantity * scale;

    if (existing) {
      if (qty !== null) existing.quantity = (existing.quantity ?? 0) + qty;
      if (!existing.used_in.includes(plan.name)) existing.used_in.push(plan.name);
    } else {
      merged.set(key, {
        name: ing.name.trim(),
        quantity: qty,
        unit: ing.unit,
        aisle: ing.aisle?.trim() || "Other",
        used_in: [plan.name],
      });
    }
  }

  const list: ShoppingList = {};
  for (const { aisle, ...item } of merged.values()) {
    if (item.quantity !== null) item.quantity = round(item.quantity);
    (list[aisle] ??= []).push(item);
  }
  for (const items of Object.values(list)) items.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}
