"use client";

import { useRef, useState } from "react";
import { bandOf, HIGH, type Band, type GroupScore, type Scored } from "@/lib/confidence";
import { DIFFICULTIES, MEAL_TYPES, type ConfidenceGroup, type Extraction } from "@/lib/schema";

type FormIngredient = { name: string; quantity: string; unit: string; aisle: string; notes: string; score: number };
type Form = {
  name: string; description: string; servings: string; prep: string; cook: string;
  instructions: string; meal_types: string[]; difficulty: string; tags: string;
  kcal: string; carbs: string; protein: string; fat: string;
  freezable: boolean; freezer_months: string; fridge_days: string; reheating: string;
  is_base_recipe: boolean; is_multi_serve: boolean;
  ingredients: FormIngredient[];
};
type Extracted = { imagePath: string; extraction: Extraction; scored: Scored; existing: { id: string; name: string } | null };
type Step = "idle" | "extracting" | "review" | "saving" | "saved";

const str = (n: number | string | null | undefined) => (n === null || n === undefined ? "" : String(n));
const num = (s: string) => (s.trim() === "" ? null : Number(s));

function toForm({ recipe: r }: Extraction, scored: Scored): Form {
  return {
    name: r.name, description: str(r.description), servings: str(r.servings ?? 4),
    prep: str(r.prep_minutes), cook: str(r.cook_minutes), instructions: r.instructions,
    meal_types: r.meal_types, difficulty: str(r.difficulty), tags: r.tags.join(", "),
    kcal: str(r.kcal_per_serving), carbs: str(r.carbs_g), protein: str(r.protein_g), fat: str(r.fat_g),
    freezable: r.freezable, freezer_months: str(r.freezer_months), fridge_days: str(r.fridge_days),
    reheating: str(r.reheating), is_base_recipe: r.is_base_recipe, is_multi_serve: r.is_multi_serve,
    ingredients: r.ingredients.map((i, n) => ({
      name: i.name, quantity: str(i.quantity), unit: str(i.unit), aisle: str(i.aisle), notes: str(i.notes),
      score: scored.ingredients[n] ?? 0,
    })),
  };
}

function toPayload(f: Form) {
  const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
  return {
    name: f.name, description: orNull(f.description), servings: num(f.servings),
    prep_minutes: num(f.prep), cook_minutes: num(f.cook), instructions: f.instructions,
    meal_types: f.meal_types, difficulty: orNull(f.difficulty),
    tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    kcal_per_serving: num(f.kcal), carbs_g: num(f.carbs), protein_g: num(f.protein), fat_g: num(f.fat),
    freezable: f.freezable, freezer_months: num(f.freezer_months), fridge_days: num(f.fridge_days),
    reheating: orNull(f.reheating), is_base_recipe: f.is_base_recipe, is_multi_serve: f.is_multi_serve,
    ingredients: f.ingredients
      .filter((i) => i.name.trim())
      .map((i) => ({ name: i.name, quantity: num(i.quantity), unit: orNull(i.unit), aisle: orNull(i.aisle), notes: orNull(i.notes) })),
  };
}

/** Phone photos are 4-12 MB; Vercel caps request bodies at 4.5 MB. Resize and re-encode in the browser. */
async function downscale(file: File, maxEdge = 2000): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't process that image"))), "image/jpeg", 0.85),
  );
}

async function post<T>(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; body: T & { error?: string; issues?: string[] } }> {
  const res = await fetch(url, init);
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => ({ error: `HTTP ${res.status}` })) };
}

/** Top-level on purpose: a component defined inside Importer would remount its inputs on every keystroke. */
function GroupBox({ g, done, onReview, title, children }: {
  g?: GroupScore; done: boolean; onReview: () => void; title: string; children: React.ReactNode;
}) {
  const band: Band = g ? bandOf(g.score) : "high";
  return (
    <fieldset className={`group ${done ? "done" : band}`}>
      <legend>
        {title}
        {g && <span className={`pill ${done ? "done" : band}`}>{done ? "reviewed" : `${Math.round(g.score * 100)}%`}</span>}
      </legend>
      {g && !done && g.reasons.map((r) => <p key={r} className="reason">{r}</p>)}
      {children}
      {g && !done && band !== "high" && (
        <button type="button" className="link" onClick={onReview}>Looks right</button>
      )}
    </fieldset>
  );
}

export function Importer() {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [data, setData] = useState<Extracted | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [reviewed, setReviewed] = useState<Set<ConfidenceGroup>>(new Set());
  const [existing, setExisting] = useState<Extracted["existing"]>(null);
  const [savedName, setSavedName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("idle"); setError([]); setData(null); setForm(null); setExisting(null); setReviewed(new Set());
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError([]); setStep("extracting");
    try {
      const blob = await downscale(file);
      setPreview(URL.createObjectURL(blob));
      const body = new FormData();
      body.append("image", blob, "page.jpg");
      const res = await post<Extracted>("/api/extract", { method: "POST", body });
      if (!res.ok) throw new Error(res.body.error ?? "Extraction failed");
      setData(res.body); setForm(toForm(res.body.extraction, res.body.scored)); setExisting(res.body.existing);
      setReviewed(new Set()); setStep("review");
    } catch (e) {
      setError([e instanceof Error ? e.message : "Something went wrong"]); setStep("idle");
    }
  }

  async function discard() {
    if (data) await post("/api/discard", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imagePath: data.imagePath }) });
    reset();
  }

  async function confirm(mode: "create" | "overwrite") {
    if (!data || !form) return;
    setError([]); setStep("saving");
    const res = await post<{ name: string; existing?: Extracted["existing"] }>("/api/import", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ imagePath: data.imagePath, recipe: toPayload(form), mode }),
    });
    if (res.ok) { setSavedName(res.body.name); setStep("saved"); return; }
    if (res.status === 409 && res.body.existing) setExisting(res.body.existing);
    setError(res.body.issues ?? [res.body.error ?? "Save failed"]); setStep("review");
  }

  const set = (group: ConfidenceGroup, patch: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setReviewed((r) => new Set(r).add(group));
  };
  const setIngredient = (n: number, patch: Partial<FormIngredient>) =>
    set("ingredients", { ingredients: form!.ingredients.map((x, i) => (i === n ? { ...x, ...patch } : x)) });

  if (step === "saved") {
    return (
      <section className="card">
        <p className="ok">Saved “{savedName}”.</p>
        <button onClick={reset}>Import another</button>
      </section>
    );
  }

  if (!form || !data) {
    return (
      <section className="card">
        <p className="muted">Take or choose a photo of one cookbook page. Make sure the whole page is in frame.</p>
        <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => onPick(e.target.files?.[0])} />
        <button disabled={step === "extracting"} onClick={() => fileInput.current?.click()}>
          {step === "extracting" ? "Reading the page…" : "Choose photo"}
        </button>
        {error.map((e) => <p key={e} className="error">{e}</p>)}
      </section>
    );
  }

  const { scored } = data;
  const busy = step === "saving";
  const flagged = (Object.keys(scored.groups) as ConfidenceGroup[]).filter(
    (g) => scored.groups[g]!.score < HIGH && !reviewed.has(g),
  );

  const gp = (id: ConfidenceGroup) => ({
    g: scored.groups[id],
    done: reviewed.has(id),
    onReview: () => setReviewed((r) => new Set(r).add(id)),
  });

  return (
    <div className="review">
      <section className="card summary">
        {preview && <img src={preview} alt="Uploaded cookbook page" />}
        <div>
          <p className={`score ${scored.band}`}>{Math.round(scored.overall * 100)}% overall</p>
          <p className="muted">Model confidence, capped by sanity checks. Check anything highlighted before saving.</p>
          {data.extraction.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
        </div>
      </section>

      {existing && (
        <section className="card conflict">
          <p><strong>“{existing.name}” already exists.</strong> Overwrite it (keeps its rating), or rename this one below.</p>
          <button disabled={busy} onClick={() => confirm("overwrite")}>Overwrite existing</button>
        </section>
      )}

      <GroupBox {...gp("name")} title="Name">
        <input value={form.name} onChange={(e) => set("name", { name: e.target.value })} />
        <textarea rows={2} placeholder="Description" value={form.description} onChange={(e) => set("name", { description: e.target.value })} />
      </GroupBox>

      <GroupBox {...gp("servings")} title="Servings">
        <input inputMode="numeric" value={form.servings} onChange={(e) => set("servings", { servings: e.target.value })} />
      </GroupBox>

      <GroupBox {...gp("timings")} title="Time (minutes)">
        <div className="row">
          <label>Prep<input inputMode="numeric" value={form.prep} onChange={(e) => set("timings", { prep: e.target.value })} /></label>
          <label>Cook<input inputMode="numeric" value={form.cook} onChange={(e) => set("timings", { cook: e.target.value })} /></label>
        </div>
      </GroupBox>

      <GroupBox {...gp("ingredients")} title={`Ingredients (${form.ingredients.length})`}>
        {form.ingredients.map((ing, n) => (
          <div key={n} className={`ing ${bandOf(ing.score)}`}>
            <input className="qty" inputMode="decimal" placeholder="Qty" value={ing.quantity} onChange={(e) => setIngredient(n, { quantity: e.target.value })} />
            <input className="unit" placeholder="Unit" value={ing.unit} onChange={(e) => setIngredient(n, { unit: e.target.value })} />
            <input className="name" placeholder="Ingredient" value={ing.name} onChange={(e) => setIngredient(n, { name: e.target.value })} />
            <input className="aisle" placeholder="Aisle" value={ing.aisle} onChange={(e) => setIngredient(n, { aisle: e.target.value })} />
            <input className="notes" placeholder="Notes" value={ing.notes} onChange={(e) => setIngredient(n, { notes: e.target.value })} />
            <button type="button" className="icon" aria-label="Remove ingredient" onClick={() => set("ingredients", { ingredients: form.ingredients.filter((_, i) => i !== n) })}>✕</button>
          </div>
        ))}
        <button type="button" className="link" onClick={() => set("ingredients", { ingredients: [...form.ingredients, { name: "", quantity: "", unit: "", aisle: "", notes: "", score: 1 }] })}>+ Add ingredient</button>
      </GroupBox>

      <GroupBox {...gp("instructions")} title="Method (one step per line)">
        <textarea rows={10} value={form.instructions} onChange={(e) => set("instructions", { instructions: e.target.value })} />
      </GroupBox>

      <GroupBox {...gp("nutrition")} title="Nutrition per serving">
        <div className="row">
          <label>kcal<input inputMode="numeric" value={form.kcal} onChange={(e) => set("nutrition", { kcal: e.target.value })} /></label>
          <label>Carbs g<input inputMode="decimal" value={form.carbs} onChange={(e) => set("nutrition", { carbs: e.target.value })} /></label>
          <label>Protein g<input inputMode="decimal" value={form.protein} onChange={(e) => set("nutrition", { protein: e.target.value })} /></label>
          <label>Fat g<input inputMode="decimal" value={form.fat} onChange={(e) => set("nutrition", { fat: e.target.value })} /></label>
        </div>
      </GroupBox>

      <GroupBox {...gp("storage")} title="Storage & batch">
        <label className="check"><input type="checkbox" checked={form.freezable} onChange={(e) => set("storage", { freezable: e.target.checked })} />Freezable</label>
        <label className="check"><input type="checkbox" checked={form.is_base_recipe} onChange={(e) => set("storage", { is_base_recipe: e.target.checked })} />Base recipe</label>
        <label className="check"><input type="checkbox" checked={form.is_multi_serve} onChange={(e) => set("storage", { is_multi_serve: e.target.checked })} />Multi serve</label>
        <div className="row">
          <label>Fridge days<input inputMode="numeric" value={form.fridge_days} onChange={(e) => set("storage", { fridge_days: e.target.value })} /></label>
          <label>Freezer months<input inputMode="numeric" value={form.freezer_months} onChange={(e) => set("storage", { freezer_months: e.target.value })} /></label>
        </div>
        <textarea rows={2} placeholder="Reheating" value={form.reheating} onChange={(e) => set("storage", { reheating: e.target.value })} />
      </GroupBox>

      <GroupBox {...gp("classification")} title="Meal type, difficulty & tags (partly inferred)">
        <div className="chips">
          {MEAL_TYPES.map((m) => (
            <label key={m} className="check">
              <input type="checkbox" checked={form.meal_types.includes(m)}
                onChange={(e) => set("classification", { meal_types: e.target.checked ? [...form.meal_types, m] : form.meal_types.filter((x) => x !== m) })} />
              {m}
            </label>
          ))}
        </div>
        <select value={form.difficulty} onChange={(e) => set("classification", { difficulty: e.target.value })}>
          <option value="">Difficulty: not set</option>
          {DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}
        </select>
        <input placeholder="Tags, comma separated" value={form.tags} onChange={(e) => set("classification", { tags: e.target.value })} />
      </GroupBox>

      {error.length > 0 && <section className="card">{error.map((e) => <p key={e} className="error">{e}</p>)}</section>}

      <div className="actions">
        <button disabled={busy} onClick={() => confirm("create")}>
          {busy ? "Saving…" : flagged.length ? `Confirm & save (${flagged.length} unreviewed)` : "Confirm & save"}
        </button>
        <button className="secondary" disabled={busy} onClick={discard}>Discard</button>
      </div>
    </div>
  );
}
