// The timestamp is synced only when a scorer changes the clock; ticks stay local.
export function matchClockSeconds(payload: Record<string, unknown>, countdown = false, now = Date.now()) {
  const value = Number(payload.clock_seconds ?? 0);
  const base = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const started = typeof payload.clock_started_at === "string" ? Date.parse(payload.clock_started_at) : NaN;
  const elapsed = payload.clock_running === true && Number.isFinite(started) ? Math.max(0, Math.floor((now - started) / 1000)) : 0;
  return countdown ? Math.max(0, base - elapsed) : base + elapsed;
}

export function formatMatchClock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function istDate(value: string | number | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function canStartMatch(startsAt: string | null, state: string, now = Date.now()) {
  return !!startsAt && ["draft", "scheduled"].includes(state) && istDate(startsAt) === istDate(now);
}

export function toISTInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return parts.replace(" ", "T");
}

export function fromISTInput(value: string) {
  return value ? new Date(`${value}:00+05:30`).toISOString() : null;
}
