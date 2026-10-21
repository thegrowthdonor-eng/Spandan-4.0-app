import assert from "node:assert/strict";
import test from "node:test";

import { festivalSetupSchema, signUpSchema } from "./contracts";

const validSignup = {
  fullName: "Test Participant",
  batchId: "c0a80101-0000-4000-8000-000000000001",
  rollNumber: "UG-001",
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
