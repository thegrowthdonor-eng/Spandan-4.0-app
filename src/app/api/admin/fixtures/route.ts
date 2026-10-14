import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { fixtureCreateSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid fixture request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the fixture details and try again." }, { status: 400, headers }); }
  const parsed = fixtureCreateSchema.safeParse(body); if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Fixture creation is currently unavailable." }, { status: 503, headers });
  const denied = NextResponse.json({ error: "Not authorised for this event." }, { status: 403, headers }); const store = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => store.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) } });
  if (!(await client.auth.getUser()).data.user) return denied;
  const { error } = await client.rpc("create_fixture", { p_event_id: parsed.data.eventId, p_stage: parsed.data.stage, p_participant_a_label: parsed.data.participantALabel, p_participant_b_label: parsed.data.participantBLabel, p_venue: parsed.data.venue || null, p_reporting_at: parsed.data.reportingAt, p_starts_at: parsed.data.startsAt });
  if (error) { if (error.code === "42501") return denied; if (error.code === "22023") return NextResponse.json({ error: "This fixture does not meet event requirements." }, { status: 400, headers }); return NextResponse.json({ error: "Unable to create the fixture right now." }, { status: 503, headers }); }
  return NextResponse.json({ ok: true }, { headers });
}
