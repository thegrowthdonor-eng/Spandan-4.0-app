import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { type ScoreTemplate, validateScore } from "@/server/competition/scores";
import { parseFixturePayload } from "@/server/competition/fixture-request";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Fixtures service unavailable." }, { status: 503, headers });
  }

  const url = new URL(request.url);
  const fixtureId = url.searchParams.get("fixtureId");
  const type = url.searchParams.get("type"); // 'history' | 'score'

  if (!fixtureId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fixtureId)) {
    return NextResponse.json({ error: "Valid fixture ID required." }, { status: 400, headers });
  }

  const denied = NextResponse.json({ error: "Not authorised for this fixture." }, { status: 403, headers });
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
    }
  );

  if (!(await client.auth.getUser()).data.user) return denied;

  if (type === "history") {
    const { data, error } = await client.rpc("list_fixture_history", { p_fixture_id: fixtureId });
    if (error) {
      if (error.code === "42501" || error.code === "28000") return denied;
      return NextResponse.json({ error: "Unable to load fixture history." }, { status: 500, headers });
    }
    return NextResponse.json({ ok: true, data }, { headers });
  }

  if (type === "score") {
    const { data, error } = await client.rpc("get_fixture_score", { p_fixture_id: fixtureId });
    if (error) {
      if (error.code === "42501" || error.code === "28000") return denied;
      return NextResponse.json({ error: "Unable to load fixture score." }, { status: 500, headers });
    }
    return NextResponse.json({ ok: true, data: data?.[0] ?? null }, { headers });
  }

  return NextResponse.json({ error: "Invalid type requested." }, { status: 400, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid fixture request." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check the fixture payload and try again." }, { status: 400, headers });
  }

  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Fixtures service unavailable." }, { status: 503, headers });
  }

  const payload = parseFixturePayload(body);
  if (!payload.success) return NextResponse.json({ error: payload.error }, { status: 400, headers });
  const { command } = payload;

  const denied = NextResponse.json({ error: "Not authorised for this fixture operation." }, { status: 403, headers });
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
    }
  );

  if (!(await client.auth.getUser()).data.user) return denied;

  if (command.action === "create") {
    const { data, error } = await client.rpc("create_fixture", {
      p_event_id: command.eventId,
      p_stage: command.stage,
      p_participant_a_label: command.participantALabel,
      p_participant_b_label: command.participantBLabel,
      p_venue: command.venue || null,
      p_reporting_at: command.reportingAt,
      p_starts_at: command.startsAt,
    });

    if (error) {
      if (error.code === "42501" || error.code === "28000") return denied;
      if (error.code === "22023") {
        return NextResponse.json({ error: "This fixture does not meet event requirements." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Unable to create fixture right now." }, { status: 503, headers });
    }

    return NextResponse.json({ ok: true, data }, { headers });
  }

  if (command.action === "reschedule") {
    const { data, error } = await client.rpc("reschedule_fixture", {
      p_fixture_id: command.fixtureId,
      p_reporting_at: command.reportingAt,
      p_starts_at: command.startsAt,
      p_venue: command.venue || null,
      p_reason: command.reason,
    });

    if (error) {
      if (error.code === "42501" || error.code === "28000") return denied;
      if (error.code === "22023") {
        return NextResponse.json({ error: error.message || "Check the reporting time, start time, and reschedule reason." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Unable to reschedule fixture right now." }, { status: 503, headers });
    }

    return NextResponse.json({ ok: true, data }, { headers });
  }

  if (command.action === "score") {
    const { data: template, error: templateError } = await client.rpc("get_fixture_score_template", {
      p_fixture_id: command.fixtureId,
    });
    if (templateError) {
      if (templateError.code === "42501" || templateError.code === "28000") return denied;
      return NextResponse.json({ error: "Unable to validate this fixture score." }, { status: 503, headers });
    }
    try {
      validateScore(template as ScoreTemplate, command.scorePayload);
    } catch {
      return NextResponse.json({ error: "Score fields do not match this event's score template." }, { status: 400, headers });
    }
    const { data, error } = await client.rpc("write_score_snapshot", {
      p_fixture_id: command.fixtureId,
      p_expected_version: command.expectedVersion,
      p_score_payload: command.scorePayload,
      p_status: command.status,
    });

    if (error) {
      if (error.code === "42501" || error.code === "28000") return denied;
      if (error.code === "40001") {
        return NextResponse.json(
          { error: "Conflict: This score was updated by someone else. Please refresh and retry." },
          { status: 409, headers }
        );
      }
      if (error.code === "22023") {
        return NextResponse.json({ error: "Invalid score payload or status." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Unable to save score snapshot right now." }, { status: 503, headers });
    }

    return NextResponse.json({ ok: true, data }, { headers });
  }

  if (command.action === "reminders") {
    const { data: count, error } = await client.rpc("generate_fixture_reminders", {
      p_fixture_id: command.fixtureId,
      p_body: command.body || null,
    });

    if (error) {
      if (error.code === "42501" || error.code === "28000") return denied;
      if (error.code === "22023") {
        return NextResponse.json({ error: "Fixture must have a scheduled start time before sending reminders." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Unable to generate fixture reminders right now." }, { status: 503, headers });
    }

    return NextResponse.json({ ok: true, remindersGenerated: count }, { headers });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400, headers });
}
