import assert from "node:assert/strict";
import { isIsoDate, toDbEntries, totalServingsByRecipe, type Person } from "./plan.js";

const people: Person[] = [
  { id: "p1", name: "James", default_servings: 1 },
  { id: "p2", name: "Sam", default_servings: 1.5 },
];
const base = { date: "2026-10-05", meal: "dinner" as const, recipe_id: "r1" };

// Defaults: everyone gets their own default portion.
let r = toDbEntries([base], people);
assert.ok(r.ok);
assert.deepEqual(r.entries[0].portions, [
  { person_id: "p1", servings: 1 },
  { person_id: "p2", servings: 1.5 },
]);

// Overrides are case-insensitive; unlisted people keep their default; 0 skips the meal.
r = toDbEntries([{ ...base, servings: { james: 2, SAM: 0 } }], people);
assert.ok(r.ok);
assert.deepEqual(r.entries[0].portions, [{ person_id: "p1", servings: 2 }]);

// Errors are specific and actionable.
r = toDbEntries([{ ...base, servings: { Alex: 1 } }], people);
assert.ok(!r.ok && /Unknown person "Alex".*James, Sam/.test(r.error));
r = toDbEntries([{ ...base, servings: { James: -1 } }], people);
assert.ok(!r.ok && /0 or more/.test(r.error));
r = toDbEntries([base], []);
assert.ok(!r.ok && /save_person/.test(r.error));
// Clearing a range needs no people.
r = toDbEntries([], []);
assert.ok(r.ok && r.entries.length === 0);

// Totals add up across people and across repeated recipes; numeric strings are handled.
const totals = totalServingsByRecipe([
  { recipe_id: "a", meal_plan_portions: [{ servings: 1 }, { servings: "1.5" }] },
  { recipe_id: "a", meal_plan_portions: [{ servings: 1 }] },
  { recipe_id: "b", meal_plan_portions: [] },
]);
assert.deepEqual(totals, [{ recipe_id: "a", servings: 3.5 }]);

assert.ok(isIsoDate("2026-02-28"));
assert.ok(!isIsoDate("2026-02-30"));
assert.ok(!isIsoDate("5/10/2026"));
console.log("plan tests passed");
