import type { ConfidenceGroup, Extraction } from "./schema";

export type Band = "high" | "medium" | "low";
export const HIGH = 0.85;
export const MEDIUM = 0.6;

export const bandOf = (score: number): Band => (score >= HIGH ? "high" : score >= MEDIUM ? "medium" : "low");

export type GroupScore = { score: number; band: Band; reasons: string[] };
export type Scored = {
  overall: number;
  band: Band;
  groups: Partial<Record<ConfidenceGroup, GroupScore>>;
  /** Per-ingredient score, same order as extraction.recipe.ingredients. */
  ingredients: number[];
};

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Groups that must be right for the recipe to be usable; they drag the overall score down hardest. */
const CRITICAL: ConfidenceGroup[] = ["name", "servings", "ingredients", "instructions"];

/**
 * Model self-reported confidence, capped by deterministic sanity checks.
 * Self-reported scores are poorly calibrated, so a failed check always wins over a confident model.
 */
export function scoreExtraction({ recipe: r, confidence: c }: Extraction): Scored {
  const groups: Partial<Record<ConfidenceGroup, GroupScore>> = {};
  const add = (group: ConfidenceGroup, base: number, caps: Array<[boolean, number, string]>) => {
    let score = clamp01(base);
    const reasons: string[] = [];
    for (const [failed, cap, reason] of caps) {
      if (!failed) continue;
      score = Math.min(score, cap);
      reasons.push(reason);
    }
    groups[group] = { score: round2(score), band: bandOf(score), reasons };
  };

  add("name", c.name, [[!r.name.trim(), 0, "No recipe name found"]]);

  add("servings", c.servings, [
    [r.servings === null, 0.3, "Servings not found (defaulted to 4)"],
    [r.servings !== null && (r.servings <= 0 || r.servings > 100), 0.3, "Servings looks implausible"],
  ]);

  const total = (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0);
  if (r.prep_minutes !== null || r.cook_minutes !== null) {
    add("timings", c.timings, [
      [(r.prep_minutes ?? 0) < 0 || (r.cook_minutes ?? 0) < 0, 0.3, "Negative time"],
      [total > 24 * 60, 0.3, "Total time over 24 hours"],
    ]);
  }

  const perIngredient = r.ingredients.map((i) => clamp01(i.confidence));
  add("ingredients", Math.min(c.ingredients, mean(perIngredient)), [
    [r.ingredients.length === 0, 0, "No ingredients found"],
    [r.ingredients.some((i) => !i.name.trim()), 0.4, "An ingredient has no name"],
    [r.ingredients.some((i) => i.quantity === null && i.unit), 0.6, "An ingredient has a unit but no quantity"],
  ]);

  add("instructions", c.instructions, [[!r.instructions.trim(), 0, "No method found"]]);

  const { kcal_per_serving: kcal, carbs_g: carbs, protein_g: protein, fat_g: fat } = r;
  if ([kcal, carbs, protein, fat].some((n) => n !== null)) {
    const macros = [carbs, protein, fat];
    const macroKcal = (carbs ?? 0) * 4 + (protein ?? 0) * 4 + (fat ?? 0) * 9;
    add("nutrition", c.nutrition, [
      [kcal !== null && (kcal < 20 || kcal > 2500), 0.3, "Calories per serving look implausible"],
      [kcal !== null && macroKcal > kcal * 1.05, 0.3, "Macros add up to more calories than the total"],
      [
        kcal !== null && macros.every((n) => n !== null) && kcal > 0 && Math.abs(macroKcal - kcal) / kcal > 0.35,
        0.5,
        "Macros and calories don't reconcile",
      ],
    ]);
  }

  if (r.freezable || r.freezer_months !== null || r.fridge_days !== null || r.reheating) {
    add("storage", c.storage, [
      [r.freezer_months !== null && !r.freezable, 0.4, "Freezer time given but not marked freezable"],
      [(r.freezer_months ?? 0) > 24, 0.4, "Freezer time over 24 months"],
      [(r.fridge_days ?? 0) > 30, 0.4, "Fridge time over 30 days"],
    ]);
  }

  // Meal types / difficulty / tags are partly inferred rather than printed, so the model score is
  // usually lower here; an empty meal type list can't be planned with, so it caps the group.
  add("classification", c.classification, [[r.meal_types.length === 0, 0.5, "No meal type set"]]);

  const present = Object.values(groups);
  const critical = CRITICAL.map((g) => groups[g]!.score);
  const overall = round2(0.6 * mean(present.map((g) => g.score)) + 0.4 * Math.min(...critical));
  return { overall, band: bandOf(overall), groups, ingredients: perIngredient.map(round2) };
}
