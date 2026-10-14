import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";

const batchRollSchema = z.object({
  batch: z.string().trim().min(1).max(80),
  rollNumber: z.string().trim().min(1).max(80),
});

export type BatchRoll = z.infer<typeof batchRollSchema>;

export function canonicaliseBatchRoll(input: BatchRoll) {
  const parsed = batchRollSchema.parse(input);
  return {
    batch: parsed.batch.normalize("NFKC").replace(/\s+/g, " ").toLocaleUpperCase("en-IN"),
    rollNumber: parsed.rollNumber.normalize("NFKC").replace(/\s+/g, " ").toLocaleUpperCase("en-IN"),
  };
}

/**
 * Generates a private, deterministic phone-shaped Auth identifier. It is not a student's phone
 * number and is never returned from account APIs. The real phone remains in `profiles` only.
 *
 * The 10-digit namespace is guarded by a unique mapping table. A mapping collision must be
 * detected during provisioning and escalated, never silently pointed at another account.
 */
export function toPrivateAuthPhone(input: BatchRoll, pepper: string) {
  if (pepper.length < 32) throw new Error("AUTH_IDENTITY_PEPPER must be at least 32 characters.");
  const canonical = canonicaliseBatchRoll(input);
  const digest = createHmac("sha256", pepper)
    .update(`${canonical.batch}\u001f${canonical.rollNumber}`, "utf8")
    .digest("hex");
  const digits = BigInt(`0x${digest.slice(0, 16)}`) % 10_000_000_000n;
  return `+91${digits.toString().padStart(10, "0")}`;
}

export function hashRateLimitKey(value: string, pepper: string) {
  if (pepper.length < 32) throw new Error("AUTH_IDENTITY_PEPPER must be at least 32 characters.");
  return createHmac("sha256", pepper).update(value, "utf8").digest("hex");
}

/** A recovery token is an opaque server-generated capability; only its HMAC is stored. */
export function createRecoveryToken() {
  return randomBytes(32).toString("base64url");
}

export function hashRecoveryToken(token: string, pepper: string) {
  if (pepper.length < 32) throw new Error("AUTH_IDENTITY_PEPPER must be at least 32 characters.");
  return createHmac("sha256", pepper).update(`recovery-token\\u001f${token}`, "utf8").digest("hex");
}
