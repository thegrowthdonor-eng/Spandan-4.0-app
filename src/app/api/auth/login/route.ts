import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signInSchema, normaliseIndianPhone } from "@/server/auth/contracts";
import { hashRateLimitKey, toPrivateAuthEmail, canonicaliseBatchRoll } from "@/server/auth/identity";
import { hasSupabaseConfiguration, requiredServerEnv } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genericFailure = { error: "Unable to sign in with those credentials." };

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json(genericFailure, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json(genericFailure, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const parsed = signInSchema.safeParse(body);
  if (!parsed.success || !hasSupabaseConfiguration()) return NextResponse.json(genericFailure, { status: 401, headers: { "Cache-Control": "no-store" } });
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  let email: string;
  try {
    const admin = createAdminClient();
    const identity = parsed.data.mode === "senior" ? normaliseIndianPhone(parsed.data.phone) : canonicaliseBatchRoll(parsed.data);
    const keys = [hashRateLimitKey(`account:${JSON.stringify(identity)}`, pepper), hashRateLimitKey(`ip:${forwardedFor}`, pepper)];
    const checks = await Promise.all(keys.map((key) => admin.rpc("consume_auth_rate_limit", { p_key_hash: key, p_max_attempts: 10, p_window_seconds: 900 })));
    if (checks.some((check) => check.error)) return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (checks.some((check) => check.data !== true)) return NextResponse.json(genericFailure, { status: 429, headers: { "Cache-Control": "no-store" } });
    if (typeof identity === "string") {
      const { data, error } = await admin.rpc("senior_login_identity", { p_phone: identity });
      if (error) throw error;
      // Unknown numbers still take the provider password path; never reveal membership.
      email = data || "unknown-senior@spandan.invalid";
    } else email = toPrivateAuthEmail(identity, pepper);
  } catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }

  const cookieStore = await cookies();
  let response: NextResponse = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { data: signInData, error } = await client.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (error) return NextResponse.json(genericFailure, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { data: access, error: accessError } = await client
    .from("access_records")
    .select("state")
    .eq("profile_id", signInData.user.id)
    .eq("state", "active")
    .limit(1)
    .maybeSingle();

  if (accessError || !access) {
    response = NextResponse.json(
      { error: "Your profile is awaiting Treasurer verification. Sign-in will unlock after activation." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
    await client.auth.signOut({ scope: "local" });
    return response;
  }
  return response;
}
