import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { committeeRoleSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid committee request." }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the committee details and try again." }, { status: 400, headers }); }
  const parsed = committeeRoleSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Committee controls are currently unavailable." }, { status: 503, headers });
  const denied = NextResponse.json({ error: "Only a current Main Admin can change committee access." }, { status: 403, headers });
  const store = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => store.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) },
  });
  if (!(await client.auth.getUser()).data.user) return denied;
  const result = parsed.data.action === "assign"
    ? await client.rpc("assign_committee_role", { p_profile_id: parsed.data.profileId, p_role: parsed.data.role, p_event_id: parsed.data.eventId })
    : await client.rpc("revoke_committee_role", { p_assignment_id: parsed.data.assignmentId });
  if (result.error) {
    if (result.error.code === "42501") return denied;
    if (result.error.code === "22023" || result.error.code === "23505") return NextResponse.json({ error: result.error.message }, { status: 400, headers });
    return NextResponse.json({ error: "Unable to change committee access right now." }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
