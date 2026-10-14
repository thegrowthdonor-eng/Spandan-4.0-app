import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { activationUpdateSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

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
