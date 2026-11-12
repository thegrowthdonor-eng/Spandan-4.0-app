"use client";

import Link from "next/link";
import { useState } from "react";
import type { CompetitionEntry, CompetitionWorkspace } from "@/lib/competition";
import { eventMethod, operatingLabels } from "@/lib/event-operations";
import { fromISTInput, toISTInput } from "@/lib/match-clock";
import { CompetitionHistory } from "./competition-history";
import styles from "./competition-workspace.module.css";

export type CompetitionCommand = (action: string, data: unknown) => Promise<boolean>;

export function CompetitionWorkspacePanel({ initial, children }: { initial: CompetitionWorkspace; children?: React.ReactNode }) {
  const [workspace, setWorkspace] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const method = eventMethod(workspace.event);
  const cfg = workspace.settings;
  const command: CompetitionCommand = async (action, data) => {
    if (busy) return false;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/competition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: workspace.event.id, action, data }) });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Unable to save.");
      const refreshed = await fetch(`/api/competition?event=${workspace.event.id}`, { cache: "no-store" });
      const fresh = await refreshed.json();
      if (!refreshed.ok || !fresh.workspace) throw new Error("Saved, but refresh failed. Reload before editing again.");
      setWorkspace(fresh.workspace); setMessage("Saved."); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connect to save this change. Your work has not been submitted."); return false; }
    finally { setBusy(false); }
  };
  return <section className={styles.workspace} aria-busy={busy}>
    <div className={styles.banner}><div><span>Event workspace</span><h2>{operatingLabels[method]}</h2><p>{method === "live_matches" ? "Schedule your matches, then start scoring on match day." : method === "fixtures_only" ? "Publish pairings and timings. Final award positions are entered in Results." : method === "results_only" ? "Select the award winners and enter their optional final values." : method === "voting" ? "Review submissions, run voting and publish the verified winners." : "Share event information and updates through the existing gallery."}</p></div></div>
    {message && <p role="status" className={styles.message}>{message}</p>}
    {method === "live_matches" && <div className={styles.actions}><Link className="portal-primary" href={`/admin/scoring?event=${workspace.event.id}`}>Open live scoring →</Link><Link href={`/admin/results?event=${workspace.event.id}`}>Final results →</Link></div>}
    {method === "fixtures_only" && <div className={styles.actions}><Link className="portal-primary" href={`/admin/results?event=${workspace.event.id}`}>Publish final results →</Link></div>}
    {["live_matches", "fixtures_only"].includes(method) && children}
    {method === "results_only" && <div className={styles.card}><h3>Official award positions</h3><p>No match or session needs to be started. Approved participants and published teams are available in Results.</p><Link className="portal-primary" href={`/admin/results?event=${workspace.event.id}`}>Enter & publish results →</Link></div>}
    {method === "programme" && <div className={styles.card}><h3>Information & gallery updates</h3><p>This event has no official result publication. Registration and participant management remain available where enabled.</p><div className={styles.actions}><Link href="/schedule">View public schedule →</Link><Link href="/gallery">View festival gallery →</Link></div></div>}
    {method === "voting" && <fieldset disabled={busy} className={styles.fieldset}>
      <details open={!cfg?.submission_closes_at} className={styles.card}><summary>Submission deadline</summary><form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void command("settings", { schedule_mode: cfg?.schedule_mode ?? "submission", result_mode: "public_vote", attempts: 1, measurement_method: "Official measurement", submission_closes_at: fromISTInput(String(data.get("deadline"))), version: cfg?.version ?? 0 }); }}><label>Entries close · IST<input name="deadline" required type="datetime-local" defaultValue={toISTInput(cfg?.submission_closes_at ?? null)} /></label><p>Replacing work before this deadline sends it for approval again. Voting opens after submissions close.</p><button className="portal-secondary">Save deadline</button></form></details>
      <VotingManagement workspace={workspace} command={command} />
    </fieldset>}
    <CompetitionHistory eventId={workspace.event.id} mode={cfg?.result_mode ?? ""} />
  </section>;
}

function EntryReview({ entry, frozen, verified, command }: { entry: CompetitionEntry; frozen: boolean; verified: boolean; command: CompetitionCommand }) {
  const [reason, setReason] = useState("");
  return <details><summary>Review decision</summary><label>Reason for rejection or disqualification<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label><div className={styles.actions}>{["approved", "rejected", "disqualified"].map(state => <button key={state} type="button" disabled={verified || (frozen && state !== "disqualified") || !["submitted", "approved", "rejected"].includes(entry.state) || (state !== "approved" && !reason.trim())} onClick={() => void command("review_entry", { entry_id: entry.id, version: entry.version, state, reason: state === "approved" ? "" : reason.trim() })}>{state === "approved" ? "Approve" : state === "rejected" ? "Reject" : "Disqualify"}</button>)}</div></details>;
}

function VotingManagement({ workspace: w, command }: { workspace: CompetitionWorkspace; command: CompetitionCommand }) {
  const [selected, setSelected] = useState<string[]>([]);
  const pending = w.entries.filter(e => e.state === "submitted").length;
  return <section className={styles.card}>
    <div className={styles.actions}><span>1 · Review entries</span><span>2 · Voting</span><span>3 · Verified results</span></div>
    <h3>Entries & public voting</h3><p>{pending} awaiting review · {w.entries.filter(e => e.state === "approved").length} approved. Vote totals remain hidden until the round closes.</p>
    <Link href={`/competition/${w.event.id}`}>Open submissions & public voting →</Link>
    {!w.rounds.length && <p>Before scheduling voting, the Main Admin must <Link href={`/admin/results?event=${w.event.id}`}>configure the award points</Link>. They lock when the first round is scheduled.</p>}
    {!w.entries.length && <p>No submissions yet. Set the deadline and share the submission link with approved participants.</p>}
    {w.entries.map(entry => <article key={entry.id} className={styles.card}><div><strong>Entry {entry.entry_number} · {entry.title}</strong><p>{entry.state}</p></div>{w.rounds.length > 0 && !w.settings?.verified && entry.state === "approved" && <label className={styles.check}><input type="checkbox" checked={selected.includes(entry.id)} onChange={e => setSelected(e.target.checked ? [...selected, entry.id] : selected.filter(id => id !== entry.id))} />Include in tied-group runoff</label>}{entry.description && <details><summary>{w.event.entry_format === "text" ? "Read written work" : "Read description"}</summary><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.description}</p></details>}{entry.note && <p>{entry.note}</p>}{entry.media_id && <p><Link href={`/api/media/${entry.media_id}`} target="_blank" rel="noopener noreferrer">Review submitted image ↗</Link></p>}<EntryReview entry={entry} frozen={!!w.rounds.length} verified={!!w.settings?.verified} command={command} /></article>)}
    {w.rounds.map(round => <p key={round.id}>Round {round.round_number} · {toISTInput(round.opens_at).replace("T", " ")} → {toISTInput(round.closes_at).replace("T", " ")} IST</p>)}
    {!w.settings?.verified && <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void command("voting_round", { opens_at: fromISTInput(String(form.get("open"))), closes_at: fromISTInput(String(form.get("close"))), entry_ids: selected }); }}><h4>{w.rounds.length ? "Schedule tied-group runoff" : "Schedule public voting"}</h4><p>{w.rounds.length ? "Select every entry from the tied award group. Unrelated or incomplete groups cannot be scheduled." : "All approved entries will be included. Close submissions and review entries first."}</p><div className={styles.grid}><label>Voting opens · IST<input name="open" required type="datetime-local" /></label><label>Voting closes · IST<input name="close" required type="datetime-local" /></label></div><button className="portal-primary">{w.rounds.length ? "Schedule runoff" : "Approve options & schedule voting"}</button></form>}
    {w.rounds.length > 0 && !w.settings?.verified && <button type="button" className="portal-secondary" onClick={() => void command("verify_votes", {})}>Verify votes & ranking</button>}
    {w.settings?.verified && <div className={styles.card}><h4>Verified award positions</h4>{w.placements.map(p => <p key={p.placing}>#{p.placing} · Entry {w.entries.find(n => n.id === p.entry_id)?.entry_number}</p>)}<Link className="portal-primary" href={`/admin/results?event=${w.event.id}`}>Publish verified winners & points →</Link></div>}
  </section>;
}
