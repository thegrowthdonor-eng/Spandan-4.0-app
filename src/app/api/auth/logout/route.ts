import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const accept = request.headers.get("accept") ?? "";
  const isJson = accept.includes("application/json") || request.headers.get("content-type")?.includes("application/json");

  let response: NextResponse;
  if (isJson) {
    response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } else {
    response = NextResponse.redirect(new URL("/", request.url), 303);
  }

  if (hasSupabaseConfiguration()) {
    const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
      },
    });
    try {
      await client.auth.signOut();
    } catch {
      // Ignore if already signed out
    }
  }

  // Explicitly purge all supabase/auth cookies
  cookieStore.getAll().forEach((c) => {
    if (c.name.includes("sb-") || c.name.includes("auth") || c.name.includes("supabase")) {
      response.cookies.delete(c.name);
    }
  });

  return response;
}

export async function GET(request: Request) {
  return POST(request);
}
