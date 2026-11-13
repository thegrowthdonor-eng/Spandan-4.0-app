import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { NextResponse } from "next/server";
import { seniorSignupSchema, seniorLinkCommandSchema } from "./senior-contracts";
import * as browserTools from "./signup-browser";
import * as identity from "./identity";
import * as rateLimits from "./rate-limit";

const pepper = "isolated-senior-test-pepper-at-least-32-characters";
const payload = { token: "x".repeat(43), fullName: "Test Senior", phone: "9811111111", category: "pg", department: "Medicine", gender: "male", password: "TestPassword!123" };
function loadRoute(relative: string, dependencies: Record<string, unknown>) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const moduleObj = { exports: {} as Record<string, unknown> };
  new Script(code).runInNewContext({ module: moduleObj, exports: moduleObj.exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, Request, Response, URL, console, process });
  return moduleObj.exports;
}
function signupRoute(options: { user?: string; browser?: string | null; unavailable?: boolean; failed?: boolean; profileExists?: boolean; uncertain?: boolean; limited?: boolean } = {}) {
  const browser = options.browser === null ? undefined : options.browser ?? browserTools.signupBrowser(undefined, pepper);
  const calls: { name: string; args?: unknown }[] = [];
  const admin = {
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      if (name === "check_senior_signup") return { data: !options.unavailable };
      if (name === "complete_senior_signup" && options.failed) return { error: { code: "23505", message: "Duplicate account" } };
      return { data: !options.limited };
    },
    auth: { admin: {
      createUser: async (args: unknown) => { calls.push({ name: "createUser", args }); return { data: { user: { id: "new-auth-only" } } }; },
      deleteUser: async (id: string) => { calls.push({ name: "deleteUser", args: id }); return {}; },
    } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: options.profileExists ? { id: "new-auth-only" } : null, error: options.uncertain ? { message: "Network error" } : null }) }) }) }),
  };
  const route = loadRoute("../../app/api/auth/senior/route.ts", {
    "node:crypto": { randomUUID: () => "new-auth-only" },
    "next/headers": { cookies: async () => ({ get: () => browser ? { value: browser } : undefined }) },
    "next/server": { NextResponse },
    "@/server/supabase/admin": { createAdminClient: () => admin },
    "@/server/supabase/server": { createRequestClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user ? { id: options.user } : null }, error: options.user ? null : { name: "AuthSessionMissingError" } }) } }) },
    "@/server/env": { requiredServerEnv: () => pepper },
    "@/server/auth/identity": identity,
    "@/server/auth/senior-contracts": { seniorSignupSchema },
    "@/server/auth/signup-browser": browserTools,
    "@/server/auth/rate-limit": rateLimits,
  });
  return { calls, POST: route.POST as (request: Request) => Promise<NextResponse>, GET: route.GET as (request: Request) => Promise<NextResponse> };
}
function request(body: unknown = payload, origin = "https://fest.test") {
  return new Request("https://fest.test/api/auth/senior", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

test("private signup accepts all four categories, normalises phone and rejects UG/malformed fields", () => {
  for (const category of ["pg", "jr", "fmg", "faculty"]) {
    const parsed = seniorSignupSchema.parse({ ...payload, category });
    assert.equal(parsed.phone, "+919811111111");
  }
  for (const change of [{ category: "ug" }, { phone: "123" }, { password: "short" }, { department: " " }, { gender: "invalid" }, { token: "short" }]) assert.equal(seniorSignupSchema.safeParse({ ...payload, ...change }).success, false);
  assert.equal(seniorLinkCommandSchema.safeParse({ action: "create", editionId: "00000000-0000-4000-8000-000000000001", expiresAt: "2000-01-01T00:00:00Z", maxAccounts: 10 }).success, false);
  assert.equal(seniorLinkCommandSchema.safeParse({ action: "suspend", profileId: "00000000-0000-4000-8000-000000000001", reason: " " }).success, false);
});

test("browser marker survives unchanged but tampering, appended suffix and another signing key do not", () => {
  const value = browserTools.signupBrowser(undefined, pepper);
  assert.equal(browserTools.signupBrowser(value, pepper), value);
  assert.notEqual(browserTools.signupBrowser(value + ".forged", pepper), value + ".forged");
  assert.notEqual(browserTools.signupBrowser(value.slice(0, -1) + (value.endsWith("a") ? "b" : "a"), pepper), value);
  assert.notEqual(browserTools.signupBrowser(value, pepper + "other"), value);
  const response = NextResponse.json({ ok: true });
  browserTools.setSignupBrowser(response, value);
  const cookie = response.cookies.get(browserTools.SIGNUP_BROWSER_COOKIE)!;
  assert.equal(cookie.httpOnly, true); assert.equal(cookie.path, "/"); assert.equal(cookie.sameSite, "lax");
  assert.ok((cookie.maxAge ?? 0) > 86400);
});

test("cross-origin, invalid payload and missing bootstrap cookie never create an identity", async () => {
  const route = signupRoute();
  assert.equal((await route.POST(request(payload, "https://elsewhere.test"))).status, 403);
  assert.equal((await route.POST(request({ ...payload, category: "ug" }))).status, 400);
  const fresh = signupRoute({ browser: null });
  const response = await fresh.POST(request());
  assert.equal(response.status, 409); assert.ok(response.cookies.get(browserTools.SIGNUP_BROWSER_COOKIE));
  assert.equal([...route.calls, ...fresh.calls].some(call => call.name === "createUser"), false);
});

test("existing UG session binds the browser and blocks signup on opening the page and posting", async () => {
  const route = signupRoute({ user: "existing-ug" });
  assert.equal((await route.GET(request())).status, 409);
  assert.equal((await route.POST(request())).status, 409);
  assert.equal(route.calls.filter(call => call.name === "remember_signup_browser").length, 2);
  assert.equal(route.calls.some(call => call.name === "createUser"), false);
});

test("join bootstrap validates the private token and returns a durable marker without creating an account", async () => {
  const route = signupRoute();
  const response = await route.GET(new Request("https://fest.test/api/auth/senior", { headers: { "X-Signup-Token": payload.token } }));
  assert.equal(response.status, 200);
  assert.ok(response.cookies.get(browserTools.SIGNUP_BROWSER_COOKIE));
  assert.equal((await route.GET(new Request("https://fest.test/api/auth/senior"))).status, 400);
  const unavailable = signupRoute({ unavailable: true });
  assert.equal((await unavailable.GET(new Request("https://fest.test/api/auth/senior", { headers: { "X-Signup-Token": payload.token } }))).status, 409);
  assert.equal([...route.calls, ...unavailable.calls].some(call => call.name === "createUser"), false);
});

test("logout clears session cookies but does not delete the browser restriction", async () => {
  const marker = browserTools.signupBrowser(undefined, pepper);
  const route = loadRoute("../../app/api/auth/logout/route.ts", {
    "@supabase/ssr": {}, "next/server": { NextResponse },
    "next/headers": { cookies: async () => ({ getAll: () => [{ name: browserTools.SIGNUP_BROWSER_COOKIE, value: marker }, { name: "sb-test-auth-token", value: "session" }, { name: "spandan_ui_nav", value: "member" }] }) },
    "@/server/env": { hasSupabaseConfiguration: () => false },
  });
  const response = await (route.POST as (req: Request) => Promise<NextResponse>)(new Request("https://fest.test/api/auth/logout", { method: "POST" }));
  assert.equal(response.status, 303);
  assert.equal(response.cookies.get("sb-test-auth-token")?.value, "");
  assert.equal(response.cookies.get(browserTools.SIGNUP_BROWSER_COOKIE), undefined);
});

test("unavailable/full/used link or rate limit rejects before creating an identity", async () => {
  for (const options of [{ unavailable: true }, { limited: true }]) {
    const route = signupRoute(options);
    assert.equal((await route.POST(request())).status, options.limited ? 429 : 409);
    assert.equal(route.calls.some(call => call.name === "createUser"), false);
  }
});

test("successful signup uses normalised details, keeps password out of provisioning and creates no UG application", async () => {
  const route = signupRoute();
  const response = await route.POST(request());
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { ok: true });
  const completion = route.calls.find(call => call.name === "complete_senior_signup")!.args as { p_details: Record<string, string> };
  assert.equal(completion.p_details.phone, "+919811111111");
  assert.equal("password" in completion.p_details, false);
  assert.equal(route.calls.some(call => call.name === "apply_to_event" || call.name === "provision_student_profile"), false);
});

test("provisioning failure cleans only the new orphan; committed or uncertain identities are retained", async () => {
  const failed = signupRoute({ failed: true });
  assert.equal((await failed.POST(request())).status, 409);
  assert.deepEqual(failed.calls.filter(call => call.name === "deleteUser").map(call => call.args), ["new-auth-only"]);
  const committed = signupRoute({ failed: true, profileExists: true });
  assert.equal((await committed.POST(request())).status, 201);
  assert.equal(committed.calls.some(call => call.name === "deleteUser"), false);
  const uncertain = signupRoute({ failed: true, uncertain: true });
  assert.equal((await uncertain.POST(request())).status, 503);
  assert.equal(uncertain.calls.some(call => call.name === "deleteUser"), false);
});

test("application API routes seniors separately and preserves the UG RPC response", async () => {
  for (const category of ["ug", "pg", "jr", "fmg", "faculty"]) {
    const calls: string[] = [];
    const route = loadRoute("../../app/api/applications/route.ts", {
      "@supabase/ssr": { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: "participant" } } }) }, from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { participant_category: category } }) }) }) }), rpc: async (name: string) => { calls.push(name); return { data: { review_state: "submitted" } }; } }) },
      "next/headers": { cookies: async () => ({ getAll: () => [] }) }, "next/server": { NextResponse },
      "@/server/auth/contracts": await import("./contracts"), "@/server/env": { hasPublicSupabaseConfiguration: () => true },
    });
    const response = await (route.POST as (req: Request) => Promise<NextResponse>)(request({ eventId: "00000000-0000-4000-8000-000000000001", idempotencyKey: "00000000-0000-4000-8000-000000000002", answers: {} }));
    assert.equal(response.status, 200);
    assert.deepEqual(calls, [category === "ug" ? "apply_to_event" : "register_senior_event"]);
    assert.deepEqual(await response.json(), category === "ug" ? { ok: true, reviewState: "submitted" } : { ok: true, kind: "senior", status: "confirmed" });
  }
});

test("common link administration rejects non-admins before issuing a token or reading accounts", async () => {
  let writes = 0;
  const route = loadRoute("../../app/api/admin/senior-signup/route.ts", {
    "next/server": { NextResponse },
    "@/server/supabase/server": { createRequestClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "ordinary-user" } } }) }, rpc: async () => ({ data: false }) }) },
    "@/server/supabase/admin": { createAdminClient: () => { writes++; throw new Error("Unexpected privileged client"); } },
    "@/server/env": { requiredServerEnv: () => pepper },
    "@/server/auth/identity": identity,
    "@/server/auth/senior-contracts": { seniorLinkCommandSchema },
  });
  assert.equal((await (route.GET as () => Promise<NextResponse>)()).status, 403);
  assert.equal((await (route.POST as (req: Request) => Promise<NextResponse>)(request({ action: "create" }))).status, 403);
  assert.equal(writes, 0);
});

test("authenticated pending UG login records the browser even though festival access remains denied", async () => {
  const marker = browserTools.signupBrowser(undefined, pepper);
  let recorded = 0, signedOut = 0;
  const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: { state: "pending" } }) };
  const route = loadRoute("../../app/api/auth/login/route.ts", {
    "@supabase/ssr": { createServerClient: () => ({ auth: { signInWithPassword: async () => ({ data: { user: { id: "pending-ug" } } }), signOut: async () => { signedOut++; } }, from: () => query }) },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) }, "next/server": { NextResponse },
    "@/server/auth/contracts": await import("./contracts"),
    "@/server/auth/identity": identity,
    "@/server/auth/access-status": await import("./access-status"),
    "@/server/auth/rate-limit": rateLimits,
    "@/server/env": { requiredServerEnv: () => pepper, hasSupabaseConfiguration: () => true },
    "@/server/supabase/admin": { createAdminClient: () => ({ rpc: async () => ({ data: true }) }) },
    "@/server/auth/remember-signup-browser": { rememberSignupBrowser: async (id: string) => { assert.equal(id, "pending-ug"); recorded++; return marker; } },
    "@/server/auth/signup-browser": browserTools,
  });
  const response = await (route.POST as (req: Request) => Promise<NextResponse>)(request({ batch: "2023", rollNumber: "14", password: "TestPassword!123" }));
  assert.equal(response.status, 403);
  assert.equal(response.cookies.get(browserTools.SIGNUP_BROWSER_COOKIE)?.value, marker);
  assert.equal(recorded, 1); assert.equal(signedOut, 1);
});
