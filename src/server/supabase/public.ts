import "server-only";
import { createClient } from "@supabase/supabase-js";
import { programmeFetch } from "./programme-fetch";

/** Anonymous client for rows explicitly exposed by public RLS policies. */
export function createPublicClient({ cacheProgramme = false } = {}) {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(cacheProgramme ? { global: { fetch: programmeFetch } } : {}),
  });
}
