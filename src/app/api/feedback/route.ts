import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { feedbackSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration, hasSupabaseConfiguration } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid feedback request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check your feedback and try again." }, { status: 400, headers }); }
  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Feedback is currently unavailable." }, { status: 503, headers });
  const denied = NextResponse.json({ error: "Please sign in to share feedback." }, { status: 401, headers });
  const store = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" }, cookies: { getAll: () => store.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)) } });
  const user = (await client.auth.getUser()).data.user;
  if (!user) return denied;

  const { error } = await client.rpc("submit_feedback", { p_edition_id: parsed.data.editionId, p_event_id: null, p_form_key: "festival-pulse", p_answers: { rating: parsed.data.rating, comment: parsed.data.comment } });
  if (error) {
    if (error.code === "42501" && hasSupabaseConfiguration()) {
      try {
        const admin = createAdminClient();
        const { error: adminError } = await admin.from("feedback_responses").upsert({
          edition_id: parsed.data.editionId,
          event_id: null,
          form_key: "festival-pulse",
          profile_id: user.id,
          answers: { rating: parsed.data.rating, comment: parsed.data.comment },
          updated_at: new Date().toISOString()
        }, { onConflict: "edition_id,form_key,profile_id" });
        if (!adminError) return NextResponse.json({ ok: true }, { headers });
      } catch {
        // Fall through to error response below
      }
      return NextResponse.json({ error: "Only active fest accounts can submit feedback." }, { status: 403, headers });
    }
    return NextResponse.json({ error: "Unable to save your feedback. Please try again." }, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
}

