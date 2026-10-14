import { NextResponse } from "next/server";
import { recoveryRedeemSchema } from "@/server/auth/contracts";
import { hashRateLimitKey, hashRecoveryToken } from "@/server/auth/identity";
import { hasSupabaseConfiguration, requiredServerEnv } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const failure = { error: "Unable to reset this account. Ask the authorised fest help desk for a new recovery token." };

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json(failure, { status: 400, headers }); }
  const parsed = recoveryRedeemSchema.safeParse(body);
  if (!parsed.success || !hasSupabaseConfiguration()) return NextResponse.json(failure, { status: 400, headers });
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const admin = createAdminClient();
    const rateKeys = [hashRateLimitKey(`recovery-token:${parsed.data.token}`, pepper), hashRateLimitKey(`recovery-ip:${ip}`, pepper)];
    const limits = await Promise.all(rateKeys.map((key) => admin.rpc("consume_auth_rate_limit", { p_key_hash: key, p_max_attempts: 5, p_window_seconds: 900 })));
    if (limits.some((result) => result.error)) return NextResponse.json({ error: "Recovery is temporarily unavailable." }, { status: 503, headers });
    if (limits.some((result) => result.data !== true)) return NextResponse.json(failure, { status: 429, headers });
    const { data: profileId, error: consumeError } = await admin.rpc("consume_recovery_token", { p_token_hash: hashRecoveryToken(parsed.data.token, pepper) });
    if (consumeError || !profileId) return NextResponse.json(failure, { status: 400, headers });
    const { error: passwordError } = await admin.auth.admin.updateUserById(profileId, { password: parsed.data.password });
    if (passwordError) return NextResponse.json({ error: "Recovery is temporarily unavailable. Ask the authorised fest help desk for a new recovery token." }, { status: 503, headers });
    return NextResponse.json({ ok: true, message: "Password reset. Sign in again with your new password." }, { headers });
  } catch { return NextResponse.json({ error: "Recovery is temporarily unavailable." }, { status: 503, headers }); }
}
