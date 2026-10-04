import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "recipe-images";

let client: SupabaseClient | undefined;

/** Server-only: the service role bypasses RLS. Never import this from a client component. */
export function db(): SupabaseClient {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (see .env.example)");
    }
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}
