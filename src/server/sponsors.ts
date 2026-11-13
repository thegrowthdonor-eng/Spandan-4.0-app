import "server-only";
import { cache } from "react";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createPublicClient } from "@/server/supabase/public";
import type { Sponsor } from "@/lib/sponsors";

/** Anonymous access only; database publication policy remains authoritative. */
export const getPublishedSponsors = cache(async (): Promise<Sponsor[]> => {
  if (!hasPublicSupabaseConfiguration()) return [];
  try {
    return await coalesceCached("public-sponsors", [PUBLIC_CACHE_TAGS.sponsors], 120, async () => {
      const { data, error } = await createPublicClient()
        .from("sponsors")
        .select("id,name,tier,logo_url,logo_alt,description,website_url")
        .is("event_id", null)
        .in("state", ["published", "scheduled"])
        .or(`publish_at.is.null,publish_at.lte.${new Date().toISOString()}`)
        .order("sort_order", { ascending: true })
        .order("name")
        .order("id")
        .abortSignal(AbortSignal.timeout(2000));
      if (error) throw new Error(error.message);
      return (data ?? []) as Sponsor[];
    });
  } catch {
    return [];
  }
});
