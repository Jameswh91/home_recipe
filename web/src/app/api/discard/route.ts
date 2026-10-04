import { NextResponse } from "next/server";
import { z } from "zod";
import { BUCKET, db } from "@/lib/db";

const body = z.object({ imagePath: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/) });

/** Deletes an uploaded photo the user decided not to import. Never touches a photo a recipe uses. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { imagePath } = parsed.data;

  const { data } = await db().from("recipes").select("id").eq("source_image_path", imagePath).limit(1);
  if (data?.length) return NextResponse.json({ discarded: false, reason: "photo is in use" });

  const { error } = await db().storage.from(BUCKET).remove([imagePath]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ discarded: true });
}
