export type ScheduleEntry = {
  id: string; day: string; title: string; category: string; venue: string | null;
  starts_at: string | null; ends_at?: string | null; reporting_at?: string | null;
  notes: string; sort_order: number; href?: string; state?: string;
};
export const festivalDays = Array.from({ length: 8 }, (_, i) => `2026-12-${String(i + 1).padStart(2, "0")}`);
export function scheduleDay(value: string | null) {
  if (!value) return "unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unscheduled";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function scheduleTime(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(value)) : "Time to be announced";
}
export function sortSchedule(a: ScheduleEntry, b: ScheduleEntry) {
  if (a.starts_at && b.starts_at) return Date.parse(a.starts_at) - Date.parse(b.starts_at) || a.sort_order - b.sort_order;
  if (a.starts_at) return -1;
  if (b.starts_at) return 1;
  return a.sort_order - b.sort_order;
}

export function defaultScheduleDay(entries: ScheduleEntry[], now: string) {
  const today = scheduleDay(now);
  if (festivalDays.includes(today)) return today;
  const published = [...new Set(entries.map(e => e.day).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day)))].sort();
  if (!published.length) return festivalDays[0];
  return today < festivalDays[0] ? published[0] : published[published.length - 1];
}

export function scheduleStatus(state?: string) {
  if (state === "cancelled") return "Cancelled";
  if (["completed", "final"].includes(state ?? "")) return "Finished";
  if (["ongoing", "live"].includes(state ?? "")) return "Live";
  if (state === "paused") return "Paused";
  return "Scheduled";
}

export const scheduleCategories: Record<string, string> = {
  opening: "Ceremony", sport: "Sports", fixture: "Matches", cultural: "Arts & culture",
  creative: "Creative", literary: "Literary", competition: "Competition", evening: "Evening", other: "Programme",
};
