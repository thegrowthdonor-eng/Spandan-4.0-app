import { NextResponse } from "next/server";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { seniorCommandSchema } from "@/server/auth/senior-contracts";
import { createRecoveryToken, hashRateLimitKey } from "@/server/auth/identity";
import { requiredServerEnv } from "@/server/env";

const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
async function actor() {
 const client = await createRequestClient();
 const { data } = await client.auth.getUser();
 if (!data.user || (await client.rpc("is_main_admin")).data !== true) return null;
 return data.user.id;
}
export async function GET() {
 try {
  const id = await actor();
  if (!id) return NextResponse.json({ error: "Main Admin required." }, { status: 403, headers });
  const { data, error } = await createAdminClient().rpc("manage_senior_invite", { p_actor: id, p_payload: { action: "list" } });
  if (error) throw error;
  return NextResponse.json({ invites: data }, { headers });
 } catch { return NextResponse.json({ error: "Invitations unavailable." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
 if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid origin." }, { status: 403, headers });
 try {
  const id = await actor();
  if (!id) return NextResponse.json({ error: "Main Admin required." }, { status: 403, headers });
  const parsed = seniorCommandSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers });
  const admin = createAdminClient();
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const limit = await admin.rpc("consume_auth_rate_limit", { p_key_hash: hashRateLimitKey("invite-admin:"+id, pepper), p_max_attempts: 30, p_window_seconds: 900 });
  if (limit.error || limit.data !== true) return NextResponse.json({ error: "Please try again later." }, { status: 429, headers });
  const token = createRecoveryToken();
  const { data, error } = await admin.rpc("manage_senior_invite", { p_actor: id, p_payload: parsed.data, p_hash: hashRateLimitKey("senior-invite:"+token, pepper) });
  if (error) return NextResponse.json({ error: error.code === "23505" ? "This mobile already has an account or invite. Use reissue or recovery." : error.code === "22023" ? error.message : "Unable to update invitation." }, { status: 400, headers });
  return NextResponse.json({ ok: true, invite: data, setupPath: ["issue","reissue"].includes(parsed.data.action) ? "/account/invite#"+token : undefined }, { headers });
 } catch { return NextResponse.json({ error: "Unable to process invitation." }, { status: 503, headers }); }
}
