import assert from "node:assert/strict";
import { buildShoppingList } from "./shopping.js";

const planned = [
  { recipe_id: "a", name: "Chilli", recipe_servings: 4 },
  { recipe_id: "b", name: "Fajitas", recipe_servings: 4, servings: 8 },
];
const rows = [
  { recipe_id: "a", name: "Onion", quantity: 1, unit: null, aisle: "Produce", notes: null },
  { recipe_id: "b", name: "onion", quantity: 1, unit: null, aisle: "Produce", notes: null },
  { recipe_id: "a", name: "rice", quantity: 300, unit: "g", aisle: null, notes: null },
  { recipe_id: "b", name: "rice", quantity: 100, unit: "ml", aisle: null, notes: null },
  { recipe_id: "x", name: "ignored", quantity: 1, unit: null, aisle: null, notes: null },
];

const list = buildShoppingList(planned, rows);
// onion: 1 (chilli) + 1*2 (fajitas doubled) = 3, merged case-insensitively
assert.equal(list.Produce.length, 1);
assert.equal(list.Produce[0].quantity, 3);
assert.deepEqual(list.Produce[0].used_in, ["Chilli", "Fajitas"]);
// different units are not merged; missing aisle -> Other; unplanned recipes ignored
assert.equal(list.Other.length, 2);
assert.ok(!JSON.stringify(list).includes("ignored"));
console.log("shopping tests passed");
