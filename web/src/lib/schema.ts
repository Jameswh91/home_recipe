import { z } from "zod";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "dessert", "snack", "side"] as const;
export const DIFFICULTIES = ["easy", "medium", "hard"] as const;

const ingredient = z.object({
  name: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  aisle: z.string().nullable(),
  notes: z.string().nullable(),
});

const recipeFields = {
  name: z.string(),
  description: z.string().nullable(),
  servings: z.number().int().nullable(),
  prep_minutes: z.number().int().nullable(),
  cook_minutes: z.number().int().nullable(),
  instructions: z.string(),
  // Plain strings, not enums: the SDK's JSON schema transform doesn't enforce enums, so a stray
  // "Dinner" would fail parsing. normalizeExtraction() maps these onto the real vocabularies.
  meal_types: z.array(z.string()).describe(`Any of: ${MEAL_TYPES.join(", ")}`),
  difficulty: z.string().nullable().describe(`One of: ${DIFFICULTIES.join(", ")}`),
  tags: z.array(z.string()),
  kcal_per_serving: z.number().int().nullable(),
  carbs_g: z.number().nullable(),
  protein_g: z.number().nullable(),
  fat_g: z.number().nullable(),
  freezable: z.boolean(),
  freezer_months: z.number().int().nullable(),
  fridge_days: z.number().int().nullable(),
  reheating: z.string().nullable(),
  is_base_recipe: z.boolean(),
  is_multi_serve: z.boolean(),
};

/** Confidence groups shown in the review UI. Each maps to one or more form fields. */
export const CONFIDENCE_GROUPS = [
  "name",
  "servings",
  "timings",
  "ingredients",
  "instructions",
  "nutrition",
  "storage",
  "classification",
] as const;
export type ConfidenceGroup = (typeof CONFIDENCE_GROUPS)[number];

/** What the model returns. Ranges are enforced in confidence.ts, not here (structured outputs ignore min/max). */
export const extractionSchema = z.object({
  recipe: z.object({
    ...recipeFields,
    ingredients: z.array(ingredient.extend({ confidence: z.number() })),
  }),
  confidence: z.object(Object.fromEntries(CONFIDENCE_GROUPS.map((g) => [g, z.number()])) as Record<ConfidenceGroup, z.ZodNumber>),
  warnings: z.array(z.string()),
});
export type Extraction = z.infer<typeof extractionSchema>;

/** What the user confirms and the server saves. Stricter than the model schema: this matches the DB. */
export const recipeInputSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable(),
  servings: z.number().int().positive(),
  prep_minutes: z.number().int().min(0).nullable(),
  cook_minutes: z.number().int().min(0).nullable(),
  instructions: z.string(),
  meal_types: z.array(z.enum(MEAL_TYPES)),
  difficulty: z.enum(DIFFICULTIES).nullable(),
  tags: z.array(z.string().trim().min(1)),
  kcal_per_serving: z.number().int().min(0).nullable(),
  carbs_g: z.number().min(0).nullable(),
  protein_g: z.number().min(0).nullable(),
  fat_g: z.number().min(0).nullable(),
  freezable: z.boolean(),
  freezer_months: z.number().int().positive().nullable(),
  fridge_days: z.number().int().positive().nullable(),
  reheating: z.string().nullable(),
  is_base_recipe: z.boolean(),
  is_multi_serve: z.boolean(),
  ingredients: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        quantity: z.number().min(0).nullable(),
        unit: z.string().nullable(),
        aisle: z.string().nullable(),
        notes: z.string().nullable(),
      }),
    )
    .min(1),
});
export type RecipeInput = z.infer<typeof recipeInputSchema>;

export const importRequestSchema = z.object({
  importId: z.string().uuid(),
  recipe: recipeInputSchema,
  /** `create` fails with 409 if the name exists; `overwrite` replaces that recipe (keeps its rating). */
  mode: z.enum(["create", "overwrite"]),
});

export const discardRequestSchema = z.object({ importId: z.string().uuid() });
