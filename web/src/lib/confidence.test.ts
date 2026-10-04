import assert from "node:assert/strict";
import { scoreExtraction } from "./confidence.js";
import type { Extraction } from "./schema.js";

const base = (): Extraction => ({
  recipe: {
    name: "Chipotle Chicken Traybake",
    description: null,
    servings: 8,
    prep_minutes: 10,
    cook_minutes: 30,
    instructions: "Preheat the oven to 200C.\nMix the paste.",
    meal_types: ["dinner"],
    difficulty: "easy",
    tags: ["dairy-free", "gluten-free"],
    kcal_per_serving: 202,
    carbs_g: 11,
    protein_g: null,
    fat_g: null,
    freezable: true,
    freezer_months: 3,
    fridge_days: 4,
    reheating: "Microwave 3-4 minutes until piping hot",
    is_base_recipe: true,
    is_multi_serve: true,
    ingredients: [
      { name: "chipotle paste", quantity: 3, unit: "tbsp", aisle: "Spices", notes: null, confidence: 0.95 },
      { name: "chicken breast", quantity: 1000, unit: "g", aisle: "Meat", notes: "skinless", confidence: 0.95 },
    ],
  },
  confidence: {
    name: 0.99, servings: 0.98, timings: 0.95, ingredients: 0.95,
    instructions: 0.95, nutrition: 0.9, storage: 0.9, classification: 0.7,
  },
  warnings: [],
});

// Clean extraction: all critical groups high, classification flagged for review, overall high.
let s = scoreExtraction(base());
assert.equal(s.band, "high");
assert.equal(s.groups.classification!.band, "medium");
assert.deepEqual(s.groups.nutrition!.reasons, []);

// Nutrition and storage groups are n/a when the page has none.
const bare = base();
Object.assign(bare.recipe, { kcal_per_serving: null, carbs_g: null, freezable: false, freezer_months: null, fridge_days: null, reheating: null, prep_minutes: null, cook_minutes: null });
s = scoreExtraction(bare);
assert.equal(s.groups.nutrition, undefined);
assert.equal(s.groups.storage, undefined);
assert.equal(s.groups.timings, undefined);

// A confident model is overruled by failed sanity checks.
const bad = base();
bad.recipe.carbs_g = 100; // 400 kcal of carbs in a 202 kcal serving
s = scoreExtraction(bad);
assert.equal(s.groups.nutrition!.score, 0.3);
assert.match(s.groups.nutrition!.reasons[0], /more calories/);

// Missing servings caps servings and drags overall down via the critical-group minimum.
const noServings = base();
noServings.recipe.servings = null;
s = scoreExtraction(noServings);
assert.equal(s.groups.servings!.score, 0.3);
assert.ok(s.overall < 0.85);

// Freezer time without freezable would violate the DB constraint, so it is flagged.
const freezer = base();
freezer.recipe.freezable = false;
s = scoreExtraction(freezer);
assert.equal(s.groups.storage!.score, 0.4);

// No ingredients / no method -> zero, and overall can't be high.
const empty = base();
empty.recipe.ingredients = [];
empty.recipe.instructions = "  ";
s = scoreExtraction(empty);
assert.equal(s.groups.ingredients!.score, 0);
assert.equal(s.groups.instructions!.score, 0);
assert.equal(s.band, "low");

// Out-of-range model scores are clamped.
const wild = base();
wild.confidence.name = 7;
wild.confidence.instructions = Number.NaN;
s = scoreExtraction(wild);
assert.equal(s.groups.name!.score, 1);
assert.equal(s.groups.instructions!.score, 0);

console.log("confidence tests passed");
