import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { hashRateLimitKey } from "./identity";

export const SIGNUP_BROWSER_COOKIE = "spandan_signup_browser";

export function signupBrowser(value: string | undefined, pepper: string) {
  const [token, signature] = value?.split(".") ?? [];
  if (token && signature && /^[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/.test(value ?? "")) {
    const expected = hashRateLimitKey(`signup-browser-cookie:${token}`, pepper);
    if (timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return value!;
  }
  const fresh = randomBytes(32).toString("base64url");
  return `${fresh}.${hashRateLimitKey(`signup-browser-cookie:${fresh}`, pepper)}`;
}

export function signupBrowserHash(value: string, pepper: string) {
  return hashRateLimitKey(`signup-browser:${value}`, pepper);
}

export function setSignupBrowser(response: NextResponse, value: string) {
  // shortcut: browser storage can be cleared, upgrade to verified invitations if stronger identity is needed.
  response.cookies.set(SIGNUP_BROWSER_COOKIE, value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
}
