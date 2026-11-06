import "server-only";
import { cache } from "react";
import { createRequestClient } from "@/server/supabase/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import type { ManagementSummary } from "@/lib/management";

export const getManagementSummary = cache(async (): Promise<ManagementSummary | null> => {
  if (!hasPublicSupabaseConfiguration()) return null;
  const client = await createRequestClient();
  const { data, error } = await client.rpc("get_management_summary");
  return error ? null : data as ManagementSummary;
});

export const hasManagementAccess = cache(async () => {
  if (!hasPublicSupabaseConfiguration()) return false;
  const client = await createRequestClient();
  const { data } = await client.rpc("can_use_management");
  return data === true;
});
