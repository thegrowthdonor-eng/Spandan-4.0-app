import { z } from "zod";
import type { OperatingMethod, ValueUnit } from "./event-operations";

export const scheduleModes = ["match", "heat", "flight", "running_order", "session", "submission", "information"] as const;
export const resultModes = ["sport_score", "time", "distance", "count", "faculty_places", "public_vote", "none"] as const;
export const compatibleResults:Record<typeof scheduleModes[number],readonly typeof resultModes[number][]>={match:["sport_score"],heat:["time","count"],flight:["distance"],running_order:["faculty_places"],session:["time","distance","count","faculty_places","public_vote"],submission:["public_vote"],information:["none"]};
export const competitionSettingsSchema = z.object({
  schedule_mode: z.enum(scheduleModes), result_mode: z.enum(resultModes),
  attempts: z.number().int().min(1).max(12),
  measurement_method: z.string().trim().min(1).max(120).default("Official measurement"),
  submission_closes_at: z.string().datetime({ offset: true }).nullable(),
}).refine(value=>compatibleResults[value.schedule_mode].includes(value.result_mode),{message:"Choose a compatible scheduling and result method.",path:["result_mode"]});
export type CompetitionSettings = z.infer<typeof competitionSettingsSchema>;
export type Entrant = { key: string; label: string; application_id: string | null; group_id: string | null };
export type SessionResult = { status: "valid" | "dns" | "dnf" | "dq"; attempts: Array<number | null>; placing: number | null };
export type CompetitionSession = {
  id: string; title: string; venue: string; starts_at: string; reporting_at: string | null; ends_at: string | null;
  state: string; is_final: boolean; actual_started_at: string | null; current_position: number | null; version: number;
  entrants: Array<SessionResult & { id: string; label: string; application_id: string | null; group_id: string | null; position: number; note: string }>;
};
export type CompetitionEntry = { id: string; application_id: string | null; group_id: string | null; entry_number: number; title: string; description: string; media_id: string | null; public_media_url: string | null; state: string; note: string; version: number };
export type CompetitionWorkspace = {
  event: { id: string; title: string; format: string; state: string; registration_enabled: boolean; operating_method?: OperatingMethod; entry_format?: "image" | "text"; result_unit?: ValueUnit | null }; staff: boolean;
  settings: (CompetitionSettings & { version: number; verified: boolean }) | null;
  candidates: Entrant[]; sessions: CompetitionSession[]; entries: CompetitionEntry[];
  programme?:Array<{id:string;title:string;starts_at:string|null}>;
  rounds: Array<{ id: string; round_number: number; opens_at: string; closes_at: string }>;
  placements: Array<{ placing: number; entry_id: string }>;
};

const identity = { application_id: z.string().uuid().nullable(), group_id: z.string().uuid().nullable() };
const version = { version: z.number().int().positive() };
const session = { session_id: z.string().uuid(), ...version };
const reason = z.string().trim().max(500).default("");
const entrantSchema = z.object({ ...identity, position: z.number().int().positive().max(200) }).refine(v => Number(v.application_id !== null) + Number(v.group_id !== null) === 1);
const schedule = { title: z.string().trim().min(1).max(100), venue: z.string().trim().min(1).max(160), starts_at: z.string().datetime({ offset: true }), reporting_at: z.string().datetime({ offset: true }).nullable(), ends_at: z.string().datetime({ offset: true }).nullable() };
export const competitionCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("settings"), data: competitionSettingsSchema.safeExtend({ version: z.number().int().min(0) }) }),
  z.object({ action: z.literal("sessions"), data: z.object({ sessions: z.array(z.object({ ...schedule, is_final: z.boolean(), entrants: z.array(entrantSchema).max(200), schedule_entry_id: z.string().uuid().nullable().optional() })).min(1).max(100) }) }),
  z.object({ action: z.literal("session_roster"), data: z.object({ ...session, entrants: z.array(entrantSchema).max(200) }) }),
  z.object({ action: z.literal("session_schedule"), data: z.object({ ...session, ...schedule, reason: reason.refine(v => v.length > 0) }) }),
  z.object({ action: z.literal("session_state"), data: z.object({ ...session, state: z.enum(["scheduled","live","paused","completed","cancelled"]), current_position: z.number().int().positive().optional() }) }),
  z.object({ action: z.literal("session_results"), data: z.object({ ...session, reason, results: z.array(z.object({ id: z.string().uuid(), status: z.enum(["valid","dns","dnf","dq"]), attempts: z.array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable()).max(12), placing: z.number().int().positive().nullable(), note: z.string().max(500) })).max(200) }) }),
  z.object({ action: z.literal("entry"), data: z.object({ ...identity, version: z.number().int().min(0), title: z.string().trim().min(1).max(160), description: z.string().max(10000), media_id: z.string().uuid().nullable(), submit: z.boolean() }) }),
  z.object({ action: z.literal("review_entry"), data: z.object({ entry_id: z.string().uuid(), ...version, state: z.enum(["approved","rejected","disqualified"]), reason }) }),
  z.object({ action: z.literal("voting_round"), data: z.object({ opens_at: z.string().datetime({ offset: true }), closes_at: z.string().datetime({ offset: true }), entry_ids: z.array(z.string().uuid()).optional() }) }),
  z.object({ action: z.literal("verify_votes"), data: z.object({}) }),
]);
export function competitionPreset(title: string, registration = true): CompetitionSettings {
  const base = { attempts: 1, submission_closes_at: null,measurement_method:"Official measurement" };
  if (!registration) return { ...base, schedule_mode: "information", result_mode: "none" };
  if (/photograph|rangoli/i.test(title)) return { ...base, schedule_mode: /rangoli/i.test(title) ? "session" : "submission", result_mode: "public_vote" };
  if (/sprint|race|relay|\b(run|hurdles|marathon|swimming|cycling)\b|\b[0-9]+\s*m\b/i.test(title)) return { ...base, schedule_mode: "heat", result_mode: "time" };
  if (/shot.?put|discus|javelin|long jump|triple jump|high jump/i.test(title)) return { ...base, attempts: 3, schedule_mode: "flight", result_mode: "distance" };
  if (/push.?up|skipping/i.test(title)) return { ...base, schedule_mode: "session", result_mode: "count" };
  if (/dance|singing|fashion|natak|poetry|mushaira|declamation/i.test(title)) return { ...base, schedule_mode: "running_order", result_mode: "faculty_places" };
  if (/football|cricket|badminton|chess|volleyball|carrom|tennis|kabaddi|kho.?kho|basketball|handball|throwball|tug|wrestl/i.test(title)) return { ...base, schedule_mode: "match", result_mode: "sport_score" };
  return { ...base, schedule_mode: "session", result_mode: "faculty_places" };
}
export function draftSessions(entrants: Entrant[], capacity: number) {
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200 || new Set(entrants.map(e => e.key)).size !== entrants.length) throw new Error("Choose unique entrants and capacity between 1 and 200.");
  return Array.from({ length: Math.ceil(entrants.length / capacity) }, (_, index) => entrants.slice(index * capacity, (index + 1) * capacity));
}
export function parseMeasurement(raw: string, mode: string): number | null {
  raw=raw.trim();
  if (!raw.trim()) return null;
  if (mode === "time") {
    if (!/^(?:\d+:)?\d{1,3}(?:\.\d{1,3})?$/.test(raw)) throw new Error("Use seconds or minutes:seconds, up to 3 decimal places.");
    const parts = raw.split(":");
    if (parts.length === 2 && Number(parts[1]) >= 60) throw new Error("Seconds must be below 60 when minutes are supplied.");
    const value=Math.round((parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(raw)) * 1000);
    if (!Number.isSafeInteger(value)) throw new Error("Measurement is too large.");
    return value;
  }
  if (!(mode === "distance" ? /^\d+(?:\.\d{1,3})?$/ : /^\d+$/).test(raw)) throw new Error(mode === "distance" ? "Enter metres, up to 3 decimal places." : "Enter a whole-number count.");
  const value = Math.round(Number(raw) * (mode === "distance" ? 1000 : 1));
  if (!Number.isSafeInteger(value)) throw new Error("Measurement is too large.");
  return value;
}
export function measurementLabel(value: number | null, mode: string) {
  if (value === null) return "Invalid / no mark";
  return mode === "time" ? `${(value / 1000).toFixed(3)} s` : mode === "distance" ? `${(value / 1000).toFixed(3)} m` : String(value);
}
export function rankedMeasurements<T extends SessionResult>(rows: T[], mode: string) {
  const best = (r: T) => { const values = r.attempts.filter((n): n is number => n !== null); return r.status !== "valid" || !values.length ? null : mode === "time" ? Math.min(...values) : Math.max(...values); };
  const sorted = rows.map(row => ({ row, best: best(row) })).sort((a, b) => a.best === null ? b.best === null ? 0 : 1 : b.best === null ? -1 : mode === "time" ? a.best - b.best : b.best - a.best);
  return sorted.map((item, index) => ({ ...item, suggestedPlace: item.best === null ? null : 1 + sorted.filter(other => other.best !== null && (mode === "time" ? other.best < item.best! : other.best > item.best!)).length, tied: item.best !== null && sorted.some((other, otherIndex) => otherIndex !== index && other.best === item.best) }));
}
