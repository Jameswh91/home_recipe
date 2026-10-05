import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { normalizeExtraction } from "./normalize";
import { extractionSchema, type Extraction } from "./schema";

const MODEL = process.env.EXTRACT_MODEL ?? "claude-opus-5-5";

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

// Frozen: nothing per-request goes in here, so it stays cacheable.
const SYSTEM = `You transcribe a photographed cookbook page into a structured recipe for a home recipe database. The photo may be angled, shadowed or cropped.

Transcribe, don't invent. If a value is not printed on the page, return null (or an empty list/string) and leave the matching confidence low rather than guessing. The only exceptions are the fields marked "inferred" below.

Conventions (the database merges shopping lists by name + unit, so be consistent):
- Ingredient names are lowercase and singular where natural, with no quantity, unit or prep text in the name. "4 garlic cloves, peeled and crushed" -> name "garlic clove", quantity 4, unit null, notes "peeled and crushed".
- Units are g, kg, ml, l, tsp, tbsp, or null for counted items. Convert nothing: keep the printed metric amount ("1kg" -> 1 kg, "250g" -> 250 g). Ignore imperial equivalents in brackets.
- "juice of 1 lime" -> name "lime", quantity 1, notes "juiced". "approx." amounts go in notes, with quantity as printed. Items with no amount ("low-calorie cooking spray") have quantity null.
- aisle is one of: Produce, Meat, Fish, Dairy, Bakery, Tins & Dry Goods, Spices, Frozen, Drinks, Other.
- Ingredients under a "to serve" heading are included, with notes starting "to serve" (add "optional" if the page says so). Ingredients under a "to accompany" heading are NOT ingredients: instead add a final line to the instructions, "Serve with: ...", including any extra calories printed.
- instructions: one step per line, in page order, no numbering. Append a "Tip: ..." line if the page has a tip. Keep the cookbook's wording.
- servings: the "serves" number. prep_minutes / cook_minutes: the clock icon is prep and the pan/oven icon is cook, when labelled "10 mins" / "30 mins" style. If only one time is printed and you can't tell which, put it in cook_minutes and lower the timings confidence.
- Nutrition is per serving as printed (kcal, carbs, protein, fat). Leave any macro that is not printed as null.
- Icon badges: map "freeze me" to freezable true; "base recipe" to is_base_recipe true; "multi serve" to is_multi_serve true. Dietary badges (dairy free, gluten free, vegetarian, vegan, high protein, spicy/chilli) become lowercase hyphenated tags such as "dairy-free", "high-protein", "spicy". Add a warning when a badge carries a caveat (e.g. "use DF feta-style cheese").
- Storage: fridge_days and freezer_months from the storage text ("keep in the fridge for up to 4 days", "freeze for up to 3 months"). reheating is the printed reheating instruction, short. If a recipe can't be frozen or nothing is printed, freezable is false and the rest are null.
- Inferred (lower your confidence accordingly): meal_types (breakfast, lunch, dinner, dessert, snack, side; a main with a protein and veg is dinner; use several only when it clearly fits), difficulty (easy/medium/hard from steps and time), and extra tags such as the main protein or cuisine.
- description: one or two sentences summarising the intro, or null.

Confidence is 0 to 1 and about how sure you are that the value matches the page, not how complete the page is. Use 0.95+ for clear print, 0.6-0.8 for partly legible or inferred, below 0.4 for guesses. Score each ingredient individually. Add a warning for anything illegible, cut off, ambiguous, or that you had to infer or reinterpret.`;

const client = new Anthropic();

export class ExtractionError extends Error {}

export type ExtractionResult = { extraction: Extraction; model: string; usage: unknown };

export async function extractRecipe(image: Buffer, mediaType: ImageType): Promise<ExtractionResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    // Transcription is mostly reading; low effort keeps this inside serverless time limits.
    output_config: { effort: "low", format: zodOutputFormat(extractionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image.toString("base64") } },
          { type: "text", text: "Extract the recipe on this page." },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new ExtractionError("The model declined to read this image.");
  if (response.stop_reason === "max_tokens") throw new ExtractionError("The extraction was cut off. Try a tighter crop.");
  if (!response.parsed_output) throw new ExtractionError("Couldn't parse the model's answer. Try again.");
  return { extraction: normalizeExtraction(response.parsed_output), model: response.model, usage: response.usage };
}
