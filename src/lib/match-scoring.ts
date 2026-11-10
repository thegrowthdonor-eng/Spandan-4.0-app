import { canStartMatch, istDate } from "./match-clock";

export type ScoringMatch = {
  id: string; event_id: string; event_title: string; event_state: string; stage: string;
  participant_a_label: string; participant_b_label: string; venue: string | null;
  starts_at: string | null; state: string; actual_started_at: string | null;
};

export function matchScoringAction(match: ScoringMatch, now: number) {
  if (match.state === "cancelled" || match.event_state === "cancelled" || match.event_state === "draft") return "unavailable";
  if (match.actual_started_at) return match.state === "completed" || match.event_state === "completed" ? "review" : "continue";
  if (match.state === "completed" || match.event_state === "completed") return "unavailable";
  return canStartMatch(match.starts_at, match.state, now) ? "start" : "locked";
}

export function isTodayOrLive(match: ScoringMatch, now: number) {
  return (!!match.actual_started_at && match.state === "ongoing") || (!!match.starts_at && istDate(match.starts_at) === istDate(now));
}
