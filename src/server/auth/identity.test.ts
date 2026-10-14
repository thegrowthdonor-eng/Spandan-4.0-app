import assert from "node:assert/strict";
import test from "node:test";
import { canonicaliseBatchRoll, toPrivateAuthPhone } from "./identity";

const pepper = "test-pepper-must-be-at-least-thirty-two-characters";

test("canonicalises harmless batch-roll formatting without losing meaningful characters", () => {
  assert.deepEqual(canonicaliseBatchRoll({ batch: " mbbs   2024 ", rollNumber: " 047 " }), {
    batch: "MBBS 2024",
    rollNumber: "047",
  });
});

test("produces stable, private phone-shaped auth identities", () => {
  const identifier = toPrivateAuthPhone({ batch: "MBBS 2024", rollNumber: "047" }, pepper);
  assert.match(identifier, /^\+91\d{10}$/);
  assert.equal(identifier, toPrivateAuthPhone({ batch: " mbbs  2024 ", rollNumber: "047" }, pepper));
  assert.notEqual(identifier, toPrivateAuthPhone({ batch: "MBBS 2024", rollNumber: "048" }, pepper));
});

test("rejects a dangerously short identity pepper", () => {
  assert.throws(() => toPrivateAuthPhone({ batch: "MBBS 2024", rollNumber: "047" }, "short"));
});
