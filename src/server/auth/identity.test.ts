import assert from "node:assert/strict";
import test from "node:test";
import { canonicaliseBatchRoll, createRecoveryToken, hashRateLimitKey, hashRecoveryToken, toPrivateAuthEmail } from "./identity";

const pepper = "test-pepper-must-be-at-least-thirty-two-characters";

test("canonicalises harmless batch formatting while preserving a canonical roll", () => {
  assert.deepEqual(canonicaliseBatchRoll({ batch: " mbbs   2024 ", rollNumber: " 47 " }), {
    batch: "MBBS 2024",
    rollNumber: "47",
  });
});

test("produces stable, private reserved-domain email identities", () => {
  const identifier = toPrivateAuthEmail({ batch: "MBBS 2024", rollNumber: "47" }, pepper);
  assert.match(identifier, /^spandan\+[a-f0-9]{64}@spandan\.invalid$/);
  assert.equal(identifier, toPrivateAuthEmail({ batch: " mbbs  2024 ", rollNumber: "47" }, pepper));
  assert.notEqual(identifier, toPrivateAuthEmail({ batch: "MBBS 2024", rollNumber: "48" }, pepper));
});

test("rejects a dangerously short identity pepper", () => {
  assert.throws(() => toPrivateAuthEmail({ batch: "MBBS 2024", rollNumber: "47" }, "short"));
});

test("hashes rate-limit keys without retaining identifiers", () => {
  const hash = hashRateLimitKey("account:MBBS 2024\u001f47", pepper);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(hash.includes("47"), false);
  assert.equal(hash.includes("MBBS"), false);
});

test("creates high-entropy opaque recovery tokens and persists only a domain-separated hash", () => {
  const token = createRecoveryToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hashRecoveryToken(token, pepper), hashRateLimitKey(token, pepper));
  assert.equal(hashRecoveryToken(token, pepper), hashRecoveryToken(token, pepper));
});
