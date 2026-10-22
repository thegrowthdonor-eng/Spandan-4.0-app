import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { normaliseIndianPhone, signUpSchema } from "@/server/auth/contracts";
import { hashRateLimitKey, toPrivateAuthEmail } from "@/server/auth/identity";
import { authRateLimits, AUTH_RATE_LIMIT_WINDOW_SECONDS, getRequestNetworkKey, rateLimitHeaders } from "@/server/auth/rate-limit";
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
  const networkKey = getRequestNetworkKey(request);
  const rateKeys = [
    { key: `signup-phone:${phone}`, maxAttempts: authRateLimits.signup.subjectAttempts },
    { key: `signup-ip:${networkKey}`, maxAttempts: authRateLimits.signup.networkAttempts },
  ];
  const rateChecks = await Promise.all(rateKeys.map(({ key, maxAttempts }) => admin.rpc("consume_auth_rate_limit", {
    p_key_hash: hashRateLimitKey(key, pepper),
    p_max_attempts: maxAttempts,
    p_window_seconds: AUTH_RATE_LIMIT_WINDOW_SECONDS,
  })));
  if (rateChecks.some((check) => check.error)) return NextResponse.json({ error: "Account setup is currently unavailable." }, { status: 503, headers: noStore });
  if (rateChecks.some((check) => check.data !== true)) return NextResponse.json({ error: "Please wait before trying again." }, { status: 429, headers: rateLimitHeaders(noStore) });

  const { data: batch, error: batchError } = await admin.from("batches").select("id, edition_id, label, eligible").eq("id", parsed.data.batchId).maybeSingle();
  if (batchError || !batch?.eligible) return NextResponse.json({ error: "Check your profile details and try again." }, { status: 400, headers: noStore });

  const canonicalRoll = parsed.data.rollNumber;

  // Check if a profile with this roll number already exists in this batch
  const { data: existingProfiles } = await admin
    .from("profiles")
    .select("id, full_name, roll_canonical, access_records(state)")
    .eq("batch_id", batch.id);

  const matchedExisting = (existingProfiles ?? []).find((p) => p.roll_canonical === canonicalRoll);

  if (matchedExisting) {
    const accessRecords = matchedExisting.access_records as Array<{ state: string }> | null;
    const isVerifiedActive = accessRecords?.some((ar) => ar.state === "active");

    if (isVerifiedActive) {
      // 1st requirement: Only verified profiles reserve the roll number!
      return NextResponse.json({
        error: `Roll number ${parsed.data.rollNumber} is already verified and registered in this batch. If this is your account, please sign in or visit the registration desk.`,
      }, { status: 409, headers: noStore });
    } else {
      // Unverified/fake account: roll number is NOT reserved. Purge unverified profile and its auth user.
      await admin.rpc("delete_student_profile", { p_profile_id: matchedExisting.id });
      await admin.auth.admin.deleteUser(matchedExisting.id);
    }
  }

  const authEmail = toPrivateAuthEmail({ batch: batch.label, rollNumber: canonicalRoll }, pepper);
  let authUser = null;
  const createRes = await admin.auth.admin.createUser({ email: authEmail, password: parsed.data.password, email_confirm: true });

  if (createRes.error || !createRes.data.user) {
    // If an orphan auth user exists with this email, purge it and retry
    const { data: usersData } = await admin.auth.admin.listUsers();
    const existingAuth = usersData?.users.find((u) => u.email === authEmail);
    if (existingAuth) {
      await admin.rpc("delete_student_profile", { p_profile_id: existingAuth.id });
      await admin.auth.admin.deleteUser(existingAuth.id);
      const retryCreate = await admin.auth.admin.createUser({ email: authEmail, password: parsed.data.password, email_confirm: true });
      if (retryCreate.data.user) authUser = retryCreate.data.user;
    }
    if (!authUser) {
      return NextResponse.json({ error: "Unable to create this account. Please visit the registration desk for assistance." }, { status: 409, headers: noStore });
    }
  } else {
    authUser = createRes.data.user;
  }

  const festId = `SPD-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
  const { error: profileError } = await admin.rpc("provision_student_profile", {
    p_auth_user_id: authUser.id,
    p_edition_id: batch.edition_id,
    p_batch_id: batch.id,
    p_full_name: parsed.data.fullName,
    p_roll_canonical: canonicalRoll,
    p_phone_e164: phone,
    p_fest_id: festId,
    p_auth_email: authEmail,
    p_gender: parsed.data.gender,
  });
  if (profileError) {
    await admin.rpc("delete_student_profile", { p_profile_id: authUser.id });
    await admin.auth.admin.deleteUser(authUser.id);
    return NextResponse.json({ error: "Unable to create this account. If you already registered, use account help." }, { status: 409, headers: noStore });
  }
  return NextResponse.json({ ok: true, message: "Profile created. Your account will remain pending until contribution verification is completed." }, { status: 201, headers: noStore });
}
