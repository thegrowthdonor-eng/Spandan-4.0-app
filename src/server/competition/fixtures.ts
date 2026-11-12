import type { SupabaseClient } from "@supabase/supabase-js";
import type { FixtureItem } from "@/app/admin/fixtures/fixtures-client";

/** Load an event's canonical fixture schedule together with start timestamps. */
export async function loadEventFixtures(client: SupabaseClient, eventId: string): Promise<{ fixtures: FixtureItem[]; error: boolean }> {
  const [{ data, error }, { data: startData, error: startError }] = await Promise.all([
    client.rpc("list_event_fixtures", { p_event_id: eventId }),
    client.from("fixtures").select("id, actual_started_at").eq("event_id", eventId),
  ]);
  if (error || startError) return { fixtures: [], error: true };
  const startedAtById = new Map((startData ?? []).map((row) => [row.id as string, (row.actual_started_at as string | null) ?? null]));
  const fixtures = ((data ?? []) as FixtureItem[]).map((fixture) => ({
    ...fixture,
    actual_started_at: startedAtById.get(fixture.fixture_id) ?? null,
  }));
  return { fixtures, error: false };
}

