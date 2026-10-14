import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  if (!hasSupabaseConfiguration()) return response;
  const cookieStore = await cookies();
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
    cookies: { getAll: () => cookieStore.getAll(), setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  await client.auth.signOut();
  return response;
}
