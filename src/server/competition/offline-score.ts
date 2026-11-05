import { z } from "zod";

export const deviceIdSchema = z.string().uuid();

export const prepareOfflineSchema = z.object({
  fixtureId: z.string().uuid(),
  deviceId: deviceIdSchema,
}).strict();

export const scoreStatusSchema = z.enum(["scheduled", "live", "paused", "final", "cancelled"]);

export const checkpointSchema = z.object({
  clientMutationId: z.string().uuid(),
  localRevision: z.number().int().positive(),
  scorePayload: z.record(z.string(), z.unknown()),
  status: scoreStatusSchema,
  provisional: z.boolean().default(false),
  recordedAt: z.string().datetime(),
}).strict();

export const syncScoreSchema = z.object({
  fixtureId: z.string().uuid(),
  deviceId: deviceIdSchema,
  baseVersion: z.number().int().min(0),
  checkpoints: z.array(checkpointSchema).min(1).max(50),
}).strict();

export const releaseLeaseSchema = z.object({
  fixtureId: z.string().uuid(),
  deviceId: deviceIdSchema,
  force: z.boolean().default(false),
}).strict();

export function isCricHeroesUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "cricheroes.com" || url.hostname === "www.cricheroes.com");
  } catch {
    return false;
  }
}
