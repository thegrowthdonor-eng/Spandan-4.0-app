import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { applicationReviewSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid review request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the review and try again." }, { status: 400, headers }); }
  const parsed = applicationReviewSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Review is currently unavailable." }, { status: 503, headers });
  const denied = NextResponse.json({ error: "Not authorised to review this application." }, { status: 403, headers });
  const cookieStore = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) } });
  if (!(await client.auth.getUser()).data.user) return denied;
  const { error } = await client.rpc("review_application", { p_application_id: parsed.data.applicationId, p_state: parsed.data.state, p_reason: parsed.data.reason || null });
  if (error) {
    if (error.code === "42501") return denied;
    if (error.code === "22023") return NextResponse.json({ error: "This review cannot be saved with the supplied details." }, { status: 400, headers });
    return NextResponse.json({ error: "Unable to save this review right now." }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}
