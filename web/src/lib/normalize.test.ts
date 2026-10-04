import assert from "node:assert/strict";
import { normalizeExtraction } from "./normalize.js";
import type { Extraction } from "./schema.js";

const e = {
  recipe: {
    name: "  Test  ", description: null, servings: 2, prep_minutes: null, cook_minutes: null, instructions: "x",
    meal_types: ["Dinner", " lunch ", "dinner", "brunch"], difficulty: "Easy",
    tags: ["Dairy Free", "dairy-free", " "], kcal_per_serving: null, carbs_g: null, protein_g: null, fat_g: null,
    freezable: false, freezer_months: null, fridge_days: null, reheating: null, is_base_recipe: false, is_multi_serve: false,
    ingredients: [{ name: " Chipotle Paste ", quantity: 3, unit: "TBSP", aisle: null, notes: null, confidence: 1 }],
  },
  confidence: { name: 1, servings: 1, timings: 1, ingredients: 1, instructions: 1, nutrition: 1, storage: 1, classification: 1 },
  warnings: [],
} satisfies Extraction;

const out = normalizeExtraction(e);
assert.equal(out.recipe.name, "Test");
assert.deepEqual(out.recipe.meal_types, ["dinner", "lunch"]); // case-folded, deduped, unknown dropped
assert.equal(out.recipe.difficulty, "easy");
assert.deepEqual(out.recipe.tags, ["dairy-free"]);
assert.equal(out.recipe.ingredients[0].name, "chipotle paste");
assert.equal(out.recipe.ingredients[0].unit, "tbsp");
assert.deepEqual(out.warnings, ['Ignored unknown meal type "brunch"']);

e.recipe.difficulty = "Tricky";
assert.equal(normalizeExtraction(e).recipe.difficulty, null);
console.log("normalize tests passed");
