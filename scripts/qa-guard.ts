import type { createClient } from "@supabase/supabase-js";

export function requireQaEnvironment(): ReturnType<typeof createClient> {
  throw new Error("The QA database has been retired. QA seed, sync and verification commands are disabled.");
}

export function requireQaPublicEnvironment(): ReturnType<typeof createClient> {
  throw new Error("The QA database has been retired. QA browser commands are disabled.");
}

export function failIfError(error: { message: string } | null, action: string) {
  if (error) throw new Error(`${action}: ${error.message}`);
}
