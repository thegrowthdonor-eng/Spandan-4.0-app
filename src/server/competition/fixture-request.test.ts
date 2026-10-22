import assert from "node:assert/strict";
import test from "node:test";
import { parseFixturePayload } from "./fixture-request";

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
