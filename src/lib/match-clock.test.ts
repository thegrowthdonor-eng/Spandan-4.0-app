import assert from "node:assert/strict";
import test from "node:test";
import { canStartMatch, formatMatchClock, fromISTInput, matchClockSeconds, toISTInput } from "./match-clock";

test("start is available only on the fixture's IST date, including midnight boundary", () => {
  const start = "2026-12-01T12:00:00Z";
  assert.equal(canStartMatch(start, "scheduled", Date.parse("2026-11-30T18:29:59Z")), false);
  assert.equal(canStartMatch(start, "scheduled", Date.parse("2026-11-30T18:30:00Z")), true);
  assert.equal(canStartMatch(start, "scheduled", Date.parse("2026-12-01T18:30:00Z")), false);
  assert.equal(canStartMatch(start, "completed", Date.parse(start)), false);
  assert.equal(canStartMatch(null, "scheduled"), false);
});

test("clock advances from its checkpoint, pauses, survives stale payloads, and counts down to zero", () => {
  const payload = { clock_seconds: 60, clock_running: true, clock_started_at: "2026-12-01T10:00:00Z" };
  const now = Date.parse("2026-12-01T10:02:05Z");
  assert.equal(matchClockSeconds(payload, false, now), 185);
  assert.equal(matchClockSeconds(payload, true, now), 0);
  assert.equal(matchClockSeconds({ ...payload, clock_running: false }, false, now), 60);
  assert.equal(matchClockSeconds({ ...payload, clock_started_at: "invalid" }, false, now), 60);
  assert.equal(formatMatchClock(185), "03:05");
});

test("fixture input uses IST regardless of the browser timezone", () => {
  assert.equal(toISTInput("2026-12-01T12:00:00Z"), "2026-12-01T17:30");
  assert.equal(fromISTInput("2026-12-01T17:30"), "2026-12-01T12:00:00.000Z");
});
