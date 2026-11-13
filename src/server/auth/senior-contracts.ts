import { z } from "zod";
import { normaliseIndianPhone } from "./contracts";
export const seniorPhone = z.string().max(20).transform((value, ctx) => {
 try { return normaliseIndianPhone(value); } catch { ctx.addIssue({ code: "custom", message: "Enter a valid Indian mobile number." }); return z.NEVER; }
});
const details = { phone: seniorPhone, category: z.enum(["pg","jr","fmg","faculty"]), department: z.string().trim().min(1).max(120) };
export const seniorCommandSchema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("issue"), ...details, fullName: z.string().trim().min(1).max(100), editionId: z.string().uuid() }),
 z.object({ action: z.literal("reissue"), inviteId: z.string().uuid() }),
 z.object({ action: z.literal("revoke"), inviteId: z.string().uuid() }),
 z.object({ action: z.literal("update"), profileId: z.string().uuid(), ...details }),
]);
export const seniorRedeemSchema = z.object({
 token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
 password: z.string().min(8).max(256),
 gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
});

export const seniorSignupSchema = z.object({
 token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
 fullName: z.string().trim().min(1).max(100),
 ...details,
 gender: z.enum(["male", "female", "other", "prefer_not_to_say"]),
 password: z.string().min(8).max(256),
});

const linkSettings = { expiresAt: z.iso.datetime({ offset: true }).refine(value => Date.parse(value) > Date.now(), "Choose a future expiry."), maxAccounts: z.coerce.number().int().min(1).max(10000) };
export const seniorLinkCommandSchema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("create"), editionId: z.string().uuid(), ...linkSettings }),
 z.object({ action: z.literal("regenerate"), linkId: z.string().uuid(), ...linkSettings }),
 z.object({ action: z.literal("close"), linkId: z.string().uuid() }),
 z.object({ action: z.enum(["reset_browser", "suspend", "activate"]), profileId: z.string().uuid(), reason: z.string().trim().min(1).max(500) }),
]);
