import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { normaliseIndianPhone } from "@/server/auth/contracts";
import { toPrivateAuthEmail } from "@/server/auth/identity";
import { hasSupabaseConfiguration, requiredServerEnv } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";

const schema = z.object({
  setupCode: z.string().min(1),
  editionName: z.string().trim().min(1).max(120),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  batchLabel: z.string().trim().min(1).max(80),
  courseLabel: z.string().trim().max(120).optional(),
  fullName: z.string().trim().min(1).max(100),
  rollNumber: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(8).max(256),
});

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin"); if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid setup request." }, { status: 403, headers });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: "Check the setup details and try again." }, { status: 400, headers }); }
  const parsed = schema.safeParse(body); if (!parsed.success || !hasSupabaseConfiguration()) return NextResponse.json({ error: "Initial setup is unavailable." }, { status: 503, headers });
  const expected = Buffer.from(requiredServerEnv("INITIAL_SETUP_CODE")); const supplied = Buffer.from(parsed.data.setupCode);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return NextResponse.json({ error: "Invalid setup code." }, { status: 403, headers });
  if (parsed.data.endsOn < parsed.data.startsOn) return NextResponse.json({ error: "End date must be on or after the start date." }, { status: 400, headers });
  let phone: string; try { phone = normaliseIndianPhone(parsed.data.phone); } catch { return NextResponse.json({ error: "Check the phone number and try again." }, { status: 400, headers }); }
  const pepper = requiredServerEnv("AUTH_IDENTITY_PEPPER"); const roll = parsed.data.rollNumber.normalize("NFKC").replace(/\s+/g, " ").toLocaleUpperCase("en-IN"); const authEmail = toPrivateAuthEmail({ batch: parsed.data.batchLabel, rollNumber: roll }, pepper); const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email: authEmail, password: parsed.data.password, email_confirm: true });
  if (createError || !created.user) return NextResponse.json({ error: "Unable to create the owner account." }, { status: 409, headers });
  const { error } = await admin.rpc("bootstrap_main_admin", { p_auth_user_id: created.user.id, p_edition_name: parsed.data.editionName, p_starts_on: parsed.data.startsOn, p_ends_on: parsed.data.endsOn, p_batch_label: parsed.data.batchLabel, p_course_label: parsed.data.courseLabel ?? "", p_full_name: parsed.data.fullName, p_roll_canonical: roll, p_phone_e164: phone, p_fest_id: `SPD-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`, p_auth_email: authEmail });
  if (error) { await admin.auth.admin.deleteUser(created.user.id); return NextResponse.json({ error: "Initial setup is already complete or could not be saved." }, { status: 409, headers }); }
  return NextResponse.json({ ok: true }, { status: 201, headers });
}
