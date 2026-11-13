import { z } from "zod";
import type { ThemeRosterPolicy } from "./theme-roster";

const uuid = z.string().uuid();
const event = { eventId: uuid };
const version = z.number().int().nonnegative();
const answers = z.record(z.string().max(80), z.string().max(500)).default({});
export const teamCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...event, action: z.literal("appoint"), groupId: uuid.nullable(), leaderApplicationId: uuid, batchId: uuid.nullable().optional() }).strict(),
  z.object({ ...event, action: z.literal("save"), groupId: uuid, version, name: z.string().trim().min(1).max(160), applicationIds: z.array(uuid).min(1).max(200).refine(ids => new Set(ids).size === ids.length), reason: z.string().trim().max(500).optional() }).strict(),
  z.object({ ...event, action: z.literal("submit"), groupId: uuid, version }).strict(),
  z.object({ ...event, action: z.literal("publish"), groupId: uuid, version }).strict(),
  z.object({ ...event, action: z.literal("return"), groupId: uuid, version, reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ ...event, action: z.literal("dissolve"), groupId: uuid, version, reason: z.string().trim().min(1).max(500) }).strict(),
  z.object({ ...event, action: z.literal("lookup"), batchId: uuid, roll: z.string().trim().min(1).max(30) }).strict(),
  z.object({ ...event, action: z.literal("invite"), partnerId: uuid, answers }).strict(),
  z.object({ ...event, action: z.literal("accept"), invitationId: uuid, answers }).strict(),
  z.object({ ...event, action: z.literal("decline"), invitationId: uuid }).strict(),
  z.object({ ...event, action: z.literal("cancel"), invitationId: uuid }).strict(),
  z.object({ ...event, action: z.literal("leave"), invitationId: uuid }).strict(),
]);
export type TeamCommand = z.infer<typeof teamCommandSchema>;
export type SquadMember = { applicationId: string; studentId: string; fullName: string; batchId: string | null; batchLabel: string | null; roll: string | null; reviewState?: string; theme?: string | null; character?: string | null };
export type Squad = { id: string; name: string; state: string; proposalState: string; ready: boolean; captainId: string | null; batchId: string | null; version: number; note: string | null; members: SquadMember[] };
export type TeamWorkspaceData = {
  eventId: string; title: string; format: string; operatingMethod?: string; staff: boolean; userId: string;
  themePolicy?: ThemeRosterPolicy | null;
  batchRestricted: boolean; minSize: number; maxSize: number; locked: boolean;
  groups: Squad[]; candidates: SquadMember[];
  invitations: { id: string; state: string; incoming: boolean; partnerName: string; partnerBatch: string | null; partnerRoll: string | null; groupId: string | null; createdAt: string }[];
  questions: { key: string; label: string; type: string; required: boolean; options?: string[] }[];
  registered: boolean; reviewState?: string | null; proposed?: boolean; finalTeamPublished?: boolean; batches: { id: string; label: string }[];
};
