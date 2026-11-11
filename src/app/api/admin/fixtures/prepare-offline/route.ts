import { NextResponse } from "next/server";
import { prepareOfflineSchema } from "@/server/competition/offline-score";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  if (!hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Scoring service unavailable." }, { status: 503, headers: noStore });
  const client = await createRequestClient();
  const user = (await client.auth.getUser()).data.user;
  const fixtureId = new URL(request.url).searchParams.get("fixture");
  if (user && fixtureId) {
    const { data: fixture } = await client.from("fixtures").select("id,event_id,stage,participant_a_label,participant_b_label,venue,starts_at,state,actual_started_at").eq("id", fixtureId).maybeSingle();
    if (!fixture || !(await client.rpc("can_manage_event", { p_event_id: fixture.event_id })).data) return NextResponse.json({ error: "Fixture unavailable or not assigned." }, { status: 403, headers: noStore });
    const { data: event } = await client.from("events").select("title,state,operating_method").eq("id", fixture.event_id).single();
    if (event?.operating_method !== "live_matches") return NextResponse.json({error:"This event has no live scoring. Open its fixtures or final results."},{status:403,headers:noStore});
    return NextResponse.json({ match: { ...fixture, event_title: event?.title ?? "Match", event_state: event?.state ?? "draft" } }, { headers: noStore });
  }
  return user ? NextResponse.json({ userId: user.id }, { headers: noStore }) : NextResponse.json({ error: "Sign in again." }, { status: 401, headers: noStore });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  if (!hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Scoring service unavailable." }, { status: 503, headers: noStore });

  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid scorer request." }, { status: 400, headers: noStore }); }
  const parsed = prepareOfflineSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "A valid fixture and device are required." }, { status: 400, headers: noStore });

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return NextResponse.json({ error: "Sign in again to prepare this device." }, { status: 401, headers: noStore });
  const { data, error } = await client.rpc(parsed.data.start ? "start_fixture_for_scoring" : "prepare_fixture_offline", {
    p_fixture_id: parsed.data.fixtureId,
    p_device_id: parsed.data.deviceId,
  });
  if (error) {
    if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400, headers: noStore });
    if (["40001","PT409"].includes(error.code)) return NextResponse.json({ error: "This fixture is already prepared on another device." }, { status: 409, headers: noStore });
    if (["42501", "28000"].includes(error.code)) return NextResponse.json({ error: "You are not assigned to score this fixture." }, { status: 403, headers: noStore });
    return NextResponse.json({ error: "Unable to prepare offline scoring." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ ok: true, fixture: data }, { headers: noStore });
}
