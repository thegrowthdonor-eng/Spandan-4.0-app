import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminNoticeItem = {
  id: string;
  title: string;
  body: string;
  urgency: "normal" | "important" | "urgent";
  audience: string;
  publishAt: string;
  expiresAt: string | null;
  eventTitle: string | null;
};

type RawNoticeRow = {
  id: string;
  title: string;
  body: string;
  urgency: "normal" | "important" | "urgent";
  audience: string;
  publish_at: string;
  expires_at: string | null;
  events: { title: string } | { title: string }[] | null;
};

/** Returns recent notices ordered newest-first for the admin notice board. */
export async function listAdminNotices(client: SupabaseClient): Promise<AdminNoticeItem[]> {
  const { data, error } = await client
    .from("notices")
    .select("id, title, body, urgency, audience, publish_at, expires_at, events(title)")
    .order("publish_at", { ascending: false })
    .limit(50);

  if (error || !Array.isArray(data)) return [];

  return (data as RawNoticeRow[]).map((row) => {
    const relatedEvent = Array.isArray(row.events) ? row.events[0] : row.events;
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      urgency: row.urgency,
      audience: row.audience,
      publishAt: row.publish_at,
      expiresAt: row.expires_at,
      eventTitle: relatedEvent?.title ?? null,
    };
  });
}

