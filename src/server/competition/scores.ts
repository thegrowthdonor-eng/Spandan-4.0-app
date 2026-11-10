import { z } from "zod";

// These schemas intentionally mirror the staff score-entry controls. The RPC
// repeats equivalent rules, so alternate clients cannot bypass validation.
const wholeNumber = z.union([z.number().int().min(0), z.string().regex(/^\d+$/)]);
const cricket = z.object({
  teamA_runs: wholeNumber.refine((value) => Number(value) <= 999),
  teamA_wickets: wholeNumber.refine((value) => Number(value) <= 10),
  teamA_overs: z.string().regex(/^\d+\.[0-5]$/),
  teamB_runs: wholeNumber.refine((value) => Number(value) <= 999),
  teamB_wickets: wholeNumber.refine((value) => Number(value) <= 10),
  teamB_overs: z.string().regex(/^\d+\.[0-5]$/),
  innings: z.string().max(40).optional(),
  summary: z.string().max(1000).optional(),
}).strict();
const football = z.object({
  teamA_goals: wholeNumber.refine((value) => Number(value) <= 99),
  teamB_goals: wholeNumber.refine((value) => Number(value) <= 99),
  penalties: z.string().max(160).optional(),
  period: z.string().max(40).optional(),
  clock_seconds: wholeNumber.optional(),
  clock_running: z.boolean().optional(),
  clock_started_at: z.string().datetime({ offset: true }).nullable().optional(),
  summary: z.string().max(500).optional(),
}).strict();
const badmintonLegacy = z.object({
  set1: z.string().regex(/^\d{1,3}-\d{1,3}$/),
  set2: z.string().regex(/^\d{1,3}-\d{1,3}$/).optional().or(z.literal("")),
  set3: z.string().regex(/^\d{1,3}-\d{1,3}$/).optional().or(z.literal("")),
  winner: z.string().max(160).optional(),
}).strict();
const generic = z.object({ winner: z.string().max(160).optional(), summary: z.string().max(1000).optional() }).strict().refine(
  (value) => Boolean(value.winner?.trim() || value.summary?.trim()),
  "A result or summary is required."
);

const basketball = z.object({
  teamA_score: wholeNumber.refine((value) => Number(value) <= 999),
  teamB_score: wholeNumber.refine((value) => Number(value) <= 999),
  quarter: z.string().max(20).optional(),
  teamA_fouls: wholeNumber.refine((value) => Number(value) <= 99).optional(),
  teamB_fouls: wholeNumber.refine((value) => Number(value) <= 99).optional(),
  clock_seconds: wholeNumber.optional(),
  clock_running: z.boolean().optional(),
  clock_started_at: z.string().datetime({ offset: true }).nullable().optional(),
  summary: z.string().max(500).optional(),
}).strict();

const setBased = z.object({
  teamA_points: wholeNumber.refine((value) => Number(value) <= 999),
  teamB_points: wholeNumber.refine((value) => Number(value) <= 999),
  sets: z.array(z.object({ teamA: z.number().int().min(0).max(999), teamB: z.number().int().min(0).max(999) }).strict()).max(9),
  best_of: z.union([z.literal(1), z.literal(3), z.literal(5), z.literal(7), z.literal(9)]).optional(),
  winner: z.string().max(160).optional(),
  summary: z.string().max(500).optional(),
}).strict();

const genericCounter = z.object({
  teamA_score: wholeNumber.refine((value) => Number(value) <= 9999),
  teamB_score: wholeNumber.refine((value) => Number(value) <= 9999),
  round: z.string().max(40).optional(),
  winner: z.string().max(160).optional(),
  summary: z.string().max(1000).optional(),
}).strict();

const schemas = { cricket, football, badminton: z.union([badmintonLegacy, setBased]), basketball, set_based: setBased, generic: z.union([generic, genericCounter]) } as const;
export type ScoreTemplate = keyof typeof schemas;

export function validateScore(template: ScoreTemplate, payload: unknown) {
  return schemas[template].parse(payload);
}

export function displayCricketOvers(completedOvers: number, legalBalls: number) {
  if (!Number.isInteger(completedOvers) || !Number.isInteger(legalBalls) || completedOvers < 0 || legalBalls < 0 || legalBalls > 5) throw new Error("Invalid cricket over state.");
  return `${completedOvers}.${legalBalls}`;
}
