import { test } from "node:test";
import assert from "node:assert/strict";
import { teamCommandSchema } from "./team-contracts";
const id = "d34db33f-1234-4234-8234-123456789abc";
test("appointment cannot set the initial team name or members", () => {
  const appointment = { action: "appoint", eventId: id, groupId: null, leaderApplicationId: id };
  assert.equal(teamCommandSchema.safeParse(appointment).success, true);
  assert.equal(teamCommandSchema.safeParse({ ...appointment, name: "Admin's squad" }).success, false);
  assert.equal(teamCommandSchema.safeParse({ ...appointment, applicationIds: [id] }).success, false);
});
test("roster changes require a version and cannot contain duplicate members", () => {
  const save = { action: "save", eventId: id, groupId: id, version: 0, name: "2024 Football", applicationIds: [id] };
  assert.equal(teamCommandSchema.safeParse(save).success, true);
  assert.equal(teamCommandSchema.safeParse({ ...save, version: undefined }).success, false);
  assert.equal(teamCommandSchema.safeParse({ ...save, applicationIds: [id, id] }).success, false);
  assert.equal(teamCommandSchema.safeParse({ action: "return", eventId: id, groupId: id, version: 1, reason: " " }).success, false);
});
test("pair commands accept registration answers, not a captain or replacement member", () => {
  const acceptance = { action: "accept", eventId: id, invitationId: id, answers: { position: "A" } };
  assert.equal(teamCommandSchema.safeParse(acceptance).success, true);
  assert.equal(teamCommandSchema.safeParse({ ...acceptance, partnerId: id }).success, false);
  assert.equal(teamCommandSchema.safeParse({ ...acceptance, captainId: id }).success, false);
});
