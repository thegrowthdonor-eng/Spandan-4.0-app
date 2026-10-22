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
});
