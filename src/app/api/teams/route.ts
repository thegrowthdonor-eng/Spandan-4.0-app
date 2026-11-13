import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { teamCommandSchema } from "@/lib/team-contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid team request." }, { status: 403, headers });
  if (!hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Team registration is unavailable." }, { status: 503, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the request details." }, { status: 400, headers }); }
  const parsed = teamCommandSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the team or invitation details." }, { status: 400, headers });
  const store = await cookies();
  const response = NextResponse.json({ error: "Please sign in." }, { status: 401, headers });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => store.getAll(), setAll: entries => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return response;
  const profile = await client.from("profiles").select("participant_category").eq("id", auth.user.id).single();
  if (profile.error || !profile.data) return NextResponse.json({ error: "Team access unavailable." }, { status: 503, headers });
  if (profile.data.participant_category !== "ug") return NextResponse.json({ error: "Your event registrations are available in My Fest." }, { status: 403, headers });
  const cmd = parsed.data;
  let result;
  if (cmd.action === "lookup") result = await client.rpc("find_pair_partner", { p_event_id: cmd.eventId, p_batch_id: cmd.batchId, p_roll: cmd.roll });
  else if (["invite", "accept", "decline", "cancel", "leave"].includes(cmd.action)) result = await client.rpc("pair_invitation_command", {
    p_event_id: cmd.eventId, p_action: cmd.action,
    p_invitation_id: "invitationId" in cmd ? cmd.invitationId : null,
    p_partner_id: "partnerId" in cmd ? cmd.partnerId : null, p_answers: "answers" in cmd ? cmd.answers : {},
  });
  else result = await client.rpc("manage_team_proposal", { p_event_id: cmd.eventId, p_group_id: "groupId" in cmd ? cmd.groupId : null, p_action: cmd.action, p_details: cmd });
  let output: NextResponse;
  if (result.error) {
    if (result.error.details === "batch_team_exists") return NextResponse.json({ error: "This batch already has a team for this event. Change its existing captain or roster." }, { status: 409, headers });
    const code = result.error.code;
    const status = code === "42501" || code === "P0002" ? 403 : ["22023", "23505", "55000"].includes(code) ? 409 : 503;
    output = NextResponse.json({ error: status === 403 ? "You do not have access to this team or invitation." : status === 409 ? (code === "23505" ? "This student or invitation is already assigned. Refresh and try again." : result.error.message) : "Could not update right now. Your saved proposal is preserved." }, { status, headers });
  } else output = NextResponse.json({ ok: true, data: result.data }, { headers });
  for (const cookie of response.cookies.getAll()) output.cookies.set(cookie);
  return output;
}
