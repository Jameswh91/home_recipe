import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { z } from "zod";
import { isIsoDate, PLAN_MEALS, toDbEntries, totalServingsByRecipe } from "./plan.js";
import { buildShoppingList, type IngredientRow } from "./shopping.js";

// quiet: stdout is the MCP channel, so dotenv must not print anything.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example)");
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const server = new McpServer({ name: "home-recipe", version: "0.1.0" });

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});
const fail = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

const MEAL_TYPES = ["breakfast", "lunch", "dinner", "dessert", "snack", "side"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const ingredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.number().min(0).optional(),
  unit: z.string().optional(),
  aisle: z.string().optional(),
  notes: z.string().optional(),
});

// Nutrition is per serving. null = not printed / unknown.
const extraFields = {
  kcal_per_serving: z.number().int().min(0),
  carbs_g: z.number().min(0),
  protein_g: z.number().min(0),
  fat_g: z.number().min(0),
  freezable: z.boolean().describe("Can be frozen"),
  freezer_months: z.number().int().positive().describe("Max months in the freezer; requires freezable"),
  fridge_days: z.number().int().positive(),
  reheating: z.string(),
  is_base_recipe: z.boolean().describe("A batch base that other recipes build on"),
  is_multi_serve: z.boolean().describe("Cooked in a batch and eaten over several meals"),
};

const LIST_COLUMNS =
  "id, name, description, servings, prep_minutes, cook_minutes, tags, meal_types, difficulty, rating, is_seed, kcal_per_serving, carbs_g, protein_g, fat_g, freezable, is_base_recipe, is_multi_serve";


const ISO_DATE = z.string().refine(isIsoDate, "Use a real date as YYYY-MM-DD");

/** Scaled, merged, aisle-grouped list for recipes at given servings (shared by the list tools). */
type ShoppingResult = { error: string } | { list: ReturnType<typeof buildShoppingList> };

async function shoppingListFor(recipes: { recipe_id: string; servings?: number }[]): Promise<ShoppingResult> {
  const ids = [...new Set(recipes.map((r) => r.recipe_id))];
  const [recipeRes, ingRes] = await Promise.all([
    db.from("recipes").select("id, name, servings").in("id", ids),
    db.from("ingredients").select("recipe_id, name, quantity, unit, aisle, notes").in("recipe_id", ids),
  ]);
  if (recipeRes.error) return { error: recipeRes.error.message };
  if (ingRes.error) return { error: ingRes.error.message };

  const known = new Map(recipeRes.data.map((r) => [r.id, r]));
  const missing = ids.filter((i) => !known.has(i));
  if (missing.length) return { error: `Unknown recipe ids: ${missing.join(", ")}` };

  // Merge duplicate recipe entries by summing servings.
  const totals = new Map<string, number>();
  for (const r of recipes) {
    const base = known.get(r.recipe_id)!.servings;
    totals.set(r.recipe_id, (totals.get(r.recipe_id) ?? 0) + (r.servings ?? base));
  }
  const planned = [...totals].map(([recipe_id, servings]) => {
    const r = known.get(recipe_id)!;
    return { recipe_id, name: r.name, recipe_servings: r.servings, servings };
  });

  const rows = ingRes.data.map((i) => ({ ...i, quantity: i.quantity === null ? null : Number(i.quantity) }));
  return { list: buildShoppingList(planned, rows as IngredientRow[]) };
}

server.registerTool(
  "list_recipes",
  {
    description:
      "List recipes (without ingredients or instructions). Use this to pick meals for a plan. " +
      "Optionally filter by meal type, difficulty, tag, search text, max total minutes or minimum rating.",
    inputSchema: {
      meal_type: z.enum(MEAL_TYPES).optional().describe("Recipe must be tagged with this meal type"),
      difficulty: z
        .array(z.enum(DIFFICULTIES))
        .optional()
        .describe("Recipe difficulty must be ONE of these, e.g. ['easy','medium']"),
      tags: z.array(z.string()).optional().describe("Recipe must have ALL of these tags"),
      search: z.string().optional().describe("Case-insensitive match on the recipe name"),
      max_minutes: z.number().int().positive().optional().describe("Max prep + cook minutes"),
      min_rating: z.number().int().min(1).max(5).optional(),
    },
  },
  async ({ meal_type, difficulty, tags, search, max_minutes, min_rating }) => {
    let q = db.from("recipes").select(LIST_COLUMNS).order("name");
    if (meal_type) q = q.contains("meal_types", [meal_type]);
    if (difficulty?.length) q = q.in("difficulty", difficulty);
    if (tags?.length) q = q.contains("tags", tags);
    if (search) q = q.ilike("name", `%${search.replace(/[%_]/g, "\\$&")}%`);
    if (min_rating) q = q.gte("rating", min_rating);
    const { data, error } = await q;
    if (error) return fail(error.message);
    const rows = (data ?? []).filter(
      (r) => !max_minutes || (r.prep_minutes ?? 0) + (r.cook_minutes ?? 0) <= max_minutes,
    );
    return json(rows);
  },
);

server.registerTool(
  "get_recipe",
  {
    description: "Get one recipe in full: details, instructions and ingredients. Look up by id or exact name.",
    inputSchema: {
      id: z.string().uuid().optional(),
      name: z.string().optional(),
    },
  },
  async ({ id, name }) => {
    if (!id && !name) return fail("Provide id or name");
    const q = db.from("recipes").select("*, ingredients(*)");
    const { data, error } = await (id ? q.eq("id", id) : q.ilike("name", name!)).maybeSingle();
    if (error) return fail(error.message);
    return data ? json(data) : fail("Recipe not found");
  },
);

server.registerTool(
  "get_shopping_list",
  {
    description:
      "Build a combined shopping list for a meal plan. Ingredients are scaled to the requested " +
      "servings, merged by name + unit across recipes, and grouped by aisle. " +
      "Repeat a recipe_id only if it is cooked more than once - add up the servings instead.",
    inputSchema: {
      recipes: z
        .array(
          z.object({
            recipe_id: z.string().uuid(),
            servings: z.number().positive().optional().describe("Defaults to the recipe's own servings"),
          }),
        )
        .min(1),
    },
  },
  async ({ recipes }) => {
    const result = await shoppingListFor(recipes);
    return "error" in result ? fail(result.error) : json(result.list);
  },
);

server.registerTool(
  "add_recipe",
  {
    description:
      "Add a new recipe with its ingredients. Use consistent lowercase ingredient names and units " +
      "(g, ml, tsp, tbsp) so shopping lists merge cleanly. aisle examples: Produce, Meat, Dairy, Bakery, Tins & Dry Goods, Spices.",
    inputSchema: {
      name: z.string().min(1),
      description: z.string().optional(),
      servings: z.number().int().positive().default(4),
      prep_minutes: z.number().int().min(0).optional(),
      cook_minutes: z.number().int().min(0).optional(),
      instructions: z.string().optional().describe("Step-by-step method, one step per line"),
      meal_types: z.array(z.enum(MEAL_TYPES)).default([]),
      difficulty: z.enum(DIFFICULTIES).optional(),
      tags: z.array(z.string()).default([]),
      source_url: z.string().url().optional(),
      kcal_per_serving: extraFields.kcal_per_serving.optional(),
      carbs_g: extraFields.carbs_g.optional(),
      protein_g: extraFields.protein_g.optional(),
      fat_g: extraFields.fat_g.optional(),
      freezable: extraFields.freezable.optional(),
      freezer_months: extraFields.freezer_months.optional(),
      fridge_days: extraFields.fridge_days.optional(),
      reheating: extraFields.reheating.optional(),
      is_base_recipe: extraFields.is_base_recipe.optional(),
      is_multi_serve: extraFields.is_multi_serve.optional(),
      ingredients: z.array(ingredientSchema).min(1),
    },
  },
  async ({ ingredients, ...recipe }) => {
    const { data, error } = await db.from("recipes").insert(recipe).select("id, name").single();
    if (error) {
      return fail(error.code === "23505" ? `A recipe called "${recipe.name}" already exists` : error.message);
    }
    const { error: ingError } = await db
      .from("ingredients")
      .insert(ingredients.map((i) => ({ ...i, recipe_id: data.id })));
    if (ingError) {
      await db.from("recipes").delete().eq("id", data.id); // no partial recipes
      return fail(`Ingredients failed, recipe not saved: ${ingError.message}`);
    }
    return json({ added: data, ingredient_count: ingredients.length });
  },
);

server.registerTool(
  "rate_recipe",
  {
    description: "Set the 1-5 star rating on a recipe (5 = loved it). Overwrites any previous rating.",
    inputSchema: {
      id: z.string().uuid(),
      rating: z.number().int().min(1).max(5),
    },
  },
  async ({ id, rating }) => {
    const { data, error } = await db
      .from("recipes")
      .update({ rating })
      .eq("id", id)
      .select("id, name, rating")
      .maybeSingle();
    if (error) return fail(error.message);
    return data ? json(data) : fail("Recipe not found");
  },
);

server.registerTool(
  "update_recipe",
  {
    description:
      "Edit an existing recipe. Only the fields you pass are changed; pass null to clear an optional field. " +
      "If you pass `ingredients` it REPLACES the whole ingredient list, so send every ingredient, not just the changed one. " +
      "Use get_recipe first to see the current values. Use rate_recipe to change the rating.",
    inputSchema: {
      id: z.string().uuid(),
      name: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      servings: z.number().int().positive().optional(),
      prep_minutes: z.number().int().min(0).nullable().optional(),
      cook_minutes: z.number().int().min(0).nullable().optional(),
      instructions: z.string().nullable().optional().describe("Step-by-step method, one step per line"),
      meal_types: z.array(z.enum(MEAL_TYPES)).optional(),
      difficulty: z.enum(DIFFICULTIES).nullable().optional(),
      tags: z.array(z.string()).optional(),
      source_url: z.string().url().nullable().optional(),
      kcal_per_serving: extraFields.kcal_per_serving.nullable().optional(),
      carbs_g: extraFields.carbs_g.nullable().optional(),
      protein_g: extraFields.protein_g.nullable().optional(),
      fat_g: extraFields.fat_g.nullable().optional(),
      freezable: extraFields.freezable.optional(),
      freezer_months: extraFields.freezer_months.nullable().optional(),
      fridge_days: extraFields.fridge_days.nullable().optional(),
      reheating: extraFields.reheating.nullable().optional(),
      is_base_recipe: extraFields.is_base_recipe.optional(),
      is_multi_serve: extraFields.is_multi_serve.optional(),
      ingredients: z.array(ingredientSchema).min(1).optional().describe("Full replacement ingredient list"),
    },
  },
  async ({ id, ingredients, ...fields }) => {
    const changes = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (!Object.keys(changes).length && !ingredients) return fail("Nothing to update");

    const { data: existing, error: findError } = await db
      .from("recipes")
      .select("id, name")
      .eq("id", id)
      .maybeSingle();
    if (findError) return fail(findError.message);
    if (!existing) return fail("Recipe not found");

    if (Object.keys(changes).length) {
      const { error } = await db.from("recipes").update(changes).eq("id", id);
      if (error) {
        return fail(
          error.code === "23505" ? `A recipe called "${fields.name}" already exists` : error.message,
        );
      }
    }

    if (ingredients) {
      // No transactions in supabase-js: snapshot, swap, and restore the snapshot if the insert fails.
      const { data: old, error: oldError } = await db
        .from("ingredients")
        .select("recipe_id, name, quantity, unit, aisle, notes")
        .eq("recipe_id", id);
      if (oldError) return fail(`Recipe fields updated, ingredients untouched: ${oldError.message}`);
      const { error: delError } = await db.from("ingredients").delete().eq("recipe_id", id);
      if (delError) return fail(`Recipe fields updated, ingredients untouched: ${delError.message}`);
      const { error: insError } = await db
        .from("ingredients")
        .insert(ingredients.map((i) => ({ ...i, recipe_id: id })));
      if (insError) {
        const { error: restoreError } = await db.from("ingredients").insert(old ?? []);
        return fail(
          `Ingredients failed (${insError.message}); ` +
            (restoreError
              ? `RESTORE ALSO FAILED, ingredients were lost: ${restoreError.message}`
              : "original ingredients restored. Recipe fields were updated."),
        );
      }
    }

    const { data, error } = await db.from("recipes").select("*, ingredients(*)").eq("id", id).single();
    return error ? fail(error.message) : json(data);
  },
);

server.registerTool(
  "delete_recipe",
  {
    description:
      "Permanently delete a recipe and its ingredients. Cannot be undone. " +
      "Confirm with the user before calling, and look the recipe up first so you delete the right one.",
    inputSchema: { id: z.string().uuid() },
  },
  async ({ id }) => {
    const { data, error } = await db
      .from("recipes")
      .delete()
      .eq("id", id)
      .select("id, name")
      .maybeSingle();
    if (error) return fail(error.message);
    return data ? json({ deleted: data }) : fail("Recipe not found");
  },
);

// ---- People & meal planning -------------------------------------------------------------------

const WEEK_NOTE = "Weeks run Monday to Sunday. Dates are YYYY-MM-DD.";

server.registerTool(
  "list_people",
  {
    description:
      "List the people who eat the meal plan, with their daily kcal target and default portion " +
      "(recipe servings per meal). Meals are shared; portions are per person.",
    inputSchema: {},
  },
  async () => {
    const { data, error } = await db
      .from("people")
      .select("id, name, daily_kcal_target, default_servings")
      .order("name");
    return error ? fail(error.message) : json(data);
  },
);

server.registerTool(
  "save_person",
  {
    description:
      "Add a person, or update them if the name already exists (case-insensitive). " +
      "default_servings is how many recipe servings they eat per meal unless a plan entry says otherwise " +
      "(e.g. 1.5 for a bigger portion). daily_kcal_target is optional and only used to show daily totals.",
    inputSchema: {
      name: z.string().min(1),
      daily_kcal_target: z.number().int().positive().nullable().optional(),
      default_servings: z.number().positive().optional(),
    },
  },
  async ({ name, ...fields }) => {
    const changes = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    const { data: existing, error: findError } = await db
      .from("people")
      .select("id")
      .ilike("name", name.trim().replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    if (findError) return fail(findError.message);

    const q = existing
      ? db.from("people").update({ name: name.trim(), ...changes }).eq("id", existing.id)
      : db.from("people").insert({ name: name.trim(), ...changes });
    const { data, error } = await q.select("id, name, daily_kcal_target, default_servings").single();
    return error ? fail(error.message) : json({ saved: data, created: !existing });
  },
);

server.registerTool(
  "save_meal_plan",
  {
    description:
      "Save a meal plan. REPLACES everything between `from` and `to` (inclusive) with `entries` in one " +
      "all-or-nothing step, so send the whole range you want to end up with. Pass `meal` to replace only that " +
      "meal across the range (e.g. swap just one dinner: from = to = that date, meal = dinner, one entry). " +
      "Pass an empty `entries` array to clear the range. Slots are breakfast, lunch, dinner; a slot can hold " +
      "several recipes (a main and a side). Everyone in list_people gets their default portion unless you set " +
      "`servings` per person, e.g. { \"James\": 1.5 }; set a person to 0 if they skip that meal. " +
      "Returns the saved plan with per-person kcal per day. " + WEEK_NOTE,
    inputSchema: {
      from: ISO_DATE,
      to: ISO_DATE,
      meal: z.enum(PLAN_MEALS).optional().describe("Only replace this meal within the range"),
      entries: z.array(
        z.object({
          date: ISO_DATE,
          meal: z.enum(PLAN_MEALS),
          recipe_id: z.string().uuid(),
          notes: z.string().optional(),
          servings: z.record(z.string(), z.number().min(0)).optional().describe("Person name -> servings"),
        }),
      ),
    },
  },
  async ({ from, to, meal, entries }) => {
    if (from > to) return fail("`from` is after `to`");

    const { data: people, error: peopleError } = await db.from("people").select("id, name, default_servings");
    if (peopleError) return fail(peopleError.message);
    const mapped = toDbEntries(entries, people ?? []);
    if (!mapped.ok) return fail(mapped.error);

    const recipeIds = [...new Set(entries.map((e) => e.recipe_id))];
    if (recipeIds.length) {
      const { data: found, error } = await db.from("recipes").select("id").in("id", recipeIds);
      if (error) return fail(error.message);
      const known = new Set((found ?? []).map((r) => r.id));
      const missing = recipeIds.filter((id) => !known.has(id));
      if (missing.length) return fail(`Unknown recipe ids: ${missing.join(", ")}`);
    }

    const { data: saved, error } = await db.rpc("replace_meal_plan", {
      p_from: from,
      p_to: to,
      p_entries: mapped.entries,
      p_meal: meal ?? null,
    });
    if (error) {
      return fail(
        error.code === "23505"
          ? "The same recipe appears twice in one meal slot. Nothing was saved."
          : `Nothing was saved: ${error.message}`,
      );
    }
    const { data: plan, error: readError } = await db.rpc("get_meal_plan", { p_from: from, p_to: to });
    return readError ? fail(`Saved ${saved} entries, but reading the plan back failed: ${readError.message}`) : json({ saved, plan });
  },
);

server.registerTool(
  "get_meal_plan",
  {
    description:
      "Get the meal plan for a date range: every date (empty days included) with its breakfast, lunch and " +
      "dinner entries, each person's servings and kcal, and each person's kcal total per day against their " +
      "target. `entries_missing_kcal` counts recipes with no kcal on record, so a total may be understated. " +
      "Max range is 92 days. " + WEEK_NOTE,
    inputSchema: { from: ISO_DATE, to: ISO_DATE },
  },
  async ({ from, to }) => {
    const { data, error } = await db.rpc("get_meal_plan", { p_from: from, p_to: to });
    return error ? fail(error.message) : json(data);
  },
);

server.registerTool(
  "get_plan_shopping_list",
  {
    description:
      "Shopping list for everything planned between two dates. Each recipe is scaled to the total servings " +
      "eaten across all people and days, ingredients are merged by name + unit, and grouped by aisle. " +
      "Use this instead of get_shopping_list once a plan is saved. " + WEEK_NOTE,
    inputSchema: { from: ISO_DATE, to: ISO_DATE },
  },
  async ({ from, to }) => {
    if (from > to) return fail("`from` is after `to`");
    const { data, error } = await db
      .from("meal_plan_entries")
      .select("recipe_id, meal_plan_portions(servings)")
      .gte("plan_date", from)
      .lte("plan_date", to);
    if (error) return fail(error.message);

    const totals = totalServingsByRecipe(data ?? []);
    if (!totals.length) return fail("Nothing is planned in that range");
    const result = await shoppingListFor(totals);
    return "error" in result ? fail(result.error) : json(result.list);
  },
);

await server.connect(new StdioServerTransport());
console.error("home-recipe MCP server running on stdio");
