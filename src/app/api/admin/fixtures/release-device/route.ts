import { NextResponse } from "next/server";
import { releaseLeaseSchema } from "@/server/competition/offline-score";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers: noStore });
  if (!hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Scoring service unavailable." }, { status: 503, headers: noStore });
  let input: unknown;
  try { input = await request.json(); } catch { return NextResponse.json({ error: "Invalid release request." }, { status: 400, headers: noStore }); }
  const parsed = releaseLeaseSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Invalid release request." }, { status: 400, headers: noStore });
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) return NextResponse.json({ error: "Sign in again." }, { status: 401, headers: noStore });
  const { error } = await client.rpc("release_fixture_score_lease", {
    p_fixture_id: parsed.data.fixtureId,
    p_device_id: parsed.data.deviceId,
    p_force: parsed.data.force,
  });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "You cannot release this device." : "Unable to release this device." }, { status: error.code === "42501" ? 403 : 503, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}
