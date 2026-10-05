# Manual test checklist

Run these from Claude desktop with the `home-recipe` MCP server connected
(restart Claude desktop after pulling new code). Expected results assume the
8 seed recipes and no ratings. Tick each box and note anything clumsy about the
wording or output shape.

Seed data for reference:

| Recipe | Meal types | Difficulty | Prep+cook (min) | Serves |
|---|---|---|---|---|
| Beef Chilli | dinner | easy | 60 | 4 |
| Cheese Omelette | breakfast, lunch | easy | 7 | 2 |
| Chicken Fajitas | dinner | easy | 35 | 4 |
| Margherita Pizza | dinner | medium | 35 | 4 |
| Mushroom Risotto | dinner | medium | 40 | 4 |
| Salmon with Roast Veg | dinner | easy | 35 | 2 |
| Spaghetti Bolognese | dinner | easy | 50 | 4 |
| Vegetable Curry | lunch, dinner | easy | 35 | 4 |

## Read

- [ ] **1.** "What breakfast recipes do I have?" -> Cheese Omelette only.
- [ ] **2.** "Easy dinners under 40 minutes" -> Chicken Fajitas, Salmon with Roast Veg, Vegetable Curry. Excludes Chilli and Bolognese (too long) and Pizza and Risotto (medium).
- [ ] **3.** "Medium difficulty meals" -> Margherita Pizza, Mushroom Risotto.
- [ ] **4.** "Vegetarian lunches" -> Cheese Omelette, Vegetable Curry.
- [ ] **5.** "Any desserts?" -> none. Claude says so and offers to add one; it doesn't invent a recipe.
- [ ] **6.** "Recipes rated 4 or higher" -> none (nothing is rated yet).
- [ ] **7.** "How do I make the risotto?" -> method and ingredients, with difficulty and timings stated.

## Shopping list

- [ ] **8.** "Shopping list for fajitas and bolognese" -> grouped by aisle; `onion` appears once with quantity 2 (1 from each).
- [ ] **9.** "Shopping list for the curry, scaled to 8 servings" -> quantities double: baby spinach 300 g, basmati rice 600 g, chickpeas 800 g, chopped tomatoes 800 g, coconut milk 800 ml, curry paste 6 tbsp, garlic clove 4, onion 2.
- [ ] **10.** "Shopping list for bolognese on Monday and again on Thursday" -> one entry per ingredient, quantities doubled (servings added up, not duplicate lines).

## Write

Delete any test data afterwards. Recipes added here have `is_seed = false`, so
the seed cleanup (`delete from recipes where is_seed;`) will not remove them.

- [ ] **11.** "Add a recipe: Pancakes, breakfast and dessert, easy, with ingredients and a method" -> added; appears when filtering by breakfast and by dessert.
- [ ] **12.** Add Pancakes again -> clear "already exists" error.
- [ ] **13.** "Rate the omelette 5 stars", then repeat test 6 -> the omelette now appears.
- [ ] **14.** "Change the pizza's difficulty to hard" -> only difficulty changes; everything else intact.
- [ ] **15.** "Clear the omelette's description" -> description becomes null.
- [ ] **16.** "Add 100 g of spinach to the omelette" -> Claude resends the full ingredient list (egg 4, cheddar 60 g, butter 10 g, plus spinach). Check nothing else was lost.
- [ ] **17.** "Delete the Pancakes recipe" -> Claude asks for confirmation first, then deletes it and its ingredients.

## Edge cases

- [ ] **18.** "Add a recipe for a brunch dish" -> `brunch` is not a valid meal type; Claude maps it to breakfast/lunch or asks.
- [ ] **19.** "Update the omelette" with no changes -> "Nothing to update".
- [ ] **20.** "Update a recipe that doesn't exist / delete one with a made-up id" -> "Recipe not found".
- [ ] **21.** "Search for recipes called '100%'" -> no results, no error (wildcard characters are escaped).
- [ ] **22.** End to end: "Plan dinners Monday to Friday using easy recipes, no repeats, then give me the shopping list" -> exactly 5 easy dinners exist (Chilli, Fajitas, Salmon, Bolognese, Curry), so all five are used once each; the shopping list merges shared ingredients and nothing is invented.

## Meal planning

Needs migration `20261005090000` applied and the MCP server restarted. Use any 3 recipes that have
`kcal_per_serving` set (import some with the web app first). Replace the example names with yours.
Use a Monday for the week start.

- [ ] **23.** "Who's in the meal plan?" -> empty list. "Add James (2000 kcal a day) and Sam (1600 kcal, default portion 1.5)" -> both saved; `list_people` shows them.
- [ ] **24.** "Add james again with a 2200 kcal target" -> updates the existing person (no duplicate, `created: false`).
- [ ] **25.** "Plan next week: breakfast, lunch and dinner every day" -> all 21 slots saved in one go; the reply shows per-person kcal for each day.
- [ ] **26.** Open `/plan` in the web app -> the same plan, Monday first, today highlighted, per-person daily totals. On a phone it stacks day by day.
- [ ] **27.** "Give James 2 portions of Tuesday's dinner and Sam 1" -> only Tuesday dinner changes; check the portions on `/plan` ("James ×2, Sam ×1").
- [ ] **28.** "Sam isn't eating Wednesday's lunch" -> Sam's portion is 0 so he's absent from that meal; his Wednesday total drops.
- [ ] **29.** "Swap Thursday's dinner for something else" -> only that slot changes (single-meal replace); other meals that day are untouched.
- [ ] **30.** "Shopping list for next week's plan" -> uses `get_plan_shopping_list`; quantities scale to the total servings eaten (sum of everyone's portions across days); a recipe planned twice appears once with doubled quantities.
- [ ] **31.** "Plan Monday dinner as the traybake and a sweet potato mash" -> both appear in the dinner slot (main + side).
- [ ] **32.** "Clear next week's plan" -> `/plan` shows "Nothing planned for this week".

### Meal planning edge cases

- [ ] **33.** Plan using a recipe with no kcal -> works; the day total on `/plan` is marked `*` with a footnote that it is understated.
- [ ] **34.** "Give Alex 2 portions" (not a person) -> clear "Unknown person" error listing who exists; nothing saved.
- [ ] **35.** Plan the same recipe twice in one slot -> "appears twice" error and nothing saved (the old plan is intact).
- [ ] **36.** Delete a recipe that is in the plan -> it disappears from `/plan` (plan entries are removed with it).
- [ ] **37.** `/plan?week=2026-10-07` (a Wednesday) -> shows the week starting Monday 5 Oct.

## Photo import log

- [ ] **38.** Import a page and confirm without changing anything, then in Supabase SQL: `select status, changed_fields, ingredient_edits, usage from recipe_imports order by created_at desc limit 1;` -> `confirmed`, empty `changed_fields`, zero ingredient edits, token usage recorded.
- [ ] **39.** Import another, edit the servings and delete one ingredient, confirm -> `changed_fields` contains `servings` and `ingredients`; `ingredient_edits.removed = 1`.
- [ ] **40.** Import and press Discard -> status `discarded`, the photo is gone from the `recipe-images` bucket.

## What to look for

- Filters return the right rows (no extras, none missing).
- Output wording is readable, not a raw JSON dump.
- Claude doesn't make unnecessary extra tool calls.
- Write actions confirm or report clearly what changed.
