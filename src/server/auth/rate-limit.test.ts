import assert from "node:assert/strict";
import test from "node:test";
import { AUTH_RATE_LIMIT_WINDOW_SECONDS, authRateLimits, getRequestNetworkKey, rateLimitHeaders } from "./rate-limit";

test("shared-network limits retain strict subject protection while allowing campus bursts", () => {
  assert.equal(authRateLimits.seniorInvite.subjectAttempts, 5);
  assert.ok(authRateLimits.seniorInvite.networkAttempts > authRateLimits.seniorInvite.subjectAttempts);
  assert.equal(authRateLimits.signup.subjectAttempts, 5);
  assert.ok(authRateLimits.signup.networkAttempts > authRateLimits.signup.subjectAttempts);
});

test("network keys use the proxy's first forwarded address and rate limits advertise a retry", () => {
  const request = new Request("https://spandan.example/api/auth/login", {
    headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.1" },
  });
  assert.equal(getRequestNetworkKey(request), "203.0.113.8");
  assert.equal(rateLimitHeaders().get("Retry-After"), String(AUTH_RATE_LIMIT_WINDOW_SECONDS));
});
