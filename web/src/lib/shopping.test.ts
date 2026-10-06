import assert from "node:assert/strict";

import { buildShoppingList, formatQuantity, totalServingsByRecipe } from "./shopping";

// Servings eaten: everyone's portions, every day, per recipe; skipped (0) portions don't count.
const totals = totalServingsByRecipe([
  { recipe_id: "a", meal_plan_portions: [{ servings: 1 }, { servings: "1.5" }] },
  { recipe_id: "a", meal_plan_portions: [{ servings: 2 }] },
  { recipe_id: "b", meal_plan_portions: [{ servings: 0 }] },
  { recipe_id: "c", meal_plan_portions: [] },
]);
assert.deepEqual(totals, [{ recipe_id: "a", servings: 4.5 }]);

const planned = [
  { recipe_id: "a", name: "Chilli", recipe_servings: 4, servings: 4 },
  { recipe_id: "b", name: "Fajitas", recipe_servings: 4, servings: 8 },
];
const rows = [
  { recipe_id: "a", name: "Onion", quantity: 1, unit: null, aisle: "Produce" },
  { recipe_id: "b", name: "onion", quantity: 1, unit: null, aisle: "Produce" },
  { recipe_id: "a", name: "rice", quantity: 300, unit: "g", aisle: null },
  { recipe_id: "b", name: "rice", quantity: 100, unit: "ml", aisle: null },
  { recipe_id: "a", name: "salt", quantity: null, unit: null, aisle: "Spices" },
  { recipe_id: "x", name: "ignored", quantity: 1, unit: null, aisle: null },
];

const list = buildShoppingList(planned, rows);
// Aisles A-Z with "Other" last.
assert.deepEqual(list.map((a) => a.aisle), ["Produce", "Spices", "Other"]);
// onion: 1 (chilli) + 1*2 (fajitas doubled) = 3, merged case-insensitively, with a stable key.
const onion = list[0].items[0];
assert.equal(onion.quantity, 3);
assert.equal(onion.key, "onion|");
assert.deepEqual(onion.used_in, ["Chilli", "Fajitas"]);
// Different units aren't merged; unplanned recipes are ignored; no quantity stays null.
assert.equal(list[2].items.length, 2);
assert.ok(!JSON.stringify(list).includes("ignored"));
assert.equal(list[1].items[0].quantity, null);

assert.equal(formatQuantity({ quantity: 300, unit: "g" }), "300 g");
assert.equal(formatQuantity({ quantity: 1.5, unit: null }), "1.5");
assert.equal(formatQuantity({ quantity: 1200, unit: "ml" }), "1,200 ml");
assert.equal(formatQuantity({ quantity: null, unit: "g" }), "");
console.log("shopping tests passed");
