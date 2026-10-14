import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normaliseIndianPhone, signUpSchema } from "@/server/auth/contracts";
import { hashRateLimitKey, toPrivateAuthPhone } from "@/server/auth/identity";
import { hasSupabaseConfiguration, requiredServerEnv } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Unable to create an account." }, { status: 400, headers: noStore }); }
  const parsed = signUpSchema.safeParse(body);
  if (!parsed.success || !hasSupabaseConfiguration()) return NextResponse.json({ error: "Account setup is currently unavailable." }, { status: 503, headers: noStore });
  let phone: string;
  try { phone = normaliseIndianPhone(parsed.data.phone); } catch { return NextResponse.json({ error: "Check your profile details and try again." }, { status: 400, headers: noStore }); }
  const admin = createAdminClient();
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER");
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateKeys = [hashRateLimitKey(`signup-phone:${phone}`, pepper), hashRateLimitKey(`signup-ip:${forwardedFor}`, pepper)];
  const rateChecks = await Promise.all(rateKeys.map((key) => admin.rpc("consume_auth_rate_limit", { p_key_hash: key, p_max_attempts: 5, p_window_seconds: 900 })));
  if (rateChecks.some((check) => check.error)) return NextResponse.json({ error: "Account setup is currently unavailable." }, { status: 503, headers: noStore });
  if (rateChecks.some((check) => check.data !== true)) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429, headers: noStore });

  const { data: batch, error: batchError } = await admin.from("batches").select("id, edition_id, label, eligible").eq("id", parsed.data.batchId).maybeSingle();
  if (batchError || !batch?.eligible) return NextResponse.json({ error: "Check your profile details and try again." }, { status: 400, headers: noStore });
  const authPhone = toPrivateAuthPhone({ batch: batch.label, rollNumber: parsed.data.rollNumber }, pepper);
  const { data: auth, error: authError } = await admin.auth.admin.createUser({ phone: authPhone, password: parsed.data.password, phone_confirm: true });
  if (authError || !auth.user) return NextResponse.json({ error: "Unable to create this account. If you already registered, use account help." }, { status: 409, headers: noStore });
  const festId = `SPD-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const { error: profileError } = await admin.rpc("provision_student_profile", {
    p_auth_user_id: auth.user.id,
    p_edition_id: batch.edition_id,
    p_batch_id: batch.id,
    p_full_name: parsed.data.fullName,
    p_roll_canonical: parsed.data.rollNumber.trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleUpperCase("en-IN"),
    p_phone_e164: phone,
    p_fest_id: festId,
    p_auth_phone_e164: authPhone,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(auth.user.id);
    return NextResponse.json({ error: "Unable to create this account. If you already registered, use account help." }, { status: 409, headers: noStore });
  }
  return NextResponse.json({ ok: true, message: "Profile created. Your account will remain pending until contribution verification is completed." }, { status: 201, headers: noStore });
}
