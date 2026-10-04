import { DIFFICULTIES, MEAL_TYPES, type Extraction } from "./schema";

const unique = <T>(xs: T[]) => [...new Set(xs)];

/** Maps the model's free-text vocabulary fields onto the database's, and applies naming conventions. */
export function normalizeExtraction(e: Extraction): Extraction {
  const r = e.recipe;
  const droppedMeals = r.meal_types.filter((m) => !(MEAL_TYPES as readonly string[]).includes(m.trim().toLowerCase()));
  const difficulty = r.difficulty?.trim().toLowerCase() ?? null;
  const validDifficulty = difficulty && (DIFFICULTIES as readonly string[]).includes(difficulty) ? difficulty : null;

  return {
    ...e,
    warnings: [
      ...e.warnings,
      ...droppedMeals.map((m) => `Ignored unknown meal type "${m}"`),
      ...(difficulty && !validDifficulty ? [`Ignored unknown difficulty "${r.difficulty}"`] : []),
    ],
    recipe: {
      ...r,
      name: r.name.trim(),
      meal_types: unique(r.meal_types.map((m) => m.trim().toLowerCase()).filter((m) => (MEAL_TYPES as readonly string[]).includes(m))),
      difficulty: validDifficulty,
      tags: unique(r.tags.map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter(Boolean)),
      // Shopping lists merge on name + unit, so names and units are lowercase everywhere.
      ingredients: r.ingredients.map((i) => ({
        ...i,
        name: i.name.trim().toLowerCase(),
        unit: i.unit?.trim().toLowerCase() || null,
      })),
    },
  };
}
