import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { signInSchema } from "@/server/auth/contracts";
import { hashRateLimitKey, toPrivateAuthPhone } from "@/server/auth/identity";
import { hasSupabaseConfiguration, requiredServerEnv } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const genericFailure = { error: "Unable to sign in with those credentials." };

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json(genericFailure, { status: 400, headers: { "Cache-Control": "no-store" } }); }
  const parsed = signInSchema.safeParse(body);
  if (!parsed.success || !hasSupabaseConfiguration()) return NextResponse.json(genericFailure, { status: 401, headers: { "Cache-Control": "no-store" } });
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  try {
    const admin = createAdminClient();
    const keys = [hashRateLimitKey(`account:${parsed.data.batch}\u001f${parsed.data.rollNumber}`, pepper), hashRateLimitKey(`ip:${forwardedFor}`, pepper)];
    const checks = await Promise.all(keys.map((key) => admin.rpc("consume_auth_rate_limit", { p_key_hash: key, p_max_attempts: 10, p_window_seconds: 900 })));
    if (checks.some((check) => check.error)) return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    if (checks.some((check) => check.data !== true)) return NextResponse.json(genericFailure, { status: 429, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Sign-in is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }

  const cookieStore = await cookies();
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { error } = await client.auth.signInWithPassword({
    phone: toPrivateAuthPhone(parsed.data, pepper),
    password: parsed.data.password,
  });
  if (error) return NextResponse.json(genericFailure, { status: 401, headers: { "Cache-Control": "no-store" } });
  return response;
}
