import { NextResponse } from "next/server";
import { syncScoreSchema } from "@/server/competition/offline-score";
import { type ScoreTemplate, validateScore } from "@/server/competition/scores";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  if (!hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Scoring service unavailable." }, { status: 503, headers: noStore });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid sync payload." }, { status: 400, headers: noStore }); }
  const parsed = syncScoreSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid sync payload." }, { status: 400, headers: noStore });

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return NextResponse.json({ error: "Sign in again; scores remain saved on this device." }, { status: 401, headers: noStore });
  const { data: template, error: templateError } = await client.rpc("get_fixture_score_template", { p_fixture_id: parsed.data.fixtureId });
  if (templateError) return NextResponse.json({ error: "This fixture is no longer available to this scorer." }, { status: 403, headers: noStore });
  try {
    for (const checkpoint of parsed.data.checkpoints) validateScore(template as ScoreTemplate, checkpoint.scorePayload);
  } catch {
    return NextResponse.json({ error: "The saved score does not match this sport template." }, { status: 400, headers: noStore });
  }

  const { data, error } = await client.rpc("sync_score_checkpoints", {
    p_fixture_id: parsed.data.fixtureId,
    p_device_id: parsed.data.deviceId,
    p_base_version: parsed.data.baseVersion,
    p_checkpoints: parsed.data.checkpoints,
  });
  if (error) {
    await client.rpc("record_score_sync_failure", { p_failure_code: error.code || "unknown" });
    if (error.code === "40001") return NextResponse.json({ error: "The live score changed elsewhere. Export this device copy before reconciling.", conflict: true }, { status: 409, headers: noStore });
    if (["42501", "28000"].includes(error.code)) return NextResponse.json({ error: "This device no longer owns the scoring lease. Your local score was kept.", leaseRevoked: true }, { status: 403, headers: noStore });
    if (error.code === "22023") return NextResponse.json({ error: "A queued score is invalid and was not published." }, { status: 400, headers: noStore });
    return NextResponse.json({ error: "Sync failed. Scores remain saved on this device." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ ok: true, ...data }, { headers: noStore });
}
