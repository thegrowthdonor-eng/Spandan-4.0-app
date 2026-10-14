import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eventApplicationSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid application request." }, { status: 403, headers });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Check your application and try again." }, { status: 400, headers }); }
  const parsed = eventApplicationSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Applications are currently unavailable." }, { status: 503, headers });
  const response = NextResponse.json({ error: "Please sign in to apply." }, { status: 401, headers });
  const cookieStore = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return response;
  const { data, error } = await client.rpc("apply_to_event", { p_event_id: parsed.data.eventId, p_idempotency_key: parsed.data.idempotencyKey, p_answers: parsed.data.answers });
  if (error) {
    if (error.code === "42501") return NextResponse.json({ error: "Your registration access is not active for this application." }, { status: 403, headers });
    if (error.code === "22023" || error.code === "23505") return NextResponse.json({ error: "This event is not accepting another application right now." }, { status: 409, headers });
    return NextResponse.json({ error: "Unable to submit this application. Please try again." }, { status: 503, headers });
  }
  const result = data as { review_state?: string } | null;
  return NextResponse.json({ ok: true, reviewState: result?.review_state ?? "submitted" }, { headers });
}
