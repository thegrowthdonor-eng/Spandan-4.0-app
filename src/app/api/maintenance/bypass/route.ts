import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const VALID_PASSKEYS = ["spandan2026", "spandan_dev", "asmc2026"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const passkey = typeof body.passkey === "string" ? body.passkey.trim() : "";

    if (!VALID_PASSKEYS.includes(passkey)) {
      return NextResponse.json({ ok: false, message: "Invalid organiser passkey." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true, message: "Bypass granted." });
    response.cookies.set("spandan_maintenance_bypass", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Error processing request" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const passkey = request.nextUrl.searchParams.get("passkey")?.trim() || "";
  const redirectTo = request.nextUrl.searchParams.get("from") || "/home";

  if (!VALID_PASSKEYS.includes(passkey)) {
    return NextResponse.redirect(new URL("/maintenance?error=invalid_passkey", request.url));
  }

  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set("spandan_maintenance_bypass", "1", {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
