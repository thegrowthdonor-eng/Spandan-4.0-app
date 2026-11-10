export type LiveGroundStatus = "scheduled" | "live" | "paused" | "final" | "completed" | "cancelled";

export type LiveGroundItem = {
  id: string;
  kind: "fixture" | "programme";
  title: string;
  subtitle: string | null;
  category: string;
  venue: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: LiveGroundStatus;
  updatedAt: string | null;
  participantA?: string;
  participantB?: string;
  scoreTemplate?: string;
  scorePayload?: Record<string, unknown> | null;
  scoreProvider?: "internal" | "cricheroes";
  externalScoreUrl?: string | null;
  eventSlug?: string | null;
  updateNote?: string | null;
};

export type LiveGroundPayload = { ok: true; serverTime: string; live: LiveGroundItem[]; upcoming: LiveGroundItem[]; recent: LiveGroundItem[] };

export function formatLiveScore(item: LiveGroundItem) {
  const score = item.scorePayload;
  if (!score) return item.updateNote ?? "Update pending";
  if (item.scoreTemplate === "cricket") return `${score.teamA_runs ?? 0}/${score.teamA_wickets ?? 0} (${score.teamA_overs ?? "0.0"}) · ${score.teamB_runs ?? 0}/${score.teamB_wickets ?? 0} (${score.teamB_overs ?? "0.0"})`;
  if (item.scoreTemplate === "football") return `${score.teamA_goals ?? 0} – ${score.teamB_goals ?? 0}`;
  if (item.scoreTemplate === "generic" && typeof score.winner === "string" && score.winner) return score.winner === "Draw" ? "Draw" : `Winner: ${score.winner}`;
  if (item.scoreTemplate === "basketball" || item.scoreTemplate === "generic") return `${score.teamA_score ?? 0} – ${score.teamB_score ?? 0}`;
  if (item.scoreTemplate === "set_based" || item.scoreTemplate === "badminton") {
    if (Array.isArray(score.sets)) return score.sets.map(set => { const value = set as { teamA?: number; teamB?: number }; return `${value.teamA ?? 0}–${value.teamB ?? 0}`; }).join(" · ") || `${score.teamA_points ?? 0} – ${score.teamB_points ?? 0}`;
    return [score.set1, score.set2, score.set3].filter(Boolean).join(" · ");
  }
  return typeof score.summary === "string" && score.summary ? score.summary : item.updateNote ?? "Update pending";
}
