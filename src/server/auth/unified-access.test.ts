import assert from "node:assert/strict";
import test from "node:test";
import { ugBatches, batchDisplay, participantLabels } from "@/lib/participants";
import { signInSchema, resultSchema } from "./contracts";
import { seniorCommandSchema, seniorRedeemSchema } from "./senior-contracts";

test("ugBatches list maintains required cohort order and maps Interns to 2021 internal value", () => {
  assert.equal(ugBatches.length, 6);
  assert.deepEqual(ugBatches[0], { value: "2021", label: "Interns" });
  assert.deepEqual(
    ugBatches.map((b) => b.label),
    ["Interns", "2022", "2023", "2024", "2025", "2026"]
  );
  assert.deepEqual(
    ugBatches.map((b) => b.value),
    ["2021", "2022", "2023", "2024", "2025", "2026"]
  );
  assert.equal(batchDisplay("2021"), "Interns");
  assert.equal(batchDisplay("2023"), "2023");
  assert.equal(participantLabels.ug, "UG");
  assert.equal(participantLabels.pg, "PG");
  assert.equal(participantLabels.jr, "JR");
  assert.equal(participantLabels.faculty, "Faculty");
});

test("signInSchema parses both UG and Senior credentials backward-compatibly", () => {
  // UG credentials
  const ugValid = signInSchema.safeParse({
    batch: "2021",
    rollNumber: "1",
    password: "CorrectHorseBatteryStaple123!",
  });
  assert.equal(ugValid.success, true);

  // UG credentials with explicit mode
  const ugExplicit = signInSchema.safeParse({
    mode: "ug",
    batch: "2023",
    rollNumber: "45",
    password: "CorrectHorseBatteryStaple123!",
  });
  assert.equal(ugExplicit.success, true);

  // Senior credentials with 10-digit mobile
  const seniorValid = signInSchema.safeParse({
    mode: "senior",
    phone: "9876543210",
    password: "CorrectHorseBatteryStaple123!",
  });
  assert.equal(seniorValid.success, true);

  // Senior credentials with formatted mobile
  const seniorFormatted = signInSchema.safeParse({
    mode: "senior",
    phone: "+91 98765 43210",
    password: "CorrectHorseBatteryStaple123!",
  });
  assert.equal(seniorFormatted.success, true);

  // 8-character password boundary test
  const eightCharPass = signInSchema.safeParse({
    batch: "2023",
    rollNumber: "45",
    password: "12345678",
  });
  assert.equal(eightCharPass.success, true);

  // Rejection: 7-character password (below 8 minimum)
  const sevenCharPass = signInSchema.safeParse({
    batch: "2023",
    rollNumber: "45",
    password: "1234567",
  });
  assert.equal(sevenCharPass.success, false);

  // Rejection: short password
  const shortPass = signInSchema.safeParse({
    mode: "senior",
    phone: "9876543210",
    password: "short",
  });
  assert.equal(shortPass.success, false);

  // Rejection: missing roll for UG
  const missingRoll = signInSchema.safeParse({
    batch: "2023",
    password: "CorrectHorseBatteryStaple123!",
  });
  assert.equal(missingRoll.success, false);
});

test("seniorCommandSchema strictly validates and normalises senior invitation actions", () => {
  const editionId = "a0000000-0000-4000-8000-000000000001";

  // Issue invitation
  const issueParsed = seniorCommandSchema.safeParse({
    action: "issue",
    editionId,
    fullName: "Dr. Aarti Gupta",
    phone: "9876543210",
    category: "pg",
    department: "Anaesthesiology",
  });
  assert.equal(issueParsed.success, true);
  if (issueParsed.success && issueParsed.data.action === "issue") {
    assert.equal(issueParsed.data.phone, "+919876543210");
    assert.equal(issueParsed.data.category, "pg");
    assert.equal(issueParsed.data.department, "Anaesthesiology");
  }

  // Reject invalid category
  const badCategory = seniorCommandSchema.safeParse({
    action: "issue",
    editionId,
    fullName: "Dr. Aarti Gupta",
    phone: "9876543210",
    category: "ug", // senior commands only allow pg, jr, faculty
    department: "Anaesthesiology",
  });
  assert.equal(badCategory.success, false);

  // Reissue action
  const reissueParsed = seniorCommandSchema.safeParse({
    action: "reissue",
    inviteId: "a0000000-0000-4000-8000-000000000002",
  });
  assert.equal(reissueParsed.success, true);

  // Revoke action
  const revokeParsed = seniorCommandSchema.safeParse({
    action: "revoke",
    inviteId: "a0000000-0000-4000-8000-000000000002",
  });
  assert.equal(revokeParsed.success, true);

  // Update verified senior profile action
  const updateParsed = seniorCommandSchema.safeParse({
    action: "update",
    profileId: "a0000000-0000-4000-8000-000000000003",
    phone: "+91-9876543210",
    category: "faculty",
    department: "Cardiology",
  });
  assert.equal(updateParsed.success, true);
  if (updateParsed.success && updateParsed.data.action === "update") {
    assert.equal(updateParsed.data.phone, "+919876543210");
  }
});

test("seniorRedeemSchema validates single-use invite tokens", () => {
  // Valid 43-character url-safe base64 token
  const validToken = "A".repeat(43);
  const redeemParsed = seniorRedeemSchema.safeParse({
    token: validToken,
    password: "SecureSeniorPassword2026!",
    gender: "female",
  });
  assert.equal(redeemParsed.success, true);

  // Invalid token length
  const badToken = seniorRedeemSchema.safeParse({
    token: "too-short-token",
    password: "SecureSeniorPassword2026!",
    gender: "female",
  });
  assert.equal(badToken.success, false);
});

test("resultSchema allows solo, group, and batch winners and rejects unassigned placings", () => {
  const eventId = "a0000000-0000-4000-8000-000000000001";
  const appId = "a0000000-0000-4000-8000-000000000002";
  const grpId = "a0000000-0000-4000-8000-000000000003";
  const batchId = "a0000000-0000-4000-8000-000000000004";

  const validUnified = resultSchema.safeParse({
    action: "publish",
    eventId,
    positions: [
      { placing: 1, applicationId: appId, note: "Senior faculty winner" },
      { placing: 2, groupId: grpId, note: "Team winner" },
      { placing: 3, batchId: batchId, note: "Batch winner" },
    ],
  });
  assert.equal(validUnified.success, true);

  // Rejects placing without any winner identifier
  const invalidPlacing = resultSchema.safeParse({
    action: "publish",
    eventId,
    positions: [{ placing: 1, note: "Missing winner" }],
  });
  assert.equal(invalidPlacing.success, false);
});
