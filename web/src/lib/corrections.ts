import type { Extraction, RecipeInput } from "./schema";

type Ingredient = { name: string; quantity: number | null; unit: string | null; aisle: string | null; notes: string | null };

export type Corrections = {
  /** Recipe fields whose confirmed value differs from what the model extracted. */
  changed_fields: string[];
  ingredient_edits: { added: number; removed: number; edited: number };
};

const blank = (s: string | null | undefined) => {
  const t = s?.trim();
  return t ? t : null;
};
const sorted = (xs: string[]) => [...xs].map((x) => x.trim().toLowerCase()).sort();

const ingredientKey = (i: Ingredient) => i.name.trim().toLowerCase();
const sameIngredient = (a: Ingredient, b: Ingredient) =>
  a.quantity === b.quantity &&
  blank(a.unit)?.toLowerCase() === blank(b.unit)?.toLowerCase() &&
  blank(a.aisle)?.toLowerCase() === blank(b.aisle)?.toLowerCase() &&
  blank(a.notes) === blank(b.notes);

/**
 * Compares the model's extraction with what the user confirmed. The review form fills servings with 4
 * when the model found none, so that default is not counted as a correction.
 */
export function diffExtraction(extracted: Extraction["recipe"], confirmed: RecipeInput): Corrections {
  const before = {
    ...extracted,
    servings: extracted.servings ?? 4,
    name: extracted.name.trim(),
    description: blank(extracted.description),
    instructions: extracted.instructions.trim(),
    reheating: blank(extracted.reheating),
    difficulty: blank(extracted.difficulty),
  };
  const after = {
    ...confirmed,
    name: confirmed.name.trim(),
    description: blank(confirmed.description),
    instructions: confirmed.instructions.trim(),
    reheating: blank(confirmed.reheating),
  };

  const scalars = [
    "name", "description", "servings", "prep_minutes", "cook_minutes", "instructions", "difficulty",
    "kcal_per_serving", "carbs_g", "protein_g", "fat_g", "freezable", "freezer_months", "fridge_days",
    "reheating", "is_base_recipe", "is_multi_serve",
  ] as const;
  const changed: string[] = scalars.filter((k) => before[k] !== after[k]);
  for (const k of ["meal_types", "tags"] as const) {
    if (JSON.stringify(sorted(before[k])) !== JSON.stringify(sorted(after[k]))) changed.push(k);
  }

  // Match ingredients by name; unmatched ones count as removed (model) or added (user).
  const pool = [...after.ingredients];
  let edited = 0;
  let removed = 0;
  for (const mine of extracted.ingredients.filter((i) => i.name.trim())) {
    const at = pool.findIndex((c) => ingredientKey(c) === ingredientKey(mine));
    if (at === -1) { removed++; continue; }
    if (!sameIngredient(mine, pool[at])) edited++;
    pool.splice(at, 1);
  }
  const added = pool.length;
  if (added || removed || edited) changed.push("ingredients");

  return { changed_fields: changed, ingredient_edits: { added, removed, edited } };
}
