import type { SupabaseClient } from "@supabase/supabase-js";
import type { PublishedEventResult, ResultPosition } from "./results";

export function normalizeResultPositions(value: unknown): ResultPosition[] {
  if (!Array.isArray(value)) return [];
  return value.map((position) => {
    const raw = position as Partial<ResultPosition>;
    return {
      placing: Number(raw.placing), batch_id: raw.batch_id ?? null, batch_label: raw.batch_label ?? null,
      winner_name: raw.winner_name ?? null, winner_roll: raw.winner_roll ?? null,
      participant_category: raw.participant_category ?? null, application_id: raw.application_id ?? null,
      group_id: raw.group_id ?? null, points: Number(raw.points ?? 0), note: raw.note ?? null,
    };
  }).filter((position) => Number.isInteger(position.placing) && position.placing > 0);
}

export async function getPublishedResults(client: SupabaseClient): Promise<PublishedEventResult[]> {
  const { data: unifiedData, error: unifiedError } = await client.rpc("unified_event_results");
  if (!unifiedError && Array.isArray(unifiedData) && unifiedData.length > 0) return unifiedData.map((raw) => {
    const item = raw as Omit<PublishedEventResult, "positions"> & { positions: unknown };
    return { ...item, positions: normalizeResultPositions(item.positions) };
  });

  const { data: rpcData, error: rpcError } = await client.rpc("get_published_event_results");
  if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) return rpcData.map((raw) => {
    const item = raw as Omit<PublishedEventResult, "positions"> & { positions: unknown };
    return { ...item, positions: normalizeResultPositions(item.positions) };
  });

  const { data, error } = await client
    .from("result_publications")
    .select("id,published_at,podium_photo_url,podium_caption,events(id,title,slug,category),result_positions(placing,batch_id,note,winner_name,winner_roll,participant_category,application_id,group_id,awarded_points,batches(label))")
    .eq("state", "published")
    .order("published_at", { ascending: false });
  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string; published_at: string | null; podium_photo_url: string | null; podium_caption: string | null;
    events: { id: string; title: string; slug: string; category: string } | null;
    result_positions: Array<{ placing: number; batch_id: string | null; note: string | null; winner_name: string | null; winner_roll: string | null; participant_category: string | null; application_id: string | null; group_id: string | null; awarded_points: number; batches: { label: string } | null }> | null;
  }>).map((publication) => ({
    event_id: publication.events?.id ?? publication.id,
    event_title: publication.events?.title ?? "Event",
    event_slug: publication.events?.slug ?? "",
    category: publication.events?.category ?? "event",
    published_at: publication.published_at,
    podium_photo_url: publication.podium_photo_url,
    podium_caption: publication.podium_caption,
    positions: (publication.result_positions ?? []).map((position) => ({
      placing: position.placing, batch_id: position.batch_id, batch_label: position.batches?.label ?? null,
      winner_name: position.winner_name, winner_roll: position.winner_roll,
      participant_category: position.participant_category, application_id: position.application_id,
      group_id: position.group_id, points: position.awarded_points, note: position.note,
    })).sort((a, b) => a.placing - b.placing),
  }));
}
