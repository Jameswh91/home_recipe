import { NextResponse } from "next/server";
import { BUCKET, db } from "@/lib/db";
import { discardRequestSchema } from "@/lib/schema";

/** Marks a pending import discarded and deletes its photo. Never touches a photo a recipe uses. */
export async function POST(request: Request) {
  const parsed = discardRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { importId } = parsed.data;

  const { data: log, error } = await db()
    .from("recipe_imports")
    .select("status, image_path")
    .eq("id", importId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!log) return NextResponse.json({ error: "Unknown import" }, { status: 404 });
  if (log.status !== "pending") return NextResponse.json({ discarded: false, reason: `already ${log.status}` });

  const { data: inUse } = await db().from("recipes").select("id").eq("source_image_path", log.image_path).limit(1);
  if (!inUse?.length) {
    const removed = await db().storage.from(BUCKET).remove([log.image_path]);
    if (removed.error) return NextResponse.json({ error: removed.error.message }, { status: 500 });
  }
  await db().from("recipe_imports").update({ status: "discarded" }).eq("id", importId).eq("status", "pending");
  return NextResponse.json({ discarded: true });
}
