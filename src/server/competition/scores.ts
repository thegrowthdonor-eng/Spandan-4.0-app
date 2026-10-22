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
  summary: z.string().max(1000).optional(),
}).strict();
const football = z.object({
  teamA_goals: wholeNumber.refine((value) => Number(value) <= 99),
  teamB_goals: wholeNumber.refine((value) => Number(value) <= 99),
  penalties: z.string().max(160).optional(),
}).strict();
const badminton = z.object({
  set1: z.string().regex(/^\d{1,3}-\d{1,3}$/),
  set2: z.string().regex(/^\d{1,3}-\d{1,3}$/).optional().or(z.literal("")),
  set3: z.string().regex(/^\d{1,3}-\d{1,3}$/).optional().or(z.literal("")),
  winner: z.string().max(160).optional(),
}).strict();
const generic = z.object({ winner: z.string().max(160).optional(), summary: z.string().max(1000).optional() }).strict().refine(
  (value) => Boolean(value.winner?.trim() || value.summary?.trim()),
  "A result or summary is required."
);

const schemas = { cricket, football, badminton, generic } as const;
export type ScoreTemplate = keyof typeof schemas;

export function validateScore(template: ScoreTemplate, payload: unknown) {
  return schemas[template].parse(payload);
}

export function displayCricketOvers(completedOvers: number, legalBalls: number) {
  if (!Number.isInteger(completedOvers) || !Number.isInteger(legalBalls) || completedOvers < 0 || legalBalls < 0 || legalBalls > 5) throw new Error("Invalid cricket over state.");
  return `${completedOvers}.${legalBalls}`;
}
