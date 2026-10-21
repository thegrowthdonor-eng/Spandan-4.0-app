import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export async function proxy(request: NextRequest) {
  if (!hasPublicSupabaseConfiguration()) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
        path: "/",
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, responseHeaders) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          Object.entries(responseHeaders ?? {}).forEach(([name, value]) => response.headers.set(name, value));
        },
      },
    },
  );

  // Refresh and validate the cookie-backed session before Server Components run.
  await client.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
