import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/server/supabase/admin";
import { requiredServerEnv } from "@/server/env";
import { hashRateLimitKey } from "@/server/auth/identity";
import { authRateLimits, AUTH_RATE_LIMIT_WINDOW_SECONDS, getRequestNetworkKey, rateLimitHeaders } from "@/server/auth/rate-limit";
import { seniorRedeemSchema } from "@/server/auth/senior-contracts";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const failure = { error: "This setup link is unavailable. Ask the committee to reissue it." };
export async function POST(request: Request) {
 if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json(failure, { status: 403, headers });
 try {
  const parsed = seniorRedeemSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Choose your gender and use a valid setup link with a password of 8–256 characters." }, { status: 400, headers });
  const admin = createAdminClient(), pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const networkKey = getRequestNetworkKey(request);
  const limits = [
    { key: `invite-ip:${networkKey}`, maxAttempts: authRateLimits.seniorInvite.networkAttempts },
    { key: `invite-token:${parsed.data.token}`, maxAttempts: authRateLimits.seniorInvite.subjectAttempts },
  ];
  const checks = await Promise.all(limits.map(({ key, maxAttempts }) => admin.rpc("consume_auth_rate_limit", {
    p_key_hash: hashRateLimitKey(key, pepper),
    p_max_attempts: maxAttempts,
    p_window_seconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
  })));
  if (checks.some(c => c.error || c.data !== true)) return NextResponse.json({ error: "Please try again later." }, { status: 429, headers: rateLimitHeaders(headers) });
  const hash = hashRateLimitKey("senior-invite:"+parsed.data.token,pepper);
  const claim = await admin.rpc("claim_senior_invite", { p_hash: hash });
  if (claim.error || !claim.data) return NextResponse.json(failure, { status: 400, headers });
  const email = "senior+"+randomUUID()+"@spandan.invalid";
  const created = await admin.auth.admin.createUser({ email, password: parsed.data.password, email_confirm: true });
  if (created.error || !created.data.user) return NextResponse.json(failure, { status: 503, headers });
  const done = await admin.rpc("complete_senior_invite", { p_hash: hash, p_user: created.data.user.id, p_email: email, p_gender: parsed.data.gender });
  if (done.error) {
   // Delete only this newly-created identity if provisioning did not commit.
   const check = await admin.from("profiles").select("id").eq("id",created.data.user.id).maybeSingle();
   if (!check.error && !check.data) await admin.auth.admin.deleteUser(created.data.user.id);
   return NextResponse.json(failure, { status: 503, headers });
  }
  return NextResponse.json({ ok: true }, { headers });
 } catch { return NextResponse.json(failure, { status: 503, headers }); }
}
