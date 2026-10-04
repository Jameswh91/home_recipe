import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { z } from "zod";
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

const LIST_COLUMNS =
  "id, name, description, servings, prep_minutes, cook_minutes, tags, rating";

server.registerTool(
  "list_recipes",
  {
    description:
      "List recipes (without ingredients or instructions). Use this to pick meals for a plan. " +
      "Optionally filter by tag, search text, max total minutes or minimum rating.",
    inputSchema: {
      tags: z.array(z.string()).optional().describe("Recipe must have ALL of these tags"),
      search: z.string().optional().describe("Case-insensitive match on the recipe name"),
      max_minutes: z.number().int().positive().optional().describe("Max prep + cook minutes"),
      min_rating: z.number().int().min(1).max(5).optional(),
    },
  },
  async ({ tags, search, max_minutes, min_rating }) => {
    let q = db.from("recipes").select(LIST_COLUMNS).order("name");
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
    const ids = [...new Set(recipes.map((r) => r.recipe_id))];
    const [recipeRes, ingRes] = await Promise.all([
      db.from("recipes").select("id, name, servings").in("id", ids),
      db.from("ingredients").select("recipe_id, name, quantity, unit, aisle, notes").in("recipe_id", ids),
    ]);
    if (recipeRes.error) return fail(recipeRes.error.message);
    if (ingRes.error) return fail(ingRes.error.message);

    const known = new Map(recipeRes.data.map((r) => [r.id, r]));
    const missing = ids.filter((i) => !known.has(i));
    if (missing.length) return fail(`Unknown recipe ids: ${missing.join(", ")}`);

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
    return json(buildShoppingList(planned, rows as IngredientRow[]));
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
      instructions: z.string().optional(),
      tags: z.array(z.string()).default([]),
      source_url: z.string().url().optional(),
      ingredients: z
        .array(
          z.object({
            name: z.string().min(1),
            quantity: z.number().min(0).optional(),
            unit: z.string().optional(),
            aisle: z.string().optional(),
            notes: z.string().optional(),
          }),
        )
        .min(1),
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

await server.connect(new StdioServerTransport());
console.error("home-recipe MCP server running on stdio");
