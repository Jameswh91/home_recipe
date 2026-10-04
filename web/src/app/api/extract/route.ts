import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { scoreExtraction } from "@/lib/confidence";
import { BUCKET, db } from "@/lib/db";
import { ExtractionError, extractRecipe, type ImageType } from "@/lib/extract";
import { findByName } from "@/lib/save";

export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel function bodies cap at 4.5 MB; the client downscales first.

/** Trust the bytes, not the Content-Type the browser claimed. */
function sniff(b: Buffer): { type: ImageType; ext: string } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: "image/png", ext: "png" };
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

export async function POST(request: Request) {
  const file = (await request.formData()).get("image");
  if (!(file instanceof File)) return NextResponse.json({ error: "Attach an image" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image is over 4 MB" }, { status: 413 });

  const bytes = Buffer.from(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image" }, { status: 415 });

  try {
    const extraction = await extractRecipe(bytes, kind.type);
    const imagePath = `${randomUUID()}.${kind.ext}`;
    const upload = await db().storage.from(BUCKET).upload(imagePath, bytes, { contentType: kind.type });
    if (upload.error) throw new Error(`Saving the photo failed: ${upload.error.message}`);

    const existing = extraction.recipe.name.trim() ? await findByName(extraction.recipe.name) : null;
    return NextResponse.json({ imagePath, extraction, scored: scoreExtraction(extraction), existing });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed";
    console.error("extract failed:", e);
    return NextResponse.json({ error: message }, { status: e instanceof ExtractionError ? 422 : 500 });
  }
}
