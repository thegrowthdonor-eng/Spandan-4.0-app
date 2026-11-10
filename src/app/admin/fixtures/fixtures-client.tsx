"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalDialog } from "@/components/admin/portal-dialog";
import { canStartMatch, fromISTInput, toISTInput } from "@/lib/match-clock";
import { formatLiveScore } from "@/lib/live-ground";

export type FixtureItem = {
  fixture_id: string; stage: string; participant_a_label: string; participant_b_label: string;
  venue: string | null; reporting_at: string | null; starts_at: string | null; state: string;
  schedule_version: number; score_version: number; score_status: string | null;
  score_payload: Record<string, unknown> | null; actual_started_at?: string | null;
};
type EventMeta = { id: string; title: string; category: string; format: string; state: string; score_template?: string; venue?: string | null; starts_at?: string | null; ends_at?: string | null };
type BatchItem = { batch_id: string; label: string; course_label?: string | null };
type GroupItem = { group_id: string; name: string; batch_id: string; state: string };
export type SoloStudentItem = { application_id: string; student_id: string; full_name: string; batch_label: string; course_label?: string | null; roll_canonical: string; review_state?: string; selection_state?: string };
type HistoryEntry = { id: string; actor_name: string | null; previous_schedule: { starts_at?: string; venue?: string }; reason: string; created_at: string };
type Operation = "reschedule" | "reminders" | "history" | "delete" | null;

export function formatTeamLabel(raw: string) { return /^\d{4}$/.test(raw.trim()) ? `Batch ${raw.trim()}` : raw.trim(); }
function time(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Time to be announced"; }
function status(f: FixtureItem) {
  if (f.state === "cancelled" || f.score_status === "cancelled") return "cancelled";
  if (f.state === "completed" || f.score_status === "final") return "final";
  if (f.score_status === "paused" && f.actual_started_at) return "paused";
  return f.actual_started_at ? "live" : "scheduled";
}

export function FixturesClient({ event, fixtures, eligibleBatches = [], registeredGroups = [], soloStudents = [], isMainAdmin }: {
  event: EventMeta; fixtures: FixtureItem[]; eligibleBatches?: BatchItem[]; registeredGroups?: GroupItem[]; soloStudents?: SoloStudentItem[]; isMainAdmin: boolean;
}) {
  const router = useRouter();
  const grouped = ["pair", "group", "sport"].includes(event.format);
  const participantType = event.format === "pair" ? "pair" : grouped ? "team" : "player";
  const participants = useMemo(() => grouped
    ? registeredGroups.filter(g => g.state === "published").map(g => ({ id: g.group_id, label: g.name, detail: eligibleBatches.find(b => b.batch_id === g.batch_id)?.label ?? "Approved roster" }))
    : soloStudents.filter(s => (!s.review_state || s.review_state === "approved") && s.selection_state !== "not_selected").map(s => ({ id: s.student_id, label: `${s.full_name} (${s.batch_label}${s.roll_canonical ? `, #${s.roll_canonical}` : ""})`, detail: s.batch_label })), [grouped, registeredGroups, eligibleBatches, soloStudents]);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [started, setStarted] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<Operation>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [roundFilter, setRoundFilter] = useState("");
  const [now, setNow] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [sideA, setSideA] = useState("");
  const [sideB, setSideB] = useState("");
  const [round, setRound] = useState("Round 1");
  const [venue, setVenue] = useState(event.venue ?? "");
  const [starts, setStarts] = useState(toISTInput(event.starts_at ?? null));
  const [reporting, setReporting] = useState(toISTInput(event.starts_at ? new Date(Date.parse(event.starts_at) - 900_000).toISOString() : null));
  const [reason, setReason] = useState("");

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = setTimeout(tick, 0), timer = setInterval(tick, 15_000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, []);

  const matches = fixtures.map(f => started[f.fixture_id] && !f.actual_started_at ? { ...f, actual_started_at: started[f.fixture_id], state: "ongoing", score_status: "live" } : f);
  const current = matches.find(f => f.fixture_id === selectedId) ?? null;
  const rounds = Array.from(new Set(fixtures.map(f => f.stage)));
  const visible = matches.filter(f => (filter === "all" || (filter === "live" ? ["live", "paused"].includes(status(f)) : status(f) === filter)) && (!roundFilter || f.stage === roundFilter) && `${f.participant_a_label} ${f.participant_b_label} ${f.stage} ${f.venue ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  const participantHref = `/admin/${grouped ? "groups" : "selection"}?event=${event.id}`;
  const score = (f: FixtureItem) => formatLiveScore({ scoreTemplate: event.score_template, scorePayload: f.score_payload } as Parameters<typeof formatLiveScore>[0]);

  async function send(body: Record<string, unknown>, success: string) {
    if (busy) return false;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/fixtures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to save. Try again.");
      setNotice({ text: success, error: false }); router.refresh(); return true;
    } catch (error) { setNotice({ text: error instanceof Error ? error.message : "Connection unavailable. Try again.", error: true }); return false; }
    finally { setBusy(false); }
  }

  function openCreate() {
    setVenue(event.venue ?? ""); setStarts(toISTInput(event.starts_at ?? null));
    setReporting(toISTInput(event.starts_at ? new Date(Date.parse(event.starts_at) - 900_000).toISOString() : null));
    setCreating(!creating); setNotice(null);
  }
  function changeStart(value: string) {
    setStarts(value);
    const iso = fromISTInput(value);
    setReporting(iso ? toISTInput(new Date(Date.parse(iso) - 900_000).toISOString()) : "");
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    const a = participants.find(p => p.id === sideA), b = participants.find(p => p.id === sideB);
    if (!a || !b || a.id === b.id) { setNotice({ text: "Choose two different approved participants.", error: true }); return; }
    if (reporting && reporting > starts) { setNotice({ text: "Reporting time must be before match start.", error: true }); return; }
    if (await send({ action: "create", eventId: event.id, stage: round, participantALabel: a.label, participantBLabel: b.label, venue, startsAt: fromISTInput(starts), reportingAt: fromISTInput(reporting) }, "Match scheduled. Scoring opens after Start Match.")) { setCreating(false); setSideA(""); setSideB(""); }
  }
  async function start(f: FixtureItem) {
    if (await send({ action: "start", fixtureId: f.fixture_id }, "Match started. Open the scorer to update the score.")) setStarted(old => ({ ...old, [f.fixture_id]: new Date().toISOString() }));
  }
  async function openOperation(next: Operation) {
    if (!current) return;
    setOperation(next); setReason(""); setNotice(null);
    if (next === "reschedule") { setStarts(toISTInput(current.starts_at)); setReporting(toISTInput(current.reporting_at)); setVenue(current.venue ?? ""); }
    if (next === "history") {
      setHistory(null); setHistoryError(false);
      try {
        const response = await fetch(`/api/admin/fixtures?fixtureId=${current.fixture_id}&type=history`, { cache: "no-store" });
        const result = await response.json() as { ok?: boolean; data?: HistoryEntry[] };
        if (!response.ok || !result.ok) throw new Error();
        setHistory(result.data ?? []);
      } catch { setHistoryError(true); }
    }
  }
  async function submitOperation(e: FormEvent) {
    e.preventDefault(); if (!current) return;
    const body: Record<string, unknown> = { action: operation, fixtureId: current.fixture_id };
    if (operation === "reschedule") Object.assign(body, { startsAt: fromISTInput(starts), reportingAt: fromISTInput(reporting), venue, reason });
    if (operation === "reminders") body.body = reason;
    if (await send(body, operation === "delete" ? "Match deleted." : operation === "reminders" ? "Match reminders sent." : "Schedule updated.")) { setOperation(null); if (operation !== "reminders") setSelectedId(null); }
  }
  async function releaseDevice() {
    if (!current || !window.confirm("Release the current scorer? Unsynced scores on that device will stay unpublished.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/admin/fixtures/release-device", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fixtureId: current.fixture_id, deviceId: crypto.randomUUID(), force: true }) });
      const data = await response.json() as { error?: string };
      setNotice({ text: response.ok ? "Device released. A replacement scorer can open this match." : data.error ?? "Unable to release scorer.", error: !response.ok });
    } catch { setNotice({ text: "Connection unavailable.", error: true }); } finally { setBusy(false); }
  }

  const scheduleFields = <div className="fx-fields"><label>Venue<input value={venue} onChange={e => setVenue(e.target.value)} maxLength={160} placeholder="Ground, court or room" /></label><div className="fx-two"><label>Match starts · IST<input type="datetime-local" required value={starts} onChange={e => changeStart(e.target.value)} /></label><label>Reporting · IST<input type="datetime-local" value={reporting} onChange={e => setReporting(e.target.value)} /><small>Defaults to 15 minutes before start</small></label></div></div>;
  const message = notice && <p className={`fx-notice ${notice.error ? "fx-error" : ""}`} role="status">{notice.text}</p>;

  return <div className="fx-workspace">
    <section className="fx-command"><div><span className="fx-eyebrow">Match centre</span><h2>{event.title}</h2><p>{participants.length} approved {participantType}s <span>·</span> {fixtures.length} matches</p></div><div className="fx-actions"><Link href={participantHref}>{grouped ? "Manage teams & pairs" : "Player roster"} ↗</Link><button className="fx-primary" type="button" onClick={openCreate}>{creating ? "Close creator" : "+ Schedule match"}</button></div></section>
    {!grouped && <p className="fx-guidance">Choose approved players for head-to-head matches. Heats, performances and events with several entrants use <Link href="/admin/live">Live Desk</Link> and <Link href={`/admin/results?event=${event.id}`}>Results</Link>.</p>}
    {!current && message}
    {creating && <section className="fx-creator"><div className="fx-section-heading"><div><span className="fx-eyebrow">New fixture</span><h3>Build the next matchup.</h3></div><span className="fx-step">Roster → Match → Start → Score</span></div>
      {participants.length < 2 ? <div className="fx-empty"><h3>{grouped ? "Publish your rosters first" : "Approve at least two players"}</h3><p>{grouped ? "Captains choose their team name and squad. Approve and publish those teams before scheduling. Pairs must be confirmed and approved." : "Your approved participant roster will appear here automatically."}</p><Link className="fx-primary" href={participantHref}>{grouped ? "Open team workspace" : "Open player roster"} →</Link></div> : <form onSubmit={create}>
        <div className="fx-two">{["A", "B"].map(side => <label key={side} className="fx-participant"><span className="fx-eyebrow">{participantType} {side === "A" ? "1" : "2"}</span><select required aria-label={`${participantType} ${side === "A" ? "1" : "2"}`} value={side === "A" ? sideA : sideB} onChange={e => (side === "A" ? setSideA : setSideB)(e.target.value)}><option value="">Choose {participantType}</option>{participants.map(p => <option key={p.id} value={p.id} disabled={p.id === (side === "A" ? sideB : sideA)}>{p.label} · {p.detail}</option>)}</select></label>)}</div>
        <label>Round<input value={round} onChange={e => setRound(e.target.value)} list="fixture-rounds" required maxLength={100} placeholder="Round 1, Group A, Semi-final…" /><datalist id="fixture-rounds">{["Round 1", "Group A", "Group B", "Quarter-final", "Semi-final", "Final", "Third place"].map(r => <option key={r} value={r} />)}</datalist></label>
        {scheduleFields}<div className="fx-actions"><button className="fx-primary" type="submit" disabled={busy}>{busy ? "Scheduling…" : "Schedule match"}</button><button className="fx-secondary" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>}
    </section>}
    <section className="fx-schedule"><div className="fx-section-heading"><h3>Match schedule</h3><span>{visible.length} shown</span></div>
      <div className="fx-filters"><div className="fx-tabs" aria-label="Match status">{[["all", "All"], ["scheduled", "Upcoming"], ["live", "Live"], ["final", "Finished"], ["cancelled", "Cancelled"]].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{matches.filter(f => key === "all" || (key === "live" ? ["live", "paused"].includes(status(f)) : status(f) === key)).length}</span></button>)}</div><div className="fx-two"><input aria-label="Search matches" type="search" placeholder="Search players, teams or venue" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter by round" value={roundFilter} onChange={e => setRoundFilter(e.target.value)}><option value="">All rounds</option>{rounds.map(r => <option key={r}>{r}</option>)}</select></div></div>
      <div className="fx-match-grid">{visible.map(f => <button type="button" className="fx-match" key={f.fixture_id} onClick={() => { setSelectedId(f.fixture_id); setOperation(null); setNotice(null); }}>
        <div className="fx-match-top"><span>{f.stage}</span><span className="fx-state" data-state={status(f)}>{status(f) === "final" ? "Finished" : status(f)}</span></div><div className="fx-matchup"><strong>{formatTeamLabel(f.participant_a_label)}</strong><span>vs</span><strong>{formatTeamLabel(f.participant_b_label)}</strong></div>
        {f.actual_started_at && f.score_payload && <p className="fx-score">{score(f)}</p>}<div className="fx-match-meta"><span>{time(f.starts_at)}</span><span>{f.venue ?? "Venue to be confirmed"}</span></div><div className="fx-match-footer"><span>{status(f) === "scheduled" ? canStartMatch(f.starts_at, f.state, now) ? "Ready to start today" : "Scoring locked until match starts" : status(f) === "live" ? "Open scorer & match controls" : "View match details"}</span><span aria-hidden="true">↗</span></div>
      </button>)}</div>
      {!visible.length && <div className="fx-empty"><h3>{fixtures.length ? "No matching fixtures" : "Your next match starts here"}</h3><p>{fixtures.length ? "Try another filter or search." : "Choose approved participants, add a round and set the match time."}</p>{!fixtures.length && <button className="fx-primary" type="button" onClick={() => { if (!creating) openCreate(); }}>Schedule first match</button>}</div>}
    </section>
    {current && <PortalDialog labelledBy="fixture-title" onClose={() => { setSelectedId(null); setOperation(null); }} busy={busy}><div className="fx-detail">
      <header><div><span className="fx-eyebrow">{current.stage}</span><h2 id="fixture-title">{operation === "reschedule" ? "Reschedule match" : operation === "history" ? "Schedule history" : operation === "delete" ? "Delete match?" : operation === "reminders" ? "Send reminder" : "Match details"}</h2></div><button type="button" className="fx-close" aria-label="Close match details" disabled={busy} onClick={() => { setSelectedId(null); setOperation(null); }}>×</button></header>
      <div className="fx-duel"><strong>{formatTeamLabel(current.participant_a_label)}</strong><span>vs</span><strong>{formatTeamLabel(current.participant_b_label)}</strong><span className="fx-state" data-state={status(current)}>{status(current) === "final" ? "Finished" : status(current)}</span></div>{message}
      {operation === null && <>
        {current.actual_started_at && current.score_payload && <p className="fx-detail-score">{score(current)}</p>}
        <dl className="fx-details"><div><dt>Match starts · IST</dt><dd>{time(current.starts_at)}</dd></div><div><dt>Reporting time · IST</dt><dd>{time(current.reporting_at)}</dd></div><div><dt>Venue</dt><dd>{current.venue || "To be confirmed"}</dd></div></dl>
        {status(current) === "scheduled" ? <section className="fx-start"><h3>{canStartMatch(current.starts_at, current.state, now) ? "Ready when the ground is." : "Match has not started"}</h3><p>{canStartMatch(current.starts_at, current.state, now) ? "Start this match when both sides are ready. This enables scoring." : current.starts_at ? "Start Match unlocks only on the scheduled match date (IST). Reschedule if the date has changed." : "Set a match date before starting."}</p><button className="fx-primary" type="button" disabled={busy || !canStartMatch(current.starts_at, current.state, now) || ["draft", "cancelled", "completed"].includes(event.state)} onClick={() => void start(current)}>{busy ? "Starting…" : "Start Match"}</button></section> : current.actual_started_at && status(current) !== "cancelled" ? <Link className="fx-primary fx-score-link" href={`/scorer?fixture=${current.fixture_id}`}>{status(current) === "final" ? "Review / correct score" : "Open match scorer"} →</Link> : null}
        <div className="fx-detail-actions"><button type="button" onClick={() => void openOperation("reschedule")}>Reschedule</button><button type="button" onClick={() => void openOperation("reminders")}>Send reminder</button><button type="button" onClick={() => void openOperation("history")}>Schedule history</button></div>
        <details className="fx-advanced"><summary>More match controls</summary><p>Schedule v{current.schedule_version} · Score v{current.score_version}</p>{isMainAdmin && current.actual_started_at && <button type="button" disabled={busy} onClick={() => void releaseDevice()}>Release scoring device</button>}<button className="fx-danger" type="button" onClick={() => void openOperation("delete")}>Delete match</button></details>
      </>}
      {operation === "history" && <section className="fx-history">{historyError ? <p role="alert">History could not be loaded. Close and retry.</p> : history === null ? <p role="status">Loading history…</p> : !history.length ? <p>No schedule changes yet.</p> : history.map(h => <article key={h.id}><strong>{h.actor_name ?? "Organiser"}</strong><small>{time(h.created_at)}</small><p>{h.reason}</p><p>Previously: {time(h.previous_schedule.starts_at ?? null)} · {h.previous_schedule.venue ?? "Venue not set"}</p></article>)}</section>}
      {operation && operation !== "history" && <form onSubmit={submitOperation}>
        {operation === "reschedule" && <>{scheduleFields}<label>Reason for change<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label></>}
        {operation === "reminders" && <label>Message to participants<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Please report to the ground 15 minutes before your match." /></label>}
        {operation === "delete" && <p className="fx-notice fx-error">This permanently removes the match, scores, schedule history and scorer locks. This cannot be undone.</p>}
        <button className={operation === "delete" ? "fx-danger" : "fx-primary"} type="submit" disabled={busy}>{busy ? "Saving…" : operation === "delete" ? "Delete permanently" : operation === "reminders" ? "Send reminder" : "Save schedule"}</button>
      </form>}
      {operation && <button className="fx-secondary" type="button" disabled={busy} onClick={() => setOperation(null)}>← Back to match</button>}
    </div></PortalDialog>}
  </div>;
}
