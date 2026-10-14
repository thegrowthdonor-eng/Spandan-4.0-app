import { z } from "zod";

export const signInSchema = z.object({
  batch: z.string().trim().min(1).max(80),
  rollNumber: z.string().trim().min(1).max(80),
  password: z.string().min(12).max(256),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  batchId: z.string().uuid(),
  rollNumber: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(10).max(20),
  password: z.string().min(12).max(256),
});

export const recoveryIssueSchema = z.object({
  profileId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});

export const recoveryRedeemSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  password: z.string().min(12).max(256),
});

export const eventApplicationSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  answers: z.record(z.string(), z.string().trim().max(500)).default({}),
});

export const activationUpdateSchema = z.object({
  editionId: z.string().uuid(),
  profileId: z.string().uuid(),
  state: z.enum(["active", "rejected", "suspended"]),
  reason: z.string().trim().max(500).optional(),
  ledgerReference: z.string().trim().max(120).optional(),
});

export const applicationReviewSchema = z.object({
  applicationId: z.string().uuid(),
  state: z.enum(["approved", "rejected", "waitlisted"]),
  reason: z.string().trim().max(500).optional(),
}).superRefine((value, context) => {
  if (value.state === "rejected" && !value.reason) context.addIssue({ code: z.ZodIssueCode.custom, message: "A rejection reason is required." });
});

export function normaliseIndianPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  const phone = /^\d{10}$/.test(compact) ? `+91${compact}` : compact;
  if (!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("Invalid phone number.");
  return phone;
}
