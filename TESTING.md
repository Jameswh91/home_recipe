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

## What to look for

- Filters return the right rows (no extras, none missing).
- Output wording is readable, not a raw JSON dump.
- Claude doesn't make unnecessary extra tool calls.
- Write actions confirm or report clearly what changed.
