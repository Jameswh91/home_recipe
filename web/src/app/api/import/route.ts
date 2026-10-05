import { NextResponse } from "next/server";
import { diffExtraction } from "@/lib/corrections";
import { BUCKET, db } from "@/lib/db";
import { importRequestSchema, type Extraction } from "@/lib/schema";
import { saveRecipe } from "@/lib/save";

export async function POST(request: Request) {
  const parsed = importRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`);
    return NextResponse.json({ error: "Invalid recipe", issues }, { status: 400 });
  }
  const { recipe, importId, mode } = parsed.data;

  const { data: log, error: logError } = await db()
    .from("recipe_imports")
    .select("status, image_path, extracted")
    .eq("id", importId)
    .maybeSingle();
  if (logError) return NextResponse.json({ error: logError.message }, { status: 500 });
  if (!log) return NextResponse.json({ error: "Unknown import; re-upload the photo" }, { status: 404 });
  if (log.status !== "pending") return NextResponse.json({ error: `This import was already ${log.status}` }, { status: 409 });

  const photo = await db().storage.from(BUCKET).exists(log.image_path);
  if (photo.error || !photo.data) return NextResponse.json({ error: "Photo not found; re-upload it" }, { status: 400 });

  const result = await saveRecipe(recipe, log.image_path, mode);
  if (!result.ok) {
    if ("conflict" in result) return NextResponse.json({ error: "A recipe with that name exists", existing: result.conflict }, { status: 409 });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // The recipe is saved; a failure to write the log must not turn that into an error for the user.
  const { changed_fields, ingredient_edits } = diffExtraction((log.extracted as Extraction).recipe, recipe);
  const { error: updateError } = await db()
    .from("recipe_imports")
    .update({
      status: "confirmed", confirmed: recipe, changed_fields, ingredient_edits, mode,
      recipe_id: result.id, confirmed_at: new Date().toISOString(),
    })
    .eq("id", importId)
    .eq("status", "pending");
  if (updateError) console.error("import log update failed:", updateError.message);

  return NextResponse.json(result);
}
