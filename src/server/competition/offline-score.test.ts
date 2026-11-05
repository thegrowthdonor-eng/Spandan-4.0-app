import assert from "node:assert/strict";
import test from "node:test";
import { isCricHeroesUrl, syncScoreSchema } from "./offline-score";

test("only accepts official HTTPS CricHeroes links", () => {
  assert.equal(isCricHeroesUrl("https://cricheroes.com/scorecard/example"), true);
  assert.equal(isCricHeroesUrl("https://www.cricheroes.com/tournament/1"), true);
  assert.equal(isCricHeroesUrl("https://cricheroes.com.evil.test/match"), false);
  assert.equal(isCricHeroesUrl("http://cricheroes.com/match"), false);
});

test("offline sync requires an idempotent ordered checkpoint", () => {
  const result = syncScoreSchema.safeParse({
    fixtureId: "c0a80101-0000-4000-8000-000000000001",
    deviceId: "c0a80101-0000-4000-8000-000000000002",
    baseVersion: 2,
    checkpoints: [{
      clientMutationId: "c0a80101-0000-4000-8000-000000000003",
      localRevision: 1,
      scorePayload: { teamA_goals: 1, teamB_goals: 0 },
      status: "live",
      provisional: false,
      recordedAt: "2026-12-03T10:00:00.000Z",
    }],
  });
  assert.equal(result.success, true);
});
