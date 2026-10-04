# home_recipe

Recipe + ingredient database (Supabase) with an MCP server on top, so Claude can
build a weekly meal plan and a shopping list from it.

## Layout
- `supabase/migrations/` schema, source of truth
- `server/` local MCP server (TypeScript, stdio)
- `web/` photo import app (Next.js, deploys to Vercel with root directory `web`)

## Tools
| Tool | Purpose |
|---|---|
| `list_recipes` | Browse/filter recipes (meal type, difficulty, tags, search, max minutes, min rating) |
| `get_recipe` | Full recipe with ingredients and instructions |
| `get_shopping_list` | Scaled, merged shopping list grouped by aisle for a set of recipes |
| `add_recipe` | Add a recipe + ingredients (with meal types, difficulty, method) |
| `rate_recipe` | Set a 1-5 rating |
| `update_recipe` | Edit fields; passing `ingredients` replaces the whole list |
| `delete_recipe` | Permanently delete a recipe and its ingredients |

## Setup (Claude desktop, Node 20+)
1. `cp .env.example .env` and fill in `SUPABASE_SERVICE_ROLE_KEY`
   (Supabase dashboard > Project Settings > API Keys). Keep it server-side; never commit it.
2. `cd server && npm install`
3. Add to Claude desktop's config (Settings > Developer > Edit Config), using your absolute path:
   ```json
   {
     "mcpServers": {
       "home-recipe": {
         "command": "npx",
         "args": ["tsx", "/ABSOLUTE/PATH/TO/home_recipe/server/src/index.ts"]
       }
     }
   }
   ```
4. Restart Claude desktop, then try: *"Plan dinners for this week using recipes rated 4+ and make me a shopping list."*

## Photo import (`web/`)
Upload or take a photo of a cookbook page -> Claude reads it -> you review/edit the extracted fields,
each with a confidence score -> Confirm saves the recipe + ingredients to Supabase. The photo is kept in the
private `recipe-images` bucket and linked via `recipes.source_image_path`. If the name already exists you
choose to overwrite it (rating kept) or rename.

- Confidence = the model's own per-field score, capped by sanity checks (e.g. macros can't exceed total kcal). Treat it as a prompt to look, not a guarantee.
- Env (Vercel project settings, or `.env` for local): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `APP_PASSWORD`.
- Local: `cd web && npm install && npm run dev` (reads `web/.env.local`, not the repo-root `.env`).
- Photos are resized in the browser (max 2000px) to stay under Vercel's 4.5 MB request limit.
- Not captured yet: source book/page, ingredient groups (to-serve items are imported as ingredients with notes "to serve"; "to accompany" and tips are appended to the method), related-recipe links.

## Dev
- `npm run typecheck` / `npm test` (in `server/` and in `web/`)

## Notes
- Recipes created before the `is_seed` migration are flagged `is_seed = true` (placeholder data). Once real recipes are loaded: `delete from recipes where is_seed;`
- `.env` is gitignored. The server reads it from the repo root.
- Tables have RLS on with no policies by design: only the service role can access them.
- Manual test checklist: see `TESTING.md`.
- Mobile later: needs a hosted remote MCP server with auth (not built yet).
