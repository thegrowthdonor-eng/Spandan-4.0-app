import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resultSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Results service unavailable." }, { status: 503, headers });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("eventId");

  if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
    return NextResponse.json({ error: "Valid event ID required." }, { status: 400, headers });
  }

  const denied = NextResponse.json({ error: "Not authorised for this event." }, { status: 403, headers });
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

  const [{ data: rules, error: rulesErr }, { data: results, error: resultsErr }, { data: participants }] = await Promise.all([
    client.rpc("list_event_point_rules", { p_event_id: eventId }),
    client.rpc("list_event_results", { p_event_id: eventId }),
    client.rpc("list_result_participants", { p_event_id: eventId }),
  ]);

  if (rulesErr || resultsErr) {
    if (rulesErr?.code === "42501" || resultsErr?.code === "42501") return denied;
    return NextResponse.json({ error: "Unable to load event results data." }, { status: 500, headers });
  }

  return NextResponse.json(
    {
      ok: true,
      pointRules: rules ?? [],
      results: results ?? [],
      participants: participants ?? [],
    },
    { headers }
  );
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid result request." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check the payload and try again." }, { status: 400, headers });
  }

  const parsed = resultSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) {
    return NextResponse.json(
      { error: parsed.error?.issues[0]?.message ?? "Results service unavailable." },
      { status: 400, headers }
    );
  }

  const denied = NextResponse.json({ error: "Not authorised for results management." }, { status: 403, headers });
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

  if (parsed.data.action === "setPointRules") {
    const { error } = await client.rpc("set_event_point_rules", {
      p_event_id: parsed.data.eventId,
      p_rules: parsed.data.rules,
    });

    if (error) {
      if (error.code === "42501") return denied;
      if (error.code === "22023") {
        return NextResponse.json({ error: "Point rules must contain valid non-negative placings and points." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Unable to save point rules." }, { status: 503, headers });
    }

    return NextResponse.json({ ok: true }, { headers });
  }

  if (parsed.data.action === "publish") {
    const { data, error } = await client.rpc("publish_unified_results", {
      p_event_id: parsed.data.eventId,
      p_positions: parsed.data.positions,
      p_reason: parsed.data.reason || null,
      p_podium_photo_url: parsed.data.podiumPhotoUrl || null,
      p_podium_caption: parsed.data.podiumCaption || null,
    });

    if (error) {
      if (error.code === "42501") return denied;
      if (error.code === "22023") {
        return NextResponse.json({ error: error.message || "Invalid result positions or missing point configuration." }, { status: 400, headers });
      }
      return NextResponse.json({ error: "Unable to publish results right now." }, { status: 503, headers });
    }

    return NextResponse.json({ ok: true, data }, { headers });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400, headers });
}
