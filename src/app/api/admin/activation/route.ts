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

  const admin = createAdminClient();
  const { data: targetStaff } = await admin
    .from("staff_assignments")
    .select("role")
    .eq("profile_id", parsed.data.profileId)
    .is("revoked_at", null);
  const isTargetAdmin = targetStaff?.some((s) => s.role === "main_admin");

  if (isTargetAdmin) {
    const { data: isCallerAdmin } = await client.rpc("is_main_admin");
    if (!isCallerAdmin) {
      return NextResponse.json({ error: "Only Main Admins can modify or suspend an Admin profile." }, { status: 403, headers });
    }
    if (parsed.data.profileId === userData.user.id && (parsed.data.state === "suspended" || parsed.data.state === "rejected")) {
      return NextResponse.json({ error: "You cannot suspend or reject your own Admin profile." }, { status: 400, headers });
    }
  }

  const { error } = await client.rpc("set_student_access", {
    p_edition_id: parsed.data.editionId,
    p_profile_id: parsed.data.profileId,
    p_state: parsed.data.state,
    p_reason: parsed.data.reason || null,
    p_ledger_reference: parsed.data.ledgerReference || null,
  });
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: error.message || "Not authorised to change activation." }, { status: 403, headers });
    if (error.code === "22023") return NextResponse.json({ error: error.message || "An activation needs a ledger reference; check the supplied details." }, { status: 400, headers });
    return NextResponse.json({ error: error.message || "Unable to update activation right now." }, { status: 503, headers });
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
  const response = NextResponse.json({ error: "Not authorised to remove profiles." }, { status: 403, headers });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user || auth.user.id === parsed.data.profileId) return response;

  const [adminCheck, accessCheck] = await Promise.all([
    client.rpc("is_main_admin"),
    client.rpc("can_manage_access"),
  ]);
  if (adminCheck.data !== true && accessCheck.data !== true) return response;
  const isCallerAdmin = adminCheck.data === true;

  const admin = createAdminClient();
  const [{ data: profile }, { data: staff }] = await Promise.all([
    admin.from("profiles").select("id,full_name").eq("id", parsed.data.profileId).maybeSingle(),
    admin.from("staff_assignments").select("id,role").eq("profile_id", parsed.data.profileId).is("revoked_at", null),
  ]);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404, headers });

  const isTargetAdmin = staff?.some((s) => s.role === "main_admin");

  if (isTargetAdmin) {
    if (!isCallerAdmin) {
      return NextResponse.json({ error: "Only Main Admins can remove an Admin profile." }, { status: 403, headers });
    }
    const { count: remainingAdmins } = await admin
      .from("staff_assignments")
      .select("id", { count: "exact", head: true })
      .eq("role", "main_admin")
      .is("revoked_at", null)
      .neq("profile_id", parsed.data.profileId);
    if (!remainingAdmins || remainingAdmins < 1) {
      return NextResponse.json({ error: "Cannot remove the only remaining Main Admin." }, { status: 400, headers });
    }
  } else if (!isCallerAdmin && (staff?.length ?? 0) > 0) {
    return NextResponse.json({ error: "Remove this person's committee or controller access first." }, { status: 409, headers });
  }

  const { error: rpcError } = await admin.rpc("delete_student_profile", { p_profile_id: parsed.data.profileId });
  if (rpcError) {
    return NextResponse.json({ error: rpcError.message || "Unable to remove this profile." }, { status: 400, headers });
  }

  const { error: authError } = await admin.auth.admin.deleteUser(parsed.data.profileId);
  if (authError) {
    console.warn("Auth user deletion notice:", authError.message);
  }

  return NextResponse.json({ ok: true }, { headers });
}
