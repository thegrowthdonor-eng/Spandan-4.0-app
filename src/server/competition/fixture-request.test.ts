import assert from "node:assert/strict";
import test from "node:test";
import { parseFixturePayload } from "./fixture-request";

const id = "c0a80101-0000-4000-8000-000000000001";
const other = "c0a80101-0000-4000-8000-000000000002";
const typed = { action:"create", eventId:id, stage:"Final", participantA:{kind:"group",id}, participantB:{kind:"group",id:other}, reportingAt:null, startsAt:"2026-12-03T10:00:00Z" };
test("fixture creation accepts typed roster identities and preserves the legacy envelope", () => {
  assert.equal(parseFixturePayload(typed).success, true);
  assert.equal(parseFixturePayload({eventId:id,stage:"Round 1",participantALabel:"A",participantBLabel:"B",reportingAt:null,startsAt:null}).success, true);
  assert.equal(parseFixturePayload({action:"bulk_create",eventId:id,fixtures:[typed]}).success, true);
});
test("fixture trust boundary rejects missing, mixed, duplicate and spoofed opponents", () => {
  for (const change of [
    {participantB:undefined}, {participantB:{kind:"application",id:other}}, {participantB:typed.participantA},
    {participantALabel:"Spoofed team"}, {participantA:{kind:"group",id:"invalid"}},
    {reportingAt:"2026-12-03T11:00:00Z"}, {startsAt:null,reportingAt:"2026-12-03T09:00:00Z"},
  ]) assert.equal(parseFixturePayload({...typed,...change}).success, false);
});

test("explicit start accepts only a valid fixture identifier", () => {
  assert.equal(parseFixturePayload({ action: "start", fixtureId: "c0a80101-0000-4000-8000-000000000001" }).success, true);
  assert.equal(parseFixturePayload({ action: "start", fixtureId: "invalid" }).success, false);
});

test("fixture payload parser rejects JSON null as a client error", () => {
  const result = parseFixturePayload(null);
  assert.equal(result.success, false);
  if (!result.success) assert.match(result.error, /required|invalid/i);
});

test("fixture payload parser accepts a valid command envelope", () => {
  const result = parseFixturePayload({
    action: "reminders",
    fixtureId: "c0a80101-0000-4000-8000-000000000001",
    body: "Please report fifteen minutes early.",
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.command.action, "reminders");
});
