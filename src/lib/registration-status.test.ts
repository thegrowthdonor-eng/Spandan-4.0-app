import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationStatus, registrationError, registrationStatus, registrationTime } from "./registration-status";

const event = { state: "open", registration_enabled: true, application_opens_at: "2026-11-15T23:31:00Z", application_closes_at: "2026-11-28T18:29:00Z" };
test("registration opens inclusively and closes exclusively, independently of format", () => {
  assert.equal(registrationStatus(event, new Date("2026-11-15T23:30:59Z")), "scheduled");
  assert.equal(registrationStatus(event, new Date(event.application_opens_at)), "open");
  assert.equal(registrationStatus(event, new Date(event.application_closes_at)), "closed");
  for (const state of ["published", "ongoing", "draft"]) assert.equal(registrationStatus({ ...event, state }, new Date(event.application_opens_at)), "unavailable");
  assert.equal(registrationStatus({ ...event, application_opens_at: null }), "unavailable");
  assert.equal(registrationStatus({ ...event, registration_enabled: false }), "information");
  assert.match(registrationTime(event.application_opens_at), /16 Nov 2026.*5:01.*am IST/i);
});
test("registration errors expose only allowlisted messages", () => {
  assert.equal(registrationError("gender_mismatch")?.status, 403);
  assert.equal(registrationError("invalid_answers")?.reason, "invalid_answers");
  assert.equal(registrationError("private database failure"), null);
  assert.equal(registrationError("toString"), null);
});
test("registration approval is distinct from proposed and final selection", () => {
  assert.equal(applicationStatus("submitted", "unselected", true), "Registration under review");
  assert.equal(applicationStatus("approved", "unselected", true), "Approved · awaiting team selection");
  assert.equal(applicationStatus("approved", "unselected", true, true), "Approved · proposed for roster");
  assert.equal(applicationStatus("approved", "selected", true), "Selected · final roster");
  assert.equal(applicationStatus("withdrawn", "unselected", true), "Withdrawn");
});
