import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requiredServerEnv } from "@/server/env";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return createClient(url, requiredServerEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
