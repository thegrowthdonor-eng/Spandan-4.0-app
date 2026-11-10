import assert from "node:assert/strict";
import test from "node:test";
import { scorerPayload } from "./offline-score-store";
import { validateScore } from "../server/competition/scores";

test("legacy badminton sets survive opening the mobile scorer", () => {
  const payload = scorerPayload("badminton", { set1: "21-18", set2: "19-21", set3: "21-15", winner: "Falcons" });
  assert.deepEqual(payload.sets, [{ teamA: 21, teamB: 18 }, { teamA: 19, teamB: 21 }, { teamA: 21, teamB: 15 }]);
  assert.equal(payload.winner, "Falcons");
  assert.doesNotThrow(() => validateScore("badminton", payload));
});

test("a server-started clock and legacy winner can be scored without losing fields", () => {
  assert.doesNotThrow(() => validateScore("football", scorerPayload("football", { teamA_goals: 1, teamB_goals: 0, clock_started_at: "2026-12-01T10:00:00+00:00", clock_running: true })));
  const payload = scorerPayload("generic", { winner: "Player 1" });
  assert.equal(payload.winner, "Player 1");
  assert.doesNotThrow(() => validateScore("generic", payload));
});
