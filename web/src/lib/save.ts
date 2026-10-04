import { BUCKET, db } from "./db";
import type { RecipeInput } from "./schema";

export type ExistingRecipe = { id: string; name: string };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Case-insensitive exact name match (the DB unique index is case-sensitive). */
export async function findByName(name: string): Promise<ExistingRecipe | null> {
  const { data, error } = await db()
    .from("recipes")
    .select("id, name")
    .ilike("name", escapeLike(name.trim()))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export type SaveResult =
  | { ok: true; id: string; name: string; overwrote: boolean }
  | { ok: false; conflict: ExistingRecipe }
  | { ok: false; error: string };

const INGREDIENT_COLUMNS = "recipe_id, name, quantity, unit, aisle, notes";

export async function saveRecipe(input: RecipeInput, imagePath: string, mode: "create" | "overwrite"): Promise<SaveResult> {
  const { ingredients, ...fields } = input;
  const row = { ...fields, name: fields.name.trim(), source_image_path: imagePath };
  const existing = await findByName(row.name);

  if (existing && mode === "create") return { ok: false, conflict: existing };
  return existing ? overwrite(existing, row, ingredients, imagePath) : create(row, ingredients);
}

async function create(row: Record<string, unknown>, ingredients: RecipeInput["ingredients"]): Promise<SaveResult> {
  const { data, error } = await db().from("recipes").insert(row).select("id, name").single();
  if (error) {
    // Lost a race with another insert of the same name.
    if (error.code === "23505") {
      const conflict = await findByName(String(row.name));
      if (conflict) return { ok: false, conflict };
    }
    return { ok: false, error: error.message };
  }
  const { error: ingError } = await db()
    .from("ingredients")
    .insert(ingredients.map((i) => ({ ...i, recipe_id: data.id })));
  if (ingError) {
    await db().from("recipes").delete().eq("id", data.id); // no partial recipes
    return { ok: false, error: `Ingredients failed, recipe not saved: ${ingError.message}` };
  }
  return { ok: true, id: data.id, name: data.name, overwrote: false };
}

/** Replaces fields and ingredients on the existing recipe; keeps its id and rating. */
async function overwrite(
  existing: ExistingRecipe,
  row: Record<string, unknown>,
  ingredients: RecipeInput["ingredients"],
  imagePath: string,
): Promise<SaveResult> {
  // No transactions in supabase-js: snapshot, swap ingredients, update the row, and undo on failure.
  const [oldIngs, oldRecipe] = await Promise.all([
    db().from("ingredients").select(INGREDIENT_COLUMNS).eq("recipe_id", existing.id),
    db().from("recipes").select("source_image_path").eq("id", existing.id).single(),
  ]);
  if (oldIngs.error) return { ok: false, error: `Nothing changed: ${oldIngs.error.message}` };
  if (oldRecipe.error) return { ok: false, error: `Nothing changed: ${oldRecipe.error.message}` };

  const restore = async () => {
    await db().from("ingredients").delete().eq("recipe_id", existing.id);
    const { error } = await db().from("ingredients").insert(oldIngs.data ?? []);
    return error ? ` RESTORE ALSO FAILED, ingredients were lost: ${error.message}` : " Original ingredients restored.";
  };

  const del = await db().from("ingredients").delete().eq("recipe_id", existing.id);
  if (del.error) return { ok: false, error: `Nothing changed: ${del.error.message}` };

  const ins = await db()
    .from("ingredients")
    .insert(ingredients.map((i) => ({ ...i, recipe_id: existing.id })));
  if (ins.error) return { ok: false, error: `Ingredients failed (${ins.error.message}).${await restore()}` };

  const upd = await db().from("recipes").update(row).eq("id", existing.id);
  if (upd.error) return { ok: false, error: `Recipe update failed (${upd.error.message}).${await restore()}` };

  const oldImage = oldRecipe.data.source_image_path as string | null;
  if (oldImage && oldImage !== imagePath) await db().storage.from(BUCKET).remove([oldImage]);
  return { ok: true, id: existing.id, name: String(row.name), overwrote: true };
}
