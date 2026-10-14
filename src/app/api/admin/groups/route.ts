import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { groupCommandSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid group request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the group details and try again." }, { status: 400, headers }); }
  const parsed = groupCommandSchema.safeParse(body); if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Group selection is currently unavailable." }, { status: 503, headers });
  const denied = NextResponse.json({ error: "Not authorised for this event." }, { status: 403, headers }); const store = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => store.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) } });
  if (!(await client.auth.getUser()).data.user) return denied;
  let data: unknown; let error: { code?: string } | null;
  if (parsed.data.action === "create") ({ data, error } = await client.rpc("create_participant_group", { p_event_id: parsed.data.eventId, p_name: parsed.data.name, p_batch_id: parsed.data.batchId }));
  else if (parsed.data.action === "add") ({ data, error } = await client.rpc("add_group_member", { p_group_id: parsed.data.groupId, p_application_id: parsed.data.applicationId }));
  else ({ data, error } = await client.rpc("publish_participant_group", { p_group_id: parsed.data.groupId, p_captain_id: parsed.data.captainId }));
  if (error) { if (error.code === "42501") return denied; if (error.code === "22023" || error.code === "23505") return NextResponse.json({ error: "This group does not meet the current event rules." }, { status: 400, headers }); return NextResponse.json({ error: "Unable to update the group right now." }, { status: 503, headers }); }
  return NextResponse.json({ ok: true, data }, { headers });
}
