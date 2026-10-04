# home_recipe

Recipe + ingredient database (Supabase) with an MCP server on top, so Claude can
build a weekly meal plan and a shopping list from it.

## Layout
- `supabase/migrations/` schema, source of truth
- `server/` local MCP server (TypeScript, stdio)

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

## Dev
- `npm run typecheck` / `npm test` (in `server/`)

## Notes
- Recipes created before the `is_seed` migration are flagged `is_seed = true` (placeholder data). Once real recipes are loaded: `delete from recipes where is_seed;`
- `.env` is gitignored. The server reads it from the repo root.
- Tables have RLS on with no policies by design: only the service role can access them.
- Manual test checklist: see `TESTING.md`.
- Mobile later: needs a hosted remote MCP server with auth (not built yet).
