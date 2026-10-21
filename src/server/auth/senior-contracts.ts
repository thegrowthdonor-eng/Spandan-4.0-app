import { z } from "zod";
import { normaliseIndianPhone } from "./contracts";
export const seniorPhone = z.string().max(20).transform((value, ctx) => {
 try { return normaliseIndianPhone(value); } catch { ctx.addIssue({ code: "custom", message: "Enter a valid Indian mobile number." }); return z.NEVER; }
});
const details = { phone: seniorPhone, category: z.enum(["pg","jr","faculty"]), department: z.string().trim().min(1).max(120) };
export const seniorCommandSchema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("issue"), ...details, fullName: z.string().trim().min(1).max(100), editionId: z.string().uuid() }),
 z.object({ action: z.literal("reissue"), inviteId: z.string().uuid() }),
 z.object({ action: z.literal("revoke"), inviteId: z.string().uuid() }),
 z.object({ action: z.literal("update"), profileId: z.string().uuid(), ...details }),
]);
export const seniorRedeemSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/), password: z.string().min(8).max(256) });
