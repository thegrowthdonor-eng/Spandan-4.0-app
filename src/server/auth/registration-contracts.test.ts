import assert from "node:assert/strict";
import test from "node:test";

import {
  activationUpdateSchema,
  committeeRoleSchema,
  extractRollNumberInt,
  festivalSetupSchema,
  fixtureCommandSchema,
  isValidRollNumber,
  profileRemovalSchema,
  signUpSchema,
} from "./contracts";

const validSignup = {
  fullName: "Test Participant",
  batchId: "c0a80101-0000-4000-8000-000000000001",
  rollNumber: "1",
  phone: "9876543210",
  password: "strong-password",
};

test("signup requires a supported gender value", () => {
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "female" }).success, true);
  assert.equal(signUpSchema.safeParse(validSignup).success, false);
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "unsupported" }).success, false);
});

test("global registration window must close after it opens", () => {
  const base = {
    action: "setRegistrationWindow" as const,
    editionId: "c0a80101-0000-4000-8000-000000000002",
    applicationOpensAt: "2026-10-21T00:00:00.000Z",
  };

  assert.equal(festivalSetupSchema.safeParse({
    ...base,
    applicationClosesAt: "2026-11-21T00:00:00.000Z",
  }).success, true);
  assert.equal(festivalSetupSchema.safeParse({
    ...base,
    applicationClosesAt: "2026-10-20T00:00:00.000Z",
  }).success, false);
});

test("fixture reschedules require reporting before match start", () => {
  const base = {
    action: "reschedule" as const,
    fixtureId: "c0a80101-0000-4000-8000-000000000099",
    venue: "Ground A",
    reason: "Rain delay",
  };
  assert.equal(fixtureCommandSchema.safeParse({ ...base, reportingAt: "2026-10-22T09:00:00.000Z", startsAt: "2026-10-22T10:00:00.000Z" }).success, true);
  assert.equal(fixtureCommandSchema.safeParse({ ...base, reportingAt: "2026-10-22T11:00:00.000Z", startsAt: "2026-10-22T10:00:00.000Z" }).success, false);
});

test("new events accept an explicit competition division", () => {
  assert.equal(festivalSetupSchema.safeParse({
    action: "createEvent",
    editionId: "c0a80101-0000-4000-8000-000000000003",
    title: "Women's Singles",
    category: "sport",
    format: "solo",
    division: "girls",
    scoreTemplate: "badminton",
    summary: "",
    capacity: null,
    startsAt: null,
  }).success, true);
});

test("select application questions require a non-empty unique option set", () => {
  const base = {
    action: "updateEventFull" as const,
    eventId: "c0a80101-0000-4000-8000-000000000003",
    title: "Quiz", summary: "", rules: "", venue: "", capacity: null, waitlistEnabled: false,
    startsAt: null, eligibility: {}, groupMinSize: null, groupMaxSize: null, batchRestricted: false, posterUrl: null,
  };
  assert.equal(festivalSetupSchema.safeParse({ ...base, applicationQuestions: [{ key: "hostel", label: "Hostel", type: "select", required: true, options: ["A", "B"] }] }).success, true);
  assert.equal(festivalSetupSchema.safeParse({ ...base, applicationQuestions: [{ key: "hostel", label: "Hostel", type: "select", required: true, options: ["A", "A"] }] }).success, false);
  assert.equal(festivalSetupSchema.safeParse({ ...base, applicationQuestions: [{ key: "hostel", label: "Hostel", type: "select", required: true }] }).success, false);
});

test("committeeRoleSchema validates event_coordinator role without eventId requirement", () => {
  assert.equal(committeeRoleSchema.safeParse({
    action: "assign",
    profileId: "c0a80101-0000-4000-8000-000000000004",
    role: "event_coordinator",
    eventId: null,
  }).success, true);

  // event_head still requires an eventId
  assert.equal(committeeRoleSchema.safeParse({
    action: "assign",
    profileId: "c0a80101-0000-4000-8000-000000000004",
    role: "event_head",
    eventId: null,
  }).success, false);

  assert.equal(committeeRoleSchema.safeParse({
    action: "assign",
    profileId: "c0a80101-0000-4000-8000-000000000004",
    role: "event_head",
    eventId: "c0a80101-0000-4000-8000-000000000005",
  }).success, true);
});

test("festivalSetupSchema validates setEventState action for lifecycle transitions", () => {
  assert.equal(festivalSetupSchema.safeParse({
    action: "setEventState",
    eventId: "c0a80101-0000-4000-8000-000000000006",
    state: "open",
  }).success, true);

  assert.equal(festivalSetupSchema.safeParse({
    action: "setEventState",
    eventId: "c0a80101-0000-4000-8000-000000000006",
    state: "draft",
  }).success, true);

  assert.equal(festivalSetupSchema.safeParse({
    action: "setEventState",
    eventId: "c0a80101-0000-4000-8000-000000000006",
    state: "invalid_state",
  }).success, false);
});

test("roll number range strictly requires 1 to 100", () => {
  assert.equal(isValidRollNumber("1"), true);
  assert.equal(isValidRollNumber("01"), false);
  assert.equal(isValidRollNumber("89"), true);
  assert.equal(isValidRollNumber("089"), false);
  assert.equal(isValidRollNumber("100"), true);
  assert.equal(isValidRollNumber("23MBBS045"), false);
  assert.equal(isValidRollNumber("UG-001"), false);

  assert.equal(isValidRollNumber("0"), false);
  assert.equal(isValidRollNumber("000"), false);
  assert.equal(isValidRollNumber("101"), false);
  assert.equal(isValidRollNumber("150"), false);
  assert.equal(isValidRollNumber("-5"), false);
  assert.equal(isValidRollNumber("random"), false);

  assert.equal(extractRollNumberInt("89"), 89);
  assert.equal(extractRollNumberInt("089"), null);
  assert.equal(extractRollNumberInt("23MBBS045"), null);
  assert.equal(extractRollNumberInt("100"), 100);

  // Schema-level validation in signup
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "female", rollNumber: "89" }).success, true);
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "female", rollNumber: "089" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "female", rollNumber: "100" }).success, true);
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "female", rollNumber: "101" }).success, false);
  assert.equal(signUpSchema.safeParse({ ...validSignup, gender: "female", rollNumber: "0" }).success, false);
});

test("activationUpdateSchema and profileRemovalSchema enforce valid inputs", () => {
  assert.equal(profileRemovalSchema.safeParse({ profileId: "c0a80101-0000-4000-8000-000000000001" }).success, true);
  assert.equal(profileRemovalSchema.safeParse({ profileId: "not-a-uuid" }).success, false);
  assert.equal(profileRemovalSchema.safeParse({}).success, false);

  assert.equal(activationUpdateSchema.safeParse({
    editionId: "c0a80101-0000-4000-8000-000000000001",
    profileId: "c0a80101-0000-4000-8000-000000000002",
    state: "active",
    ledgerReference: "REC-1234",
  }).success, true);

  assert.equal(activationUpdateSchema.safeParse({
    editionId: "c0a80101-0000-4000-8000-000000000001",
    profileId: "c0a80101-0000-4000-8000-000000000002",
    state: "suspended",
  }).success, true);

  assert.equal(activationUpdateSchema.safeParse({
    editionId: "c0a80101-0000-4000-8000-000000000001",
    profileId: "c0a80101-0000-4000-8000-000000000002",
    state: "rejected",
    reason: "Document mismatch",
  }).success, true);

  // cannot set back to pending
  assert.equal(activationUpdateSchema.safeParse({
    editionId: "c0a80101-0000-4000-8000-000000000001",
    profileId: "c0a80101-0000-4000-8000-000000000002",
    state: "pending",
  }).success, false);
});

