import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { festivalSetupSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "Invalid festival setup request." }, { status: 403, headers });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Check the festival details and try again." }, { status: 400, headers });
  }

  const parsed = festivalSetupSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration())
    return NextResponse.json({ error: "Festival setup is currently unavailable." }, { status: 503, headers });

  const denied = NextResponse.json({ error: "Only a current Main Admin can change festival setup." }, { status: 403, headers });
  const store = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    },
  );
  if (!(await client.auth.getUser()).data.user) return denied;

  let result;
  const data = parsed.data;

  if (data.action === "createBatch") {
    result = await client.rpc("create_eligible_batch", {
      p_edition_id: data.editionId,
      p_label: data.label,
      p_course_label: data.courseLabel || null,
      p_eligible: data.eligible,
    });
  } else if (data.action === "createEvent") {
    result = await client.rpc("create_admin_event", {
      p_edition_id: data.editionId,
      p_title: data.title,
      p_category: data.category,
      p_format: data.format,
      p_score_template: data.scoreTemplate,
      p_summary: data.summary,
      p_venue: data.venue || null,
      p_application_capacity: data.capacity,
      p_application_opens_at: data.applicationOpensAt,
      p_application_closes_at: data.applicationClosesAt,
      p_reporting_at: data.reportingAt,
      p_starts_at: data.startsAt,
      p_ends_at: data.endsAt,
    });
  } else if (data.action === "setEventState") {
    result = await client.rpc("set_admin_event_state", {
      p_event_id: data.eventId,
      p_state: data.state,
    });
  } else if (data.action === "updateEvent") {
    // Legacy content-only update (kept for backwards compatibility)
    result = await client.rpc("update_admin_event_content", {
      p_event_id: data.eventId,
      p_summary: data.summary,
      p_rules_markdown: data.rules,
      p_venue: data.venue,
      p_application_capacity: data.capacity,
      p_application_opens_at: data.applicationOpensAt,
      p_application_closes_at: data.applicationClosesAt,
      p_reporting_at: data.reportingAt,
      p_starts_at: data.startsAt,
      p_ends_at: data.endsAt,
    });
  } else {
    // updateEventFull — fixes the timing-null bug by always persisting all fields
    result = await client.rpc("update_admin_event_full", {
      p_event_id: data.eventId,
      p_title: data.title,
      p_summary: data.summary,
      p_rules_markdown: data.rules,
      p_venue: data.venue,
      p_application_capacity: data.capacity,
      p_waitlist_enabled: data.waitlistEnabled,
      p_application_opens_at: data.applicationOpensAt,
      p_application_closes_at: data.applicationClosesAt,
      p_roster_lock_at: data.rosterLockAt,
      p_reporting_at: data.reportingAt,
      p_starts_at: data.startsAt,
      p_ends_at: data.endsAt,
      p_eligibility: data.eligibility,
      p_application_questions: data.applicationQuestions,
      p_group_min_size: data.groupMinSize,
      p_group_max_size: data.groupMaxSize,
      p_batch_restricted: data.batchRestricted,
      p_poster_url: data.posterUrl ?? null,
    });
  }

  if (result.error) {
    if (result.error.code === "42501") return denied;
    if (result.error.code === "22023" || result.error.code === "23505")
      return NextResponse.json({
        error: result.error.code === "23505"
          ? "An event with this title already exists in this edition. Use a distinct title."
          : result.error.message,
      }, { status: 400, headers });
    return NextResponse.json({ error: "Unable to save festival setup right now." }, { status: 503, headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}
