import { NextResponse } from "next/server";
import { z } from "zod";
import { competitionCommandSchema } from "@/lib/competition";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { publishMedia, type MediaAsset } from "@/server/media/storage";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });

export async function GET(request: Request) {
  const eventId = new URL(request.url).searchParams.get("event");
  if (!z.string().uuid().safeParse(eventId).success) return reply({ error: "Choose an event." }, 400);
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return reply({ error: "Sign in required." }, 401);
  const history=new URL(request.url).searchParams.get("type")==="history";
  const record=new URL(request.url).searchParams.get("record");
  if (history && record) {
    if (!z.string().uuid().safeParse(record).success) return reply({error:"Choose a valid history record."},400);
    const {data,error}=await client.rpc("competition_history_detail",{p_event_id:eventId,p_history_id:record});
    return error ? reply({error:"Unable to load this correction record."},503) : reply({record:data});
  }
  const { data, error } = await client.rpc(history ? "competition_history" : "competition_workspace", { p_event_id: eventId });
  return error ? reply({ error: "Unable to load competition. Refresh to retry." }, 503) : reply(history ? {history:data} : { workspace: data });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return reply({ error: "Invalid request origin." }, 403);
  const raw = await request.text();
  if (raw.length > 240_000) return reply({ error: "Competition request too large." }, 413);
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return reply({ error: "Invalid request." }, 400); }
  const parsed = competitionCommandSchema.and(z.object({ eventId: z.string().uuid() })).safeParse(input);
  if (!parsed.success) return reply({ error: parsed.error.issues[0]?.message ?? "Check competition details." }, 400);
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return reply({ error: "Sign in required." }, 401);
  const { error } = await client.rpc("competition_command", { p_event_id: parsed.data.eventId, p_action: parsed.data.action, p_data: parsed.data.data });
  if (error) {
    console.error("Competition command failed",{action:parsed.data.action,code:error.code});
    return reply({ error: ["22023","40001","PT409","42501","23505","23514"].includes(error.code) ? error.message : "Unable to save competition. Refresh before retrying." }, ["40001","PT409"].includes(error.code) ? 409 : error.code === "42501" ? 403 : 400);
  }
  if (parsed.data.action === "review_entry" && parsed.data.data.state === "approved") {
    try {
      const admin = createAdminClient();
      const { data: entry } = await admin.from("competition_entries").select("id,media_id,version,state").eq("id",parsed.data.data.entry_id).single();
      if (!entry || entry.state !== "approved" || !entry.media_id) throw new Error("Entry changed; refresh before publishing its image.");
      const { data: asset } = await admin.from("media_assets").select("*").eq("id",entry.media_id).single();
      if (!asset) throw new Error("Entry image unavailable.");
      const published = await publishMedia(asset as MediaAsset);
      const attached = await admin.from("competition_entries").update({ public_media_url:published.public_url }).eq("id",entry.id).eq("version",entry.version).eq("state","approved").select("id").single();
      if (attached.error) throw new Error("Entry changed while publishing; refresh and retry approval.");
    } catch (reason) { return reply({ error:reason instanceof Error ? `Approval saved; image publication needs retry: ${reason.message}` : "Approval saved, but image publication failed. Retry approval before scheduling voting." },503); }
  }
  return reply({ ok: true });
}
