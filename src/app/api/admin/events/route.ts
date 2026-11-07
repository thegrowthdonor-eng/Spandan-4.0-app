import { NextResponse } from "next/server";
import { createRequestClient } from "@/server/supabase/server";
import { managementEventSchema, publicationMissing } from "@/lib/event-setup";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers });
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid event details." }, { status: 400, headers }); }
  const parsed = managementEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message, fields: parsed.error.flatten().fieldErrors }, { status: 400, headers });
  const missing = publicationMissing(parsed.data.details);
  if (missing.length) return NextResponse.json({ error: "Complete " + missing.join(", ") + " before saving." }, { status: 400, headers });
  const { data, error } = await client.rpc("save_management_event", { p_event_id: parsed.data.eventId, p_edition_id: parsed.data.editionId, p_details: parsed.data.details });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "You cannot edit this event." : ["22023","55000","23505"].includes(error.code) ? (error.code === "23505" ? "An event with this name already exists." : error.message) : "Could not save. Your details are still here; try again." }, { status: error.code === "42501" ? 403 : error.code === "55000" ? 409 : 400, headers });
  return NextResponse.json({ ok: true, eventId: data.id }, { headers });
}
