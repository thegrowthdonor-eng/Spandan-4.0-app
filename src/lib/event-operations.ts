import { z } from "zod";

export const operatingMethods = ["live_matches", "fixtures_only", "results_only", "voting", "programme"] as const;
export type OperatingMethod = typeof operatingMethods[number];
export const operatingLabels: Record<OperatingMethod, string> = {
  live_matches: "Fixtures & live scores", fixtures_only: "Fixtures only", results_only: "Publish final results",
  voting: "Public voting", programme: "Information & gallery",
};
export const valueUnits = ["seconds", "minutes", "metres", "count", "marks"] as const;
export type ValueUnit = typeof valueUnits[number];
export const operationFields = {
  operatingMethod: z.enum(operatingMethods).optional(),
  entryFormat: z.enum(["image", "text"]).optional(),
  resultUnit: z.enum(valueUnits).nullable().optional(),
};
export function suggestedOperations(title: string, registration = true): OperatingMethod {
  if (!registration) return "programme";
  if (/dance|singing|fashion|natak|theatre|mushaira|poetry slam|stage performance/i.test(title)) return "programme";
  if (/chess|carrom/i.test(title)) return "fixtures_only";
  if (/photograph|rangoli/i.test(title)) return "voting";
  if (/football|cricket|badminton|volleyball|tennis|kabaddi|kho.?kho|basketball|handball|throwball|tug.?of.?war/i.test(title)) return "live_matches";
  return "results_only";
}
export function eventMethod(event: { title: string; operating_method?: OperatingMethod; registration_enabled?: boolean }): OperatingMethod {
  return event.operating_method ?? suggestedOperations(event.title, event.registration_enabled);
}
export function suggestedUnit(title: string): ValueUnit | null {
  if (/sprint|race|relay|\b(run|hurdles|marathon|swimming|cycling)\b|\b[0-9]+\s*m\b/i.test(title)) return "seconds";
  if (/shot.?put|discus|javelin|\bjump\b/i.test(title)) return "metres";
  if (/push.?up|skipping/i.test(title)) return "count";
  return null;
}
export function suggestedScoreTemplate(title: string) {
  if (/cricket/i.test(title)) return "cricket" as const;
  if (/football/i.test(title)) return "football" as const;
  if (/basketball/i.test(title)) return "basketball" as const;
  if (/badminton/i.test(title)) return "badminton" as const;
  if (/tennis|volleyball|throwball/i.test(title)) return "set_based" as const;
  return "generic" as const;
}
export const finalValueSchema = z.string().trim().regex(/^\d{1,12}(?:\.\d{1,3})?$/, "Enter a positive number or zero, up to 3 decimal places.").nullable().optional();
export function finalValueLabel(value: string | number | null | undefined, unit?: string | null) {
  if (value == null || value === "") return "";
  const units: Record<string, string> = { seconds: "sec", minutes: "min", metres: "m", count: "count", marks: "marks" };
  return `${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 3 })}${unit ? ` ${units[unit] ?? unit}` : ""}`;
}
