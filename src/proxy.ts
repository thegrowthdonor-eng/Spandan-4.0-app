import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";

// Maintenance Mode is ACTIVE by default.
// To turn off later, simply set process.env.MAINTENANCE_MODE = "false"
const IS_MAINTENANCE_MODE = process.env.MAINTENANCE_MODE !== "false";

const ALLOWED_PATHS = [
  "/maintenance",
  "/api/maintenance",
  "/admin",
  "/api/admin",
  "/api/auth/login",
  "/api/auth/logout",
  "/manifest.webmanifest",
  "/spandan-logo.png",
  "/sw.js",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Check for URL bypass query parameter (e.g. ?bypass=spandan_dev or ?bypass=spandan2026)
  const bypassParam = request.nextUrl.searchParams.get("bypass");
  if (bypassParam === "spandan_dev" || bypassParam === "spandan2026") {
    const cleanUrl = new URL(request.url);
    cleanUrl.searchParams.delete("bypass");
    const response = NextResponse.redirect(cleanUrl);
    response.cookies.set("spandan_maintenance_bypass", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  }

  // 2. Intercept un-bypassed requests during maintenance mode
  // Local development / localhost is ALWAYS exempt so you can work freely without maintenance lock
  const isLocalEnvironment =
    process.env.NODE_ENV === "development" ||
    request.nextUrl.hostname === "localhost" ||
    request.nextUrl.hostname === "127.0.0.1" ||
    request.nextUrl.hostname === "::1" ||
    request.nextUrl.hostname.endsWith(".local");

  if (IS_MAINTENANCE_MODE && !isLocalEnvironment) {
    const hasBypassCookie = request.cookies.get("spandan_maintenance_bypass")?.value === "1";
    const isAllowedPath = ALLOWED_PATHS.some((path) => pathname === path || pathname.startsWith(path + "/"));

    if (!hasBypassCookie && !isAllowedPath) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            ok: false,
            maintenance: true,
            message: "Spandan 4.0 is currently under scheduled maintenance.",
          },
          { status: 503 }
        );
      }

      // Redirect to /maintenance
      const maintenanceUrl = new URL("/maintenance", request.url);
      if (pathname !== "/") {
        maintenanceUrl.searchParams.set("from", pathname);
      }
      return NextResponse.redirect(maintenanceUrl);
    }
  }

  // 3. Normal session handling
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
