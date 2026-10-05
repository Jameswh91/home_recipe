import assert from "node:assert/strict";
import { diffExtraction } from "./corrections.js";
import type { Extraction, RecipeInput } from "./schema.js";

const extracted: Extraction["recipe"] = {
  name: "Traybake", description: null, servings: null, prep_minutes: 10, cook_minutes: 30, instructions: "a\nb",
  meal_types: ["dinner"], difficulty: "easy", tags: ["dairy-free", "spicy"],
  kcal_per_serving: 202, carbs_g: 11, protein_g: null, fat_g: null,
  freezable: true, freezer_months: 3, fridge_days: 4, reheating: "Microwave", is_base_recipe: true, is_multi_serve: true,
  ingredients: [
    { name: "chicken", quantity: 1000, unit: "g", aisle: "Meat", notes: null, confidence: 0.9 },
    { name: "lime", quantity: 1, unit: null, aisle: "Produce", notes: "juiced", confidence: 0.9 },
    { name: "cumin", quantity: 1, unit: "tsp", aisle: "Spices", notes: null, confidence: 0.9 },
  ],
};
const untouched = (): RecipeInput => ({
  ...extracted, servings: 4, meal_types: ["dinner"], difficulty: "easy", ingredients: extracted.ingredients.map(({ confidence: _c, ...i }) => i),
});

// Accepting the form as-is (including its servings default) is zero corrections.
let d = diffExtraction(extracted, untouched());
assert.deepEqual(d, { changed_fields: [], ingredient_edits: { added: 0, removed: 0, edited: 0 } });

// Scalars, case/order-insensitive lists, and blank-vs-null are handled.
const c = untouched();
c.servings = 8; c.cook_minutes = 35; c.tags = ["Spicy", "dairy-free", "high-protein"]; c.meal_types = ["dinner"];
c.description = "  "; c.reheating = " Microwave ";
d = diffExtraction(extracted, c);
assert.deepEqual(d.changed_fields.sort(), ["cook_minutes", "servings", "tags"]);

// Ingredients: edit, remove, add, and rename (= remove + add).
const e = untouched();
e.ingredients[0].quantity = 800;                    // edited
e.ingredients.splice(2, 1);                         // cumin removed
e.ingredients.push({ name: "paprika", quantity: 1, unit: "tsp", aisle: "Spices", notes: null }); // added
d = diffExtraction(extracted, e);
assert.deepEqual(d.ingredient_edits, { added: 1, removed: 1, edited: 1 });
assert.deepEqual(d.changed_fields, ["ingredients"]);
console.log("corrections tests passed");
