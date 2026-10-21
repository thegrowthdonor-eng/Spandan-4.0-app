import "server-only";
import type { User } from "@supabase/supabase-js";
import { createRequestClient } from "@/server/supabase/server";

export type ActiveSession = {
  user: User;
  accessState: "active";
};

/** A Supabase identity is not app access until the Treasurer activates it. */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const client = await createRequestClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return null;

  const { data: access } = await client
    .from("access_records")
    .select("state")
    .eq("profile_id", auth.user.id)
    .eq("state", "active")
    .limit(1)
    .maybeSingle();

  return access?.state === "active" ? { user: auth.user, accessState: "active" } : null;
}
