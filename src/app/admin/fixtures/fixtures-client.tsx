"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { PortalDialog } from "@/components/admin/portal-dialog";
import { canStartMatch, fromISTInput, toISTInput } from "@/lib/match-clock";
import { formatLiveScore } from "@/lib/live-ground";
import { MatchScoreAction } from "@/components/admin/match-score-action";
import { eventMethod, type OperatingMethod } from "@/lib/event-operations";

export type FixtureItem = {
  fixture_id: string; stage: string; participant_a_label: string; participant_b_label: string;
  venue: string | null; reporting_at: string | null; starts_at: string | null; state: string;
  schedule_version: number; score_version: number; score_status: string | null;
  score_payload: Record<string, unknown> | null; actual_started_at?: string | null;
};
type EventMeta = { id: string; title: string; category: string; format: string; state: string; operating_method?: OperatingMethod; score_template?: string; venue?: string | null; starts_at?: string | null; ends_at?: string | null };
export type FixtureEntrant = { target_id: string; target_kind: "application" | "group"; label: string; batch_label: string | null; roll_canonical: string | null; leader?: string; members?: string[] };
type HistoryEntry = { id: string; actor_name: string | null; previous_schedule: { starts_at?: string; venue?: string }; reason: string; created_at: string };
type Operation = "reschedule" | "reminders" | "history" | "delete" | null;

export function formatTeamLabel(raw: string) { return /^\d{4}$/.test(raw.trim()) ? `Batch ${raw.trim()}` : raw.trim(); }
function time(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Time to be announced"; }
function fixtureStatus(f: FixtureItem, scoring: boolean) {
  if (!scoring) return f.state === "cancelled" ? "cancelled" : f.state === "completed" ? "final" : "scheduled";
  if (f.state === "cancelled" || f.score_status === "cancelled") return "cancelled";
  if (f.state === "completed" || f.score_status === "final") return "final";
  if (f.score_status === "paused" && f.actual_started_at) return "paused";
  return f.actual_started_at ? "live" : "scheduled";
}

export function FixturesClient({ event, fixtures, participants = [], rosterError = false, isMainAdmin }: {
  event: EventMeta; fixtures: FixtureItem[]; participants?: FixtureEntrant[]; rosterError?: boolean; isMainAdmin: boolean;
}) {
  const scoring = eventMethod(event) === "live_matches";
  const status = (fixture: FixtureItem) => fixtureStatus(fixture, scoring);
  const grouped = ["pair", "group", "sport"].includes(event.format);
  const participantType = event.format === "pair" ? "pair" : event.format === "group" ? "group" : grouped ? "team" : "player";
  const [prevFixtures, setPrevFixtures] = useState(fixtures);
  const [matchList, setMatchList] = useState(fixtures);
  if (fixtures !== prevFixtures) {
    setPrevFixtures(fixtures);
    setMatchList(fixtures);
  }
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const matches = matchList;
  const current = matches.find(f => f.fixture_id === selectedId) ?? null;
  const rounds = Array.from(new Set(matchList.map(f => f.stage)));
  const visible = matches.filter(f => (filter === "all" || (filter === "live" ? ["live", "paused"].includes(status(f)) : status(f) === filter)) && (!roundFilter || f.stage === roundFilter) && `${f.participant_a_label} ${f.participant_b_label} ${f.stage} ${f.venue ?? ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  const participantHref = `/admin/${grouped ? "groups" : "selection"}?event=${event.id}`;
  const score = (f: FixtureItem) => formatLiveScore({ scoreTemplate: event.score_template, scorePayload: f.score_payload } as Parameters<typeof formatLiveScore>[0]);

  async function send(body: Record<string, unknown>, success: string) {
    if (busy) return false;
    setBusy(true); setNotice(null);
    try {
      const response = await fetch("/api/admin/fixtures", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { ok?: boolean; error?: string; fixtures?: FixtureItem[] };
      if (!response.ok || !result.ok) throw new Error(result.error ?? "Unable to save. Try again.");
      if (Array.isArray(result.fixtures)) setMatchList(result.fixtures);
      setNotice({ text: success, error: false }); return true;
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
    const a = participants.find(p => p.target_id === sideA), b = participants.find(p => p.target_id === sideB);
    if (rosterError || !a || !b || a.target_id === b.target_id) { setNotice({ text: "Choose two different final-roster participants.", error: true }); return; }
    if (reporting && reporting > starts) { setNotice({ text: "Reporting time must be before match start.", error: true }); return; }
    if (await send({ action: "create", eventId: event.id, stage: round, participantA: { kind: a.target_kind, id: a.target_id }, participantB: { kind: b.target_kind, id: b.target_id }, venue, startsAt: fromISTInput(starts), reportingAt: fromISTInput(reporting) }, scoring ? "Match scheduled. Start & Score is available on match day." : "Pairing and match time published.")) { setCreating(false); setSideA(""); setSideB(""); }
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
    <section className="fx-command"><div><span className="fx-eyebrow">Match centre</span><h2>{event.title}</h2><p>{participants.length} approved {participantType}s <span>·</span> {matchList.length} matches</p></div><div className="fx-actions"><Link href={participantHref}>{grouped ? "Manage teams & pairs" : "Player roster"} ↗</Link><button className="fx-primary" type="button" onClick={openCreate}>{creating ? "Close creator" : "+ Schedule match"}</button></div></section>
    {!grouped && <p className="fx-guidance">Choose two approved players and publish their pairing and match time.</p>}
    <section className="fx-guidance" aria-label="Prepare event roster"><p>{event.format === "pair" ? "Both students register individually and accept their pair before coordinator publication." : grouped ? "Review registrations, appoint a captain or leader, then publish their proposed roster before scheduling." : "Review registrations and confirm the final participant roster before scheduling."}</p><div className="fx-actions"><Link href={`/admin/review?event=${event.id}`}>1 · Review registrations</Link><Link href={participantHref}>{grouped ? event.format === "pair" ? "2 · Review pairs" : "2 · Appoint captain / leader" : "2 · Final player roster"}</Link>{grouped && <Link href={participantHref}>3 · Publish roster</Link>}</div></section>
    {rosterError && <p role="alert" className="fx-notice fx-error">The official roster could not be loaded. Existing matches remain visible; reload this page before creating a fixture. <Link href={`/admin/fixtures?event=${event.id}`}>Retry roster loading</Link></p>}
    {!current && message}
    {creating && <section className="fx-creator"><div className="fx-section-heading"><div><span className="fx-eyebrow">New fixture</span><h3>Build the next matchup.</h3></div><span className="fx-step">{scoring ? "Roster → Match → Start → Score" : "Players → Pairing → Publish"}</span></div>
      {rosterError ? <p role="alert">Reload the official roster to continue.</p> : participants.length < 2 ? <div className="fx-empty"><h3>{grouped ? `Publish two ${event.format === "pair" ? "pairs" : "rosters"} first` : "Confirm at least two players"}</h3><p>{participants.length} official {participantType}s available. {grouped ? "Only coordinator-published rosters can be scheduled. Complete the preparation steps above." : "Only approved students on the final roster appear here; reserves are excluded."}</p><Link className="fx-primary" href={participantHref}>{grouped ? "Open team workspace" : "Open player roster"} →</Link></div> : <form onSubmit={create}>
        <div className="fx-two">{["A", "B"].map(side => {
          const chosen = participants.find(p => p.target_id === (side === "A" ? sideA : sideB));
          return <div key={side}><label className="fx-participant"><span className="fx-eyebrow">{participantType} {side === "A" ? "1" : "2"}</span><select required aria-label={`${participantType} ${side === "A" ? "1" : "2"}`} value={side === "A" ? sideA : sideB} onChange={e => (side === "A" ? setSideA : setSideB)(e.target.value)}><option value="">Choose {participantType}</option>{participants.map(p => <option key={p.target_id} value={p.target_id} disabled={p.target_id === (side === "A" ? sideB : sideA)}>{p.label}{p.batch_label ? ` · Batch ${p.batch_label}` : ""}{p.roll_canonical ? ` · Roll ${p.roll_canonical}` : ""}{p.leader ? ` · ${p.leader}` : ""}</option>)}</select></label>{chosen && <p>{chosen.batch_label ? `Batch ${chosen.batch_label}` : "Mixed batch roster"}{chosen.roll_canonical ? ` · Roll ${chosen.roll_canonical}` : ""}{chosen.leader ? ` · ${chosen.leader}` : ""}</p>}{chosen?.members && <details><summary>View {participantType} roster{chosen.leader ? ` · ${chosen.leader}` : ""}</summary><ul>{chosen.members.map((member,index) => <li key={index}>{member}</li>)}</ul></details>}</div>;
        })}</div>
        <label>Round<input value={round} onChange={e => setRound(e.target.value)} list="fixture-rounds" required maxLength={100} placeholder="Round 1, Group A, Semi-final…" /><datalist id="fixture-rounds">{["Round 1", "Group A", "Group B", "Quarter-final", "Semi-final", "Final", "Third place"].map(r => <option key={r} value={r} />)}</datalist></label>
        {scheduleFields}<div className="fx-actions"><button className="fx-primary" type="submit" disabled={busy}>{busy ? "Scheduling…" : "Schedule match"}</button><button className="fx-secondary" type="button" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>}
    </section>}
    <section className="fx-schedule"><div className="fx-section-heading"><h3>Match schedule</h3><span>{visible.length} shown</span></div>
      <div className="fx-filters"><div className="fx-tabs" aria-label="Match status">{[["all", "All"], ["scheduled", "Upcoming"], ["live", "Live"], ["final", "Finished"], ["cancelled", "Cancelled"]].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}<span>{matches.filter(f => key === "all" || (key === "live" ? ["live", "paused"].includes(status(f)) : status(f) === key)).length}</span></button>)}</div><div className="fx-two"><input aria-label="Search matches" type="search" placeholder="Search players, teams or venue" value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter by round" value={roundFilter} onChange={e => setRoundFilter(e.target.value)}><option value="">All rounds</option>{rounds.map(r => <option key={r}>{r}</option>)}</select></div></div>
      <div className="fx-match-grid">{visible.map(f => <button type="button" className="fx-match" key={f.fixture_id} onClick={() => { setSelectedId(f.fixture_id); setOperation(null); setNotice(null); }}>
        <div className="fx-match-top"><span>{f.stage}</span><span className="fx-state" data-state={status(f)}>{status(f) === "final" ? "Finished" : status(f)}</span></div><div className="fx-matchup"><strong>{formatTeamLabel(f.participant_a_label)}</strong><span>vs</span><strong>{formatTeamLabel(f.participant_b_label)}</strong></div>
        {scoring && f.actual_started_at && f.score_payload && <p className="fx-score">{score(f)}</p>}<div className="fx-match-meta"><span>{time(f.starts_at)}</span><span>{f.venue ?? "Venue to be confirmed"}</span></div><div className="fx-match-footer"><span>{!scoring ? "View pairing & match information" : status(f) === "scheduled" ? canStartMatch(f.starts_at, f.state, now) ? "Ready to start today" : "Scoring locked until match starts" : status(f) === "live" ? "Open scorer & match controls" : "View match details"}</span><span aria-hidden="true">↗</span></div>
      </button>)}</div>
      {!visible.length && <div className="fx-empty"><h3>{matchList.length ? "No matching fixtures" : "Your next match starts here"}</h3><p>{matchList.length ? "Try another filter or search." : "Choose approved participants, add a round and set the match time."}</p>{!matchList.length && <button className="fx-primary" type="button" onClick={() => { if (!creating) openCreate(); }}>Schedule first match</button>}</div>}
    </section>
    {current && <PortalDialog labelledBy="fixture-title" onClose={() => { setSelectedId(null); setOperation(null); }} busy={busy}><div className="fx-detail">
      <header><div><span className="fx-eyebrow">{current.stage}</span><h2 id="fixture-title">{operation === "reschedule" ? "Reschedule match" : operation === "history" ? "Schedule history" : operation === "delete" ? "Delete match?" : operation === "reminders" ? "Send reminder" : "Match details"}</h2></div><button type="button" className="fx-close" aria-label="Close match details" disabled={busy} onClick={() => { setSelectedId(null); setOperation(null); }}>×</button></header>
      <div className="fx-duel"><strong>{formatTeamLabel(current.participant_a_label)}</strong><span>vs</span><strong>{formatTeamLabel(current.participant_b_label)}</strong><span className="fx-state" data-state={status(current)}>{status(current) === "final" ? "Finished" : status(current)}</span></div>{message}
      {operation === null && <>
        {scoring && current.actual_started_at && current.score_payload && <p className="fx-detail-score">{score(current)}</p>}
        <dl className="fx-details"><div><dt>Match starts · IST</dt><dd>{time(current.starts_at)}</dd></div><div><dt>Reporting time · IST</dt><dd>{time(current.reporting_at)}</dd></div><div><dt>Venue</dt><dd>{current.venue || "To be confirmed"}</dd></div></dl>
        {scoring && (status(current) === "scheduled" ? <section className="fx-start"><h3>{canStartMatch(current.starts_at, current.state, now) ? "Ready when the ground is." : "Match has not started"}</h3><p>Start & Score unlocks only on the scheduled IST day. Starting also prepares and claims this scoring device.</p><MatchScoreAction match={{id:current.fixture_id,event_id:event.id,event_title:event.title,event_state:event.state,stage:current.stage,participant_a_label:current.participant_a_label,participant_b_label:current.participant_b_label,venue:current.venue,starts_at:current.starts_at,state:current.state,actual_started_at:current.actual_started_at ?? null}} now={now} /></section> : current.actual_started_at && status(current) !== "cancelled" ? <Link className="fx-primary fx-score-link" href={`/scorer?fixture=${current.fixture_id}`}>{status(current) === "final" ? "Review / correct score" : "Open match scorer"} →</Link> : null)}
        <div className="fx-detail-actions"><button type="button" onClick={() => void openOperation("reschedule")}>Reschedule</button><button type="button" onClick={() => void openOperation("reminders")}>Send reminder</button><button type="button" onClick={() => void openOperation("history")}>Schedule history</button></div>
        <details className="fx-advanced"><summary>More match controls</summary><p>Schedule v{current.schedule_version}{scoring ? ` · Score v${current.score_version}` : ""}</p>{scoring && isMainAdmin && current.actual_started_at && <button type="button" disabled={busy} onClick={() => void releaseDevice()}>Release scoring device</button>}<button className="fx-danger" type="button" onClick={() => void openOperation("delete")}>Delete match</button></details>
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
