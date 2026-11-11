"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { matchScoringAction, type ScoringMatch } from "@/lib/match-scoring";
import { savePreparedFixture, scorerDeviceId, type PreparedFixture } from "@/lib/offline-score-store";

export function MatchScoreAction({ match, now, onStarted }: { match: ScoringMatch; now: number; onStarted?: () => Promise<void> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const action = matchScoringAction(match, now);
  async function start() {
    if (busy) return;
    setBusy(true); setError("");
    let prepared=false;
    try {
      const response = await fetch("/api/admin/fixtures/prepare-offline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: match.id, deviceId: scorerDeviceId(), start: true }) });
      const body = await response.json() as { fixture?: PreparedFixture; error?: string };
      if (!response.ok || !body.fixture) throw new Error(body.error ?? "Unable to start this match. Retry when connected.");
      prepared=true;
      await savePreparedFixture(body.fixture);
      if (onStarted) await onStarted();
      else router.push(`/scorer?fixture=${match.id}`);
    } catch (reason) { setError(prepared ? "Match started on the server, but this device could not finish preparation. Enable browser storage and retry; do not start scoring offline yet." : reason instanceof Error ? reason.message : "Connection unavailable. Retry when connected."); }
    finally { setBusy(false); }
  }
  return <div className="match-score-action">
    {action === "continue" || action === "review" ? <Link className="portal-primary" href={`/scorer?fixture=${match.id}`}>{action === "review" ? "Review score" : "Continue scoring"} →</Link> : <button type="button" className="portal-primary" disabled={busy || action !== "start"} onClick={() => void start()}>{busy ? "Starting…" : action === "unavailable" ? "Scoring unavailable" : action === "locked" ? "Locked until match day" : "Start & Score"}</button>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
