import { NextResponse } from "next/server";
import { prepareOfflineSchema } from "@/server/competition/offline-score";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!hasPublicSupabaseConfiguration()) return NextResponse.json({ error: "Scoring service unavailable." }, { status: 503, headers: noStore });
  const client = await createRequestClient();
  const user = (await client.auth.getUser()).data.user;
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
  const { data, error } = await client.rpc("prepare_fixture_offline", {
    p_fixture_id: parsed.data.fixtureId,
    p_device_id: parsed.data.deviceId,
  });
  if (error) {
    if (error.code === "22023") return NextResponse.json({ error: error.message }, { status: 400, headers: noStore });
    if (error.code === "40001") return NextResponse.json({ error: "This fixture is already prepared on another device." }, { status: 409, headers: noStore });
    if (["42501", "28000"].includes(error.code)) return NextResponse.json({ error: "You are not assigned to score this fixture." }, { status: 403, headers: noStore });
    return NextResponse.json({ error: "Unable to prepare offline scoring." }, { status: 503, headers: noStore });
  }
  return NextResponse.json({ ok: true, fixture: data }, { headers: noStore });
}
