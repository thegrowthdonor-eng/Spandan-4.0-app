import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { activationUpdateSchema, profileRemovalSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid activation request." }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the activation details and try again." }, { status: 400, headers }); }
  const parsed = activationUpdateSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Activation is currently unavailable." }, { status: 503, headers });
  const response = NextResponse.json({ error: "Not authorised to change activation." }, { status: 403, headers });
  const cookieStore = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return response;
  const { error } = await client.rpc("set_student_access", { p_edition_id: parsed.data.editionId, p_profile_id: parsed.data.profileId, p_state: parsed.data.state, p_reason: parsed.data.reason || null, p_ledger_reference: parsed.data.ledgerReference || null });
  if (error) {
    if (error.code === "42501") return response;
    if (error.code === "22023") return NextResponse.json({ error: "An activation needs a ledger reference; check the supplied details." }, { status: 400, headers });
    return NextResponse.json({ error: "Unable to update activation right now." }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid removal request." }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the removal request." }, { status: 400, headers }); }
  const parsed = profileRemovalSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Profile removal is unavailable." }, { status: 400, headers });

  const cookieStore = await cookies();
  const response = NextResponse.json({ error: "Only the Main Admin can remove profiles." }, { status: 403, headers });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user || auth.user.id === parsed.data.profileId) return response;
  if ((await client.rpc("is_main_admin")).data !== true) return response;

  const admin = createAdminClient();
  const [{ data: profile }, { data: staff }, { count: applicationCount }] = await Promise.all([
    admin.from("profiles").select("id,full_name").eq("id", parsed.data.profileId).maybeSingle(),
    admin.from("staff_assignments").select("id").eq("profile_id", parsed.data.profileId).is("revoked_at", null).limit(1),
    admin.from("applications").select("id", { count: "exact", head: true }).eq("student_id", parsed.data.profileId),
  ]);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers });
  if ((staff?.length ?? 0) > 0) return NextResponse.json({ error: "Remove this person's app-controller access first." }, { status: 409, headers });
  if ((applicationCount ?? 0) > 0) return NextResponse.json({ error: "This profile has event records and cannot be deleted safely. Suspend it instead." }, { status: 409, headers });

  await admin.from("audit_log").insert({ actor_id: auth.user.id, action: "profile.removed", object_type: "profile", object_id: parsed.data.profileId, change_summary: { full_name: profile.full_name } });
  const { error } = await admin.auth.admin.deleteUser(parsed.data.profileId);
  if (error) return NextResponse.json({ error: "Unable to remove this profile safely." }, { status: 503, headers });
  return NextResponse.json({ ok: true }, { headers });
}
