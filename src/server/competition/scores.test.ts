import assert from "node:assert/strict";
import test from "node:test";
import { displayCricketOvers, validateScore } from "./scores";

test("renders legal cricket balls without decimal-over arithmetic", () => {
  assert.equal(displayCricketOvers(17, 5), "17.5");
  assert.throws(() => displayCricketOvers(17, 6));
});

test("rejects invalid sport payloads while accepting defined templates", () => {
  assert.deepEqual(validateScore("football", { teamAGoals: 2, teamBGoals: 1, period: "second_half" }), { teamAGoals: 2, teamBGoals: 1, period: "second_half" });
  assert.throws(() => validateScore("cricket", { teamA: { runs: 8, wickets: 0, completedOvers: 1, legalBalls: 6 }, teamB: { runs: 0, wickets: 0, completedOvers: 0, legalBalls: 0 }, innings: 1 }));
});
