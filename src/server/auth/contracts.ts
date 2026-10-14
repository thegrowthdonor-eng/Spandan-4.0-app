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

export function normaliseIndianPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  const phone = /^\d{10}$/.test(compact) ? `+91${compact}` : compact;
  if (!/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("Invalid phone number.");
  return phone;
}
