import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/maintenance", request.url));
  response.cookies.delete("spandan_maintenance_bypass");
  return response;
}
