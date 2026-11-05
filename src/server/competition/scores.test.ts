import assert from "node:assert/strict";
import test from "node:test";
import { displayCricketOvers, validateScore } from "./scores";

test("renders legal cricket balls without decimal-over arithmetic", () => {
  assert.equal(displayCricketOvers(17, 5), "17.5");
  assert.throws(() => displayCricketOvers(17, 6));
});

test("rejects invalid sport payloads while accepting defined templates", () => {
  assert.deepEqual(validateScore("football", { teamA_goals: "2", teamB_goals: "1" }), { teamA_goals: "2", teamB_goals: "1" });
  assert.throws(() => validateScore("football", { teamA_goals: -1, teamB_goals: 1 }));
  assert.throws(() => validateScore("cricket", { teamA_runs: "8", teamA_wickets: "0", teamA_overs: "1.6", teamB_runs: "0", teamB_wickets: "0", teamB_overs: "0.0" }));
  assert.deepEqual(validateScore("basketball", { teamA_score: 42, teamB_score: 39, quarter: "Q3" }), { teamA_score: 42, teamB_score: 39, quarter: "Q3" });
  assert.deepEqual(validateScore("set_based", { teamA_points: 3, teamB_points: 2, sets: [{ teamA: 21, teamB: 18 }], best_of: 3 }), { teamA_points: 3, teamB_points: 2, sets: [{ teamA: 21, teamB: 18 }], best_of: 3 });
});
