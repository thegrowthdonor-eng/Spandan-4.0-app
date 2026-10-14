import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recoveryIssueSchema } from "@/server/auth/contracts";
import { createRecoveryToken, hashRecoveryToken } from "@/server/auth/identity";
import { hasSupabaseConfiguration, requiredServerEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid recovery request." }, { status: 400, headers }); }
  const parsed = recoveryIssueSchema.safeParse(body);
  if (!parsed.success || !hasSupabaseConfiguration()) return NextResponse.json({ error: "Recovery is currently unavailable." }, { status: 503, headers });
  const response = NextResponse.json({ error: "Not authorised to issue recovery." }, { status: 403, headers });
  const cookieStore = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return response;
  const token = createRecoveryToken();
  const { data: expiresAt, error } = await client.rpc("issue_recovery_token", {
    p_profile_id: parsed.data.profileId,
    p_token_hash: hashRecoveryToken(token, requiredServerEnv("AUTH_IDENTITY_PEPPER")),
    p_reason: parsed.data.reason,
  });
  if (error || !expiresAt) return response;
  return NextResponse.json({ ok: true, token, expiresAt }, { headers });
}
