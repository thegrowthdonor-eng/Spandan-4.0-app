import assert from "node:assert/strict";
import test from "node:test";
import { normaliseIndianPhone } from "./contracts";

test("normalises Indian student phone input without changing the stored country code", () => {
  assert.equal(normaliseIndianPhone("98765 43210"), "+919876543210");
  assert.equal(normaliseIndianPhone("+91-9876543210"), "+919876543210");
  assert.throws(() => normaliseIndianPhone("1234567890"));
});
