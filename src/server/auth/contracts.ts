import { z } from "zod";

export const signInSchema = z.union([z.object({
  mode: z.literal("ug").optional(),
  batch: z.string().trim().min(1).max(80),
  rollNumber: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(256),
}), z.object({ mode: z.literal("senior"), phone: z.string().trim().min(10).max(20), password: z.string().min(8).max(256) })]);

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  batchId: z.string().uuid(),
  rollNumber: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(10).max(20),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
  password: z.string().min(8).max(256),
});

export const recoveryIssueSchema = z.object({
  profileId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const recoveryRedeemSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(8).max(256),
});

export const eventApplicationSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  answers: z.record(z.string(), z.string().trim().max(500)).default({}),
});

export const applicationWithdrawSchema = z.object({
  applicationId: z.string().uuid(),
});

export const activationUpdateSchema = z.object({
  editionId: z.string().uuid(),
  profileId: z.string().uuid(),
  state: z.enum(["active", "rejected", "suspended"]),
  reason: z.string().trim().max(500).optional(),
  ledgerReference: z.string().trim().max(120).optional(),
});

export const profileRemovalSchema = z.object({
  profileId: z.string().uuid(),
});

export const applicationReviewSchema = z.object({
  applicationId: z.string().uuid(),
  state: z.enum(["approved", "rejected", "waitlisted"]),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.state === "rejected" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, message: "A rejection reason is required." });
});

export const soloSelectionSchema = z.object({
  applicationId: z.string().uuid(),
  state: z.enum(["selected", "reserve", "not_selected"]),
  reason: z.string().trim().max(500).optional(),
});

export const bulkApplicationReviewSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(100),
  state: z.enum(["approved", "rejected", "waitlisted"]),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.state === "rejected" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, message: "A rejection reason is required." });
});

export const bulkSoloSelectionSchema = z.object({
  applicationIds: z.array(z.string().uuid()).min(1).max(100),
  state: z.enum(["selected", "reserve", "not_selected"]),
  reason: z.string().trim().max(500).optional(),
});

export const groupCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), eventId: z.string().uuid(), name: z.string().trim().min(1).max(160), batchId: z.string().uuid().nullable() }),
  z.object({ action: z.literal("add"), groupId: z.string().uuid(), applicationId: z.string().uuid() }),
  z.object({ action: z.literal("publish"), groupId: z.string().uuid(), captainId: z.string().uuid().nullable() }),
]);

export const fixtureCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    eventId: z.string().uuid(),
    stage: z.string().trim().min(1).max(100),
    participantALabel: z.string().trim().min(1).max(160),
    participantBLabel: z.string().trim().min(1).max(160),
    venue: z.string().trim().max(160).optional(),
    reportingAt: z.string().datetime().nullable(),
    startsAt: z.string().datetime().nullable(),
  }).superRefine((value, context) => {
    if (value.participantALabel === value.participantBLabel)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Fixture participants must differ." });
  }),
  z.object({
    action: z.literal("reschedule"),
    fixtureId: z.string().uuid(),
    reportingAt: z.string().datetime().nullable(),
    startsAt: z.string().datetime().nullable(),
    venue: z.string().trim().max(160).optional(),
    reason: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal("score"),
    fixtureId: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
    scorePayload: z.record(z.string(), z.unknown()),
    status: z.enum(["scheduled", "live", "paused", "final", "cancelled"]),
  }),
  z.object({
    action: z.literal("reminders"),
    fixtureId: z.string().uuid(),
    body: z.string().trim().max(500).optional(),
  }),
]);

// Keep old schema for backwards compatibility
export const fixtureCreateSchema = z.object({
  eventId: z.string().uuid(),
  stage: z.string().trim().min(1).max(100),
  participantALabel: z.string().trim().min(1).max(160),
  participantBLabel: z.string().trim().min(1).max(160),
  venue: z.string().trim().max(160).optional(),
  reportingAt: z.string().datetime().nullable(),
  startsAt: z.string().datetime().nullable(),
}).superRefine((value, context) => {
  if (value.participantALabel === value.participantBLabel) context.addIssue({ code: z.ZodIssueCode.custom, message: "Fixture participants must differ." });
});

export const helpThreadSchema = z.object({
  editionId: z.string().uuid(),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5000),
});

export const feedbackSchema = z.object({
  editionId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000),
});

export const publicNoticeSchema = z.object({
  editionId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000),
  urgency: z.enum(["normal", "important", "urgent"]),
  expiresAt: z.string().datetime().nullable(),
});

export const committeeRoleSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("assign"),
    profileId: z.string().uuid(),
    role: z.enum(["main_admin", "treasurer", "event_head", "notice_publisher"]),
    eventId: z.string().uuid().nullable(),
  }).superRefine((value, context) => {
    if ((value.role === "event_head") !== Boolean(value.eventId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Choose one event only for an Event Head." });
    }
  }),
  z.object({ action: z.literal("revoke"), assignmentId: z.string().uuid() }),
]);

const optionalWebUrl = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .nullable()
  .transform((val) => {
    if (!val || val === "") return null;
    return val;
  })
  .refine(
    (val) => {
      if (val === null) return true;
      try {
        const u = new URL(val);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "Must be a valid web image URL starting with http:// or https://" }
  );

export const resultSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("publish"),
    eventId: z.string().uuid(),
    positions: z.array(z.object({
      placing: z.number().int().min(1),
      applicationId: z.string().uuid().optional().nullable(),
      groupId: z.string().uuid().optional().nullable(),
      batchId: z.string().uuid().optional().nullable(),
      note: z.string().trim().max(500).optional().nullable(),
    }).refine((val) => Boolean(val.applicationId || val.groupId || val.batchId), {
      message: "Each placing requires a participant, team, or batch.",
    })).min(1),
    reason: z.string().trim().max(500).optional(),
    podiumPhotoUrl: optionalWebUrl,
    podiumCaption: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    action: z.literal("setPointRules"),
    eventId: z.string().uuid(),
    rules: z.array(z.object({
      placing: z.number().int().min(1),
      points: z.number().int().min(0),
    })).min(1),
  }),
]);

export const helpStaffSchema = z.object({
  threadId: z.string().uuid(),
  action: z.enum(["assign_self", "resolve", "close"]),
  reply: z.string().trim().max(5000).optional(),
});

const optionalDateTime = z.string().datetime().nullable();
export const festivalSetupSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("setRegistrationWindow"),
    editionId: z.string().uuid(),
    applicationOpensAt: z.string().datetime(),
    applicationClosesAt: z.string().datetime(),
  }).refine((value) => value.applicationClosesAt > value.applicationOpensAt, {
    message: "Registration closing time must be after opening time.",
  }),
  z.object({
    action: z.literal("createEvent"), editionId: z.string().uuid(), title: z.string().trim().min(1).max(160),
    category: z.enum(["sport", "cultural", "literary", "creative", "other"]), format: z.enum(["solo", "pair", "group", "sport"]),
    division: z.enum(["boys", "girls", "open"]).default("open"),
    scoreTemplate: z.enum(["generic", "cricket", "football", "badminton"]), summary: z.string().trim().max(600), venue: z.string().trim().max(160).optional(),
    capacity: z.number().int().positive().nullable(), startsAt: optionalDateTime,
    posterUrl: optionalWebUrl,
  }),
  z.object({
    action: z.literal("updateEventFull"),
    eventId: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().max(600),
    rules: z.string().trim().max(20000),
    venue: z.string().trim().max(160),
    capacity: z.number().int().positive().nullable(),
    waitlistEnabled: z.boolean(),
    startsAt: optionalDateTime,
    eligibility: z.record(z.string(), z.unknown()).default({}),
    applicationQuestions: z.array(z.object({
      key: z.string().trim().min(1).max(80),
      label: z.string().trim().min(1).max(200),
      type: z.enum(["text", "select"]),
      required: z.boolean().default(false),
      options: z.array(z.string().trim().min(1).max(200)).optional(),
    })).default([]),
    groupMinSize: z.number().int().positive().nullable(),
    groupMaxSize: z.number().int().positive().nullable(),
    batchRestricted: z.boolean(),
    posterUrl: optionalWebUrl,
  }).superRefine((value, context) => {
    if (value.groupMinSize && value.groupMaxSize && value.groupMaxSize < value.groupMinSize)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Group max size must be at least the minimum." });
  }),
]);

export const pollVoteSchema = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().uuid(),
});

export const pollCreateSchema = z.object({
  editionId: z.string().uuid(),
  question: z.string().trim().min(1).max(300),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  options: z.array(z.string().trim().min(1).max(160)).min(2).max(10),
  showTotals: z.boolean().default(false),
}).superRefine((val, ctx) => {
  if (val.closesAt <= val.opensAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Poll closesAt must be after opensAt." });
  }
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(256),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(500).optional(),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
});

export function normaliseIndianPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  const phone = /^\d{10}$/.test(compact) ? `+91${compact}` : compact;
  if (!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("Invalid phone number.");
  return phone;
}

