import { NextResponse } from "next/server";
import { BUCKET, db } from "@/lib/db";
import { importRequestSchema } from "@/lib/schema";
import { saveRecipe } from "@/lib/save";

export async function POST(request: Request) {
  const parsed = importRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "request"}: ${i.message}`);
    return NextResponse.json({ error: "Invalid recipe", issues }, { status: 400 });
  }
  const { recipe, imagePath, mode } = parsed.data;

  const photo = await db().storage.from(BUCKET).exists(imagePath);
  if (photo.error || !photo.data) return NextResponse.json({ error: "Photo not found; re-upload it" }, { status: 400 });

  const result = await saveRecipe(recipe, imagePath, mode);
  if (result.ok) return NextResponse.json(result);
  if ("conflict" in result) return NextResponse.json({ error: "A recipe with that name exists", existing: result.conflict }, { status: 409 });
  return NextResponse.json({ error: result.error }, { status: 500 });
}
