import assert from "node:assert/strict";
import test from "node:test";
import { accessDeniedMessage } from "./access-status";

test("access-state guidance is accurate without exposing account data", () => {
  assert.match(accessDeniedMessage("pending"), /Treasurer verification/i);
  assert.match(accessDeniedMessage("rejected"), /registration desk/i);
  assert.match(accessDeniedMessage("suspended"), /suspended/i);
  assert.match(accessDeniedMessage("unknown"), /festival help desk/i);
});
