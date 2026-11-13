import { NextResponse } from "next/server";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { requiredServerEnv } from "@/server/env";
import { createRecoveryToken, hashRateLimitKey } from "@/server/auth/identity";
import { seniorLinkCommandSchema } from "@/server/auth/senior-contracts";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
async function actor() {
  const client = await createRequestClient();
  const { data } = await client.auth.getUser();
  return data.user && (await client.rpc("is_main_admin")).data === true ? data.user.id : null;
}
export async function GET() {
  try {
    const id = await actor();
    if (!id) return NextResponse.json({ error: "Main Admin required." }, { status: 403, headers });
    const result = await createAdminClient().rpc("manage_senior_signup", { p_actor: id, p_payload: { action: "list" } });
    if (result.error) throw result.error;
    return NextResponse.json(result.data, { headers });
  } catch { return NextResponse.json({ error: "Signup controls unavailable." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403, headers });
  try {
    const id = await actor();
    if (!id) return NextResponse.json({ error: "Main Admin required." }, { status: 403, headers });
    const parsed = seniorLinkCommandSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the link settings." }, { status: 400, headers });
    const admin = createAdminClient();
    const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
    const limit = await admin.rpc("consume_auth_rate_limit", { p_key_hash: hashRateLimitKey(`senior-link-admin:${id}`, pepper), p_max_attempts: 30, p_window_seconds: 900 });
    if (limit.error) return NextResponse.json({ error: "Signup controls unavailable." }, { status: 503, headers });
    if (limit.data !== true) return NextResponse.json({ error: "Please try again later." }, { status: 429, headers: { ...headers, "Retry-After": "900" } });
    const token = createRecoveryToken();
    const result = await admin.rpc("manage_senior_signup", { p_actor: id, p_payload: parsed.data, p_hash: hashRateLimitKey(`senior-signup:${token}`, pepper) });
    if (result.error) return NextResponse.json({ error: result.error.code === "22023" ? result.error.message : "Unable to update signup controls." }, { status: 400, headers });
    return NextResponse.json({ ok: true, link: result.data, setupPath: ["create", "regenerate"].includes(parsed.data.action) ? `/account/join#${token}` : undefined }, { headers });
  } catch { return NextResponse.json({ error: "Unable to update signup controls." }, { status: 503, headers }); }
}
