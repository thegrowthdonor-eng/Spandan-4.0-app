import { z } from "zod";

const nonNegativeInteger = z.number().int().min(0);

const cricketInnings = z.object({
  runs: nonNegativeInteger,
  wickets: z.number().int().min(0).max(10),
  completedOvers: nonNegativeInteger,
  legalBalls: z.number().int().min(0).max(5),
});

const cricket = z.object({
  teamA: cricketInnings,
  teamB: cricketInnings,
  target: nonNegativeInteger.optional(),
  innings: z.number().int().min(1).max(4),
});

const football = z.object({
  teamAGoals: nonNegativeInteger,
  teamBGoals: nonNegativeInteger,
  period: z.enum(["first_half", "half_time", "second_half", "extra_time", "penalties", "final"]),
  teamAPenalties: nonNegativeInteger.optional(),
  teamBPenalties: nonNegativeInteger.optional(),
});

const badmintonGame = z.object({ teamA: nonNegativeInteger, teamB: nonNegativeInteger });
const badminton = z.object({ games: z.array(badmintonGame).min(1).max(5), currentGame: z.number().int().min(1).max(5) });
const generic = z.record(z.string(), z.unknown());

const schemas = { cricket, football, badminton, generic } as const;
export type ScoreTemplate = keyof typeof schemas;

export function validateScore(template: ScoreTemplate, payload: unknown) {
  return schemas[template].parse(payload);
}

export function displayCricketOvers(completedOvers: number, legalBalls: number) {
  if (!Number.isInteger(completedOvers) || !Number.isInteger(legalBalls) || completedOvers < 0 || legalBalls < 0 || legalBalls > 5) throw new Error("Invalid cricket over state.");
  return `${completedOvers}.${legalBalls}`;
}
