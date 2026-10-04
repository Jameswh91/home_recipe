# home_recipe

Recipe + ingredient database (Supabase) with an MCP server on top, so an LLM can
build a weekly meal plan and a shopping list from it.

## MVP
- Supabase Postgres: `recipes`, `ingredients` (RLS on, service-role access only)
- Remote MCP server (for the Claude mobile app) with tools:
  `list_recipes`, `get_recipe`, `get_shopping_list`, `add_recipe`, `rate_recipe`

## Layout
- `supabase/migrations/` schema, source of truth
