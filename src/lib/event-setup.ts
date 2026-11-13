import { z } from "zod";
import { operationFields } from "./event-operations";

const eventTime = (label: string) => z.string().datetime({ offset: true, message: `Enter a valid ${label} with a timezone.` }).transform(value => new Date(value).toISOString()).nullable();

export const eventDetailsSchema = z.object({
  ...operationFields,
  title: z.string().trim().min(1, "Enter an event title.").max(160),
  category: z.enum(["sport", "cultural", "literary", "creative", "other"]),
  format: z.enum(["solo", "pair", "group", "sport"]),
  registrationEnabled: z.boolean().default(true),
  scoreTemplate: z.enum(["generic", "cricket", "football", "basketball", "badminton", "set_based"]),
  summary: z.string().trim().max(600), rules: z.string().trim().max(20000),
  venue: z.string().trim().max(160), capacity: z.number().int().positive().nullable(),
  waitlistEnabled: z.boolean(),
  reportingAt: eventTime("reporting time"), startsAt: eventTime("start time"),
  endsAt: eventTime("end time"), rosterLockAt: eventTime("roster lock time"),
  eligibility: z.record(z.string(), z.unknown()),
  applicationQuestions: z.array(z.object({
    key: z.string().min(1).max(80), label: z.string().trim().min(1).max(200),
    type: z.enum(["text", "select"]), required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(200)).optional(),
  })).max(30),
  groupMinSize: z.number().int().positive().nullable(), groupMaxSize: z.number().int().positive().nullable(),
  batchRestricted: z.boolean(), posterUrl: z.string().url().max(1000).nullable(),
}).superRefine((v,c) => {
  const issue = (path: string, message: string) => c.addIssue({ code: "custom", path: [path], message });
  if (!["boys","girls","open"].includes(String(v.eligibility.division))) issue("eligibility","Choose a valid division.");
  if (v.format === "sport" && !v.batchRestricted) issue("batchRestricted", "Sports squads require members from the same batch.");
  if (v.reportingAt && v.startsAt && v.reportingAt > v.startsAt) issue("reportingAt","Reporting must be before the start.");
  if (v.endsAt && v.startsAt && v.endsAt <= v.startsAt) issue("endsAt","End time must be after the start.");
  if (v.groupMinSize && v.groupMaxSize && v.groupMaxSize < v.groupMinSize) issue("groupMaxSize","Maximum size must be at least minimum size.");
  if (v.format === "pair" && (v.groupMinSize !== 2 || v.groupMaxSize !== 2)) issue("groupMinSize","Pair events require exactly two partners.");
  if (new Set(v.applicationQuestions.map(q => q.key)).size !== v.applicationQuestions.length) issue("applicationQuestions","Question keys must be unique.");
  for (const q of v.applicationQuestions) {
    if (q.type === "select" && (!q.options || q.options.length < 2 || q.options.length > 20 || new Set(q.options).size !== q.options.length)) issue("applicationQuestions","Choice questions need 2–20 unique, non-empty options.");
    if (q.type === "text" && q.options?.length) issue("applicationQuestions","Text questions cannot contain choices.");
    if (/(roll|batch|full[ _-]?name|phone|mobile|gender|sex)/i.test(q.key+" "+q.label)) issue("applicationQuestions","Student identity is already collected. Ask event-specific questions.");
  }
});
export type EventDetails = z.infer<typeof eventDetailsSchema>;
export const managementEventSchema = z.object({
  eventId: z.string().uuid().nullable(), editionId: z.string().uuid().nullable(), details: eventDetailsSchema,
}).refine(v => v.eventId || v.editionId, { message: "Choose a festival edition." });

export function toIstInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime()+330*60000).toISOString().slice(0,16);
}
export function fromIstInput(value: string) {
  return value ? new Date(value + ":00+05:30").toISOString() : null;
}
export function publicationMissing(v: EventDetails) {
  return [
    !v.summary.trim() && "summary", v.registrationEnabled && !v.rules.trim() && "rules", !v.venue.trim() && "venue",
    !v.startsAt && "start time", !v.endsAt && "end time", v.registrationEnabled && v.format !== "solo" && (!v.groupMinSize || !v.groupMaxSize) && "team sizes",
  ].filter(Boolean) as string[];
}

export function eventStepError(v: EventDetails, step: number) {
  if (step === 0) return !v.title.trim() ? "Enter an event title." : null;
  if (step === 1) {
    if (!v.summary.trim()) return "Enter a short description.";
    if (v.registrationEnabled && !v.rules.trim()) return "Enter the official rules.";
    if (v.registrationEnabled && v.format !== "solo" && (!v.groupMinSize || !v.groupMaxSize)) return "Set the minimum and maximum roster sizes.";
    const parsed = eventDetailsSchema.safeParse(v);
    const issue = !parsed.success && parsed.error.issues.find(i => ["applicationQuestions", "groupMinSize", "groupMaxSize"].includes(String(i.path[0])));
    return issue ? issue.message : null;
  }
  if (step === 2) {
    if (!v.venue.trim() || !v.startsAt || !v.endsAt) return "Complete venue, start and end date/time.";
    const parsed = eventDetailsSchema.safeParse(v);
    const issue = !parsed.success && parsed.error.issues.find(i => ["startsAt", "endsAt", "reportingAt", "rosterLockAt"].includes(String(i.path[0])));
    if (issue) return issue.message;
  }
  return null;
}
