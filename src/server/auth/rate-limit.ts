export const AUTH_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

/**
 * Identity/token limits stop focused credential and invite abuse. Network
 * limits are deliberately higher: a campus NAT or registration desk is a
 * shared backstop, not an identity boundary.
 */
export const authRateLimits = {
  login: { subjectAttempts: 10, networkAttempts: 60 },
  signup: { subjectAttempts: 5, networkAttempts: 30 },
  seniorInvite: { subjectAttempts: 5, networkAttempts: 30 },
  recovery: { subjectAttempts: 5, networkAttempts: 20 },
  adminInvite: { subjectAttempts: 30 },
} as const;

/** Hosting must overwrite forwarding headers at the edge. */
export function getRequestNetworkKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const address = forwarded || realIp;
  return address && address.length <= 128 ? address.toLowerCase() : "unknown";
}

/** The database window begins at the first attempt, so this is conservative. */
export function rateLimitHeaders(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers);
  result.set("Cache-Control", "no-store");
  result.set("Retry-After", String(AUTH_RATE_LIMIT_WINDOW_SECONDS));
  return result;
}
