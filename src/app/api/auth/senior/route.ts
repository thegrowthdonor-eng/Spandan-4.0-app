import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/server/supabase/admin";
import { createRequestClient } from "@/server/supabase/server";
import { requiredServerEnv } from "@/server/env";
import { hashRateLimitKey } from "@/server/auth/identity";
import { seniorSignupSchema } from "@/server/auth/senior-contracts";
import { SIGNUP_BROWSER_COOKIE, signupBrowser, signupBrowserHash, setSignupBrowser } from "@/server/auth/signup-browser";
import { authRateLimits, AUTH_RATE_LIMIT_WINDOW_SECONDS, getRequestNetworkKey, rateLimitHeaders } from "@/server/auth/rate-limit";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const unavailable = "This signup link or browser is unavailable. Sign in or contact the festival team.";

export async function GET(request: Request) {
  try {
    const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
    const value = signupBrowser((await cookies()).get(SIGNUP_BROWSER_COOKIE)?.value, pepper);
    const client = await createRequestClient();
    const { data, error } = await client.auth.getUser();
    if (data.user) {
      const remembered = await createAdminClient().rpc("remember_signup_browser", { p_hash: signupBrowserHash(value, pepper), p_profile: data.user.id });
      if (remembered.error) throw remembered.error;
      const response = NextResponse.json({ error: unavailable }, { status: 409, headers });
      setSignupBrowser(response, value);
      return response;
    }
    if (error && error.name !== "AuthSessionMissingError") throw error;
    const token = request.headers.get("x-signup-token") ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
      const response = NextResponse.json({ error: "Open the private signup link shared by the festival team." }, { status: 400, headers });
      setSignupBrowser(response, value);
      return response;
    }
    const checked = await createAdminClient().rpc("check_senior_signup", { p_hash: hashRateLimitKey(`senior-signup:${token}`, pepper), p_device: signupBrowserHash(value, pepper) });
    if (checked.error) throw checked.error;
    if (!checked.data) {
      const response = NextResponse.json({ error: unavailable }, { status: 409, headers });
      setSignupBrowser(response, value);
      return response;
    }
    const response = NextResponse.json({ ok: true }, { headers });
    setSignupBrowser(response, value);
    return response;
  } catch { return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers }); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request." }, { status: 403, headers });
  try {
    const raw = await request.text();
    if (raw.length > 12000) return NextResponse.json({ error: "Check your profile details." }, { status: 400, headers });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: "Check your profile details." }, { status: 400, headers }); }
    const parsed = seniorSignupSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your profile details." }, { status: 400, headers });
    const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
    const current = (await cookies()).get(SIGNUP_BROWSER_COOKIE)?.value;
    const browser = signupBrowser(current, pepper);
    if (browser !== current) {
      const response = NextResponse.json({ error: "Reload this signup page before continuing." }, { status: 409, headers });
      setSignupBrowser(response, browser);
      return response;
    }
    const deviceHash = signupBrowserHash(browser, pepper);
    const admin = createAdminClient();
    const client = await createRequestClient();
    const { data: auth, error: authError } = await client.auth.getUser();
    if (auth.user) {
      const remembered = await admin.rpc("remember_signup_browser", { p_hash: deviceHash, p_profile: auth.user.id });
      if (remembered.error) return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers });
      return NextResponse.json({ error: unavailable }, { status: 409, headers });
    }
    if (authError && authError.name !== "AuthSessionMissingError") return NextResponse.json({ error: "Session check unavailable. Please retry." }, { status: 503, headers });
    const limits = [
      { key: `senior-signup-device:${deviceHash}`, max: authRateLimits.signup.subjectAttempts },
      { key: `signup-phone:${parsed.data.phone}`, max: authRateLimits.signup.subjectAttempts },
      { key: `signup-ip:${getRequestNetworkKey(request)}`, max: authRateLimits.signup.networkAttempts },
    ];
    const checks = await Promise.all(limits.map(({ key, max }) => admin.rpc("consume_auth_rate_limit", { p_key_hash: hashRateLimitKey(key, pepper), p_max_attempts: max, p_window_seconds: AUTH_RATE_LIMIT_WINDOW_SECONDS })));
    if (checks.some(check => check.error)) return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers });
    if (checks.some(check => check.data !== true)) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429, headers: rateLimitHeaders(headers) });
    const linkHash = hashRateLimitKey(`senior-signup:${parsed.data.token}`, pepper);
    const check = await admin.rpc("check_senior_signup", { p_hash: linkHash, p_device: deviceHash });
    if (check.error) return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers });
    if (!check.data) return NextResponse.json({ error: unavailable }, { status: 409, headers });
    const email = `senior+${randomUUID()}@spandan.invalid`;
    const created = await admin.auth.admin.createUser({ email, password: parsed.data.password, email_confirm: true });
    if (created.error || !created.data.user) return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers });
    const userId = created.data.user.id;
    const { fullName, phone, category, department, gender } = parsed.data;
    const completed = await admin.rpc("complete_senior_signup", { p_user: userId, p_email: email, p_hash: linkHash, p_device: deviceHash, p_details: { fullName, phone, category, department, gender } });
    if (completed.error) {
      const existing = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
      if (existing.error) return NextResponse.json({ error: "We could not confirm setup. Try signing in or contact the festival team before retrying." }, { status: 503, headers });
      if (!existing.data) {
        const cleanup = await admin.auth.admin.deleteUser(userId);
        if (cleanup.error) console.error("Senior signup identity cleanup failed", { userId });
        return NextResponse.json({ error: ["22023", "23505"].includes(completed.error.code) ? completed.error.message : "Signup is temporarily unavailable." }, { status: ["22023", "23505"].includes(completed.error.code) ? 409 : 503, headers });
      }
    }
    const response = NextResponse.json({ ok: true }, { status: 201, headers });
    setSignupBrowser(response, browser);
    return response;
  } catch { return NextResponse.json({ error: "Signup is temporarily unavailable." }, { status: 503, headers }); }
}
