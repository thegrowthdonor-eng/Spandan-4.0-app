import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicNoticeSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid notice request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the notice and try again." }, { status: 400, headers }); }
  const parsed = publicNoticeSchema.safeParse(body); if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Notice publishing is currently unavailable." }, { status: 503, headers });
  const denied = NextResponse.json({ error: "Only a current Main Admin or Notice Publisher can publish notices." }, { status: 403, headers }); const store = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => store.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) } });
  if (!(await client.auth.getUser()).data.user) return denied;
  const { error } = await client.rpc("publish_public_notice", { p_edition_id: parsed.data.editionId, p_title: parsed.data.title, p_body: parsed.data.body, p_urgency: parsed.data.urgency, p_expires_at: parsed.data.expiresAt });
  if (error) { if (error.code === "42501") return denied; if (error.code === "22023") return NextResponse.json({ error: "Please provide valid notice details and a future expiry time." }, { status: 400, headers }); return NextResponse.json({ error: "Unable to publish the notice. Please try again." }, { status: 503, headers }); }
  return NextResponse.json({ ok: true }, { headers });
}
