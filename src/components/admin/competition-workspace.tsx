"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect,useState } from "react";
import { compatibleResults,competitionPreset, draftSessions, measurementLabel, parseMeasurement, rankedMeasurements, scheduleModes, type CompetitionSession, type CompetitionSettings, type CompetitionWorkspace, type Entrant } from "@/lib/competition";
import { fromISTInput, istDate, toISTInput } from "@/lib/match-clock";
import styles from "./competition-workspace.module.css";
import {CompetitionHistory} from "./competition-history";

export type CompetitionCommand = (action: string, data: unknown) => Promise<boolean>;
const label = (value: string) => value.replaceAll("_", " ");
const identity = (row: Pick<Entrant,"application_id" | "group_id">) => ({ application_id: row.application_id, group_id: row.group_id });

export function CompetitionWorkspacePanel({ initial, children, serverNow, defaultVenue = "", defaultStart = null, existingMatches = false }: { initial: CompetitionWorkspace; children?: React.ReactNode; serverNow: number; defaultVenue?: string; defaultStart?: string | null; existingMatches?: boolean }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState(initial);
  const [settings, setSettings] = useState<CompetitionSettings>(initial.settings ?? (existingMatches ? { schedule_mode: "match", result_mode: "sport_score", attempts: 1, submission_closes_at: null,measurement_method:"Official measurement" } : competitionPreset(initial.event.title, initial.event.registration_enabled)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now,setNow]=useState(serverNow);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15_000);return ()=>clearInterval(timer);},[]);
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
      setWorkspace(fresh.workspace); setSettings(fresh.workspace.settings); setMessage("Saved."); router.refresh(); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connection required. Nothing is saved offline for this operation."); return false; }
    finally { setBusy(false); }
  };
  const cfg = workspace.settings;
  return <section className={styles.workspace} aria-busy={busy}>
    <div className={styles.banner}><div><span>Event operations</span><h2>{cfg ? `${label(cfg.schedule_mode)} · ${label(cfg.result_mode)}` : "Choose how this event runs"}</h2><p>Participant format stays {workspace.event.format}. Configure scheduling and results separately.</p></div><Link href={`/admin/scoring?event=${workspace.event.id}`}>Run events →</Link></div>
    <details open={!cfg} className={styles.card}><summary>Operation settings</summary><form onSubmit={event => { event.preventDefault(); void command("settings", { ...settings, version: cfg?.version ?? 0 }); }}><div className={styles.grid}>
      <label>Scheduling<select value={settings.schedule_mode} onChange={e => { const mode = e.target.value as CompetitionSettings["schedule_mode"]; setSettings({ ...settings, schedule_mode: mode, result_mode: compatibleResults[mode].includes(settings.result_mode) ? settings.result_mode : compatibleResults[mode][0] }); }}>{scheduleModes.map(mode => <option key={mode} value={mode}>{label(mode)}</option>)}</select></label>
      <label>Results<select value={settings.result_mode} onChange={e => setSettings({ ...settings, result_mode: e.target.value as CompetitionSettings["result_mode"] })}>{compatibleResults[settings.schedule_mode].map(mode => <option key={mode} value={mode}>{label(mode)}</option>)}</select></label>
      {["time","distance","count"].includes(settings.result_mode) && <label>Attempts per entrant<input type="number" min={1} max={12} value={settings.attempts} onChange={e => setSettings({ ...settings, attempts: Number(e.target.value) })} /></label>}
      {["time","distance","count"].includes(settings.result_mode) && <label>Measurement method<input required maxLength={120} value={settings.measurement_method} onChange={e=>setSettings({...settings,measurement_method:e.target.value})} placeholder="e.g. official stopwatch / measuring tape" /></label>}
      {settings.result_mode === "public_vote" && <label>Submission deadline · IST<input required type="datetime-local" value={toISTInput(settings.submission_closes_at)} onChange={e => setSettings({ ...settings, submission_closes_at: fromISTInput(e.target.value) })} /></label>}
    </div><p>Settings lock once dependent records exist. Faculty judging stays offline; only approved final places are recorded here.</p><button disabled={busy} className="portal-primary">{cfg ? "Save settings" : "Confirm event operations"}</button></form></details>
    {message && <p role="status" className={styles.message}>{message}</p>}
    <fieldset disabled={busy} className={styles.fieldset}>
      {cfg?.schedule_mode === "match" || (!cfg && existingMatches) ? children : cfg && <>
        {!["submission","match"].includes(cfg.schedule_mode) && <SessionDraft candidates={workspace.candidates} settings={cfg} command={command} venue={defaultVenue} startsAt={defaultStart} programme={workspace.programme ?? []} />}
        {workspace.sessions.map(session => <SessionCard key={`${session.id}:${session.version}`} session={session} candidates={workspace.candidates} settings={cfg} command={command} now={now} />)}
        {cfg.result_mode === "public_vote" && <VotingManagement workspace={workspace} command={command} />}
        {!["public_vote","none","sport_score"].includes(cfg.result_mode) && <Link className="portal-primary" href={`/admin/results?event=${workspace.event.id}`}>Publish confirmed winners & batch points →</Link>}
      </>}
    </fieldset>
    <CompetitionHistory eventId={workspace.event.id} mode={cfg?.result_mode ?? ""} />
    <p className={styles.note}>Session, entry and voting changes require connectivity. No automatic advancement or reseeding. Existing brochure items remain independent unless deliberately linked.</p>
  </section>;
}

function Roster({ rows, setRows, candidates }: { rows: Entrant[]; setRows: (rows: Entrant[]) => void; candidates: Entrant[] }) {
  function move(index: number, offset: number) { const next = [...rows]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; setRows(next); }
  return <div className={styles.roster}>
    <select aria-label="Add eligible entrant" value="" onChange={e => { const row = candidates.find(c => c.key === e.target.value); if (row) setRows([...rows, row]); }}><option value="">Add approved entrant…</option>{candidates.filter(c => !rows.some(r => r.key === c.key)).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
    {rows.map((row, index) => <div className={styles.rosterRow} key={row.key}><span>{index + 1}. {row.label}</span><button type="button" aria-label={`Move ${row.label} up`} disabled={index === 0} onClick={() => move(index,-1)}>↑</button><button type="button" aria-label={`Move ${row.label} down`} disabled={index === rows.length - 1} onClick={() => move(index,1)}>↓</button><button type="button" aria-label={`Remove ${row.label}`} onClick={() => setRows(rows.filter(r => r.key !== row.key))}>×</button></div>)}
    <div className={styles.actions}><button type="button" onClick={() => setRows(candidates)}>Use all eligible entrants</button><button type="button" disabled={rows.length < 2} onClick={() => { const next = [...rows]; for (let i = next.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [next[i],next[j]] = [next[j],next[i]]; } setRows(next); }}>Shuffle explicitly</button></div>
  </div>;
}

function SessionDraft({ candidates, settings, command, venue, startsAt,programme }: { candidates: Entrant[]; settings: CompetitionSettings; command: CompetitionCommand; venue: string; startsAt: string | null;programme:NonNullable<CompetitionWorkspace["programme"]> }) {
  const [rows, setRows] = useState<Entrant[]>([]);
  const [capacity, setCapacity] = useState(8);
  const [draft, setDraft] = useState<Entrant[][] | null>(null);
  const [error, setError] = useState("");
  return <details className={styles.card}><summary>Create {label(settings.schedule_mode)} schedule</summary><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); const sessions = draft ?? [rows]; void command("sessions", { sessions: sessions.map((entrants,index) => ({ title: `${form.get("title")}${sessions.length > 1 ? ` ${index + 1}` : ""}`, venue: form.get("venue"), starts_at: fromISTInput(String(form.get("starts_at"))), reporting_at: fromISTInput(String(form.get("reporting_at"))), ends_at: null, is_final: form.get("is_final") === "on", schedule_entry_id: form.get("schedule_entry_id") || null, entrants: entrants.map((row,position) => ({ ...identity(row), position: position + 1 })) })) }).then(ok => { if (ok) { setDraft(null); setRows([]); } }); }}>
    <div className={styles.grid}><label>Session / round title<input name="title" required maxLength={95} defaultValue={settings.schedule_mode === "heat" ? "Heat" : settings.schedule_mode === "flight" ? "Flight" : "Session"} /></label><label>Venue<input name="venue" required maxLength={160} defaultValue={venue} /></label><label>Starts · IST<input type="datetime-local" name="starts_at" required defaultValue={toISTInput(startsAt)} /></label><label>Reporting · IST<input type="datetime-local" name="reporting_at" /></label><label>Capacity<input type="number" min={1} max={200} value={capacity} onChange={e => { setCapacity(Number(e.target.value)); setDraft(null); }} /></label></div>
    {!!programme.length && <label>Link brochure item (optional)<select name="schedule_entry_id" defaultValue=""><option value="">Keep separate from the brochure</option>{programme.map(item=><option key={item.id} value={item.id}>{item.title} · {toISTInput(item.starts_at)}</option>)}</select></label>}
    {settings.result_mode !== "none" && <><Roster rows={rows} candidates={candidates} setRows={next => { setRows(next); setDraft(null); }} /><button type="button" onClick={() => { try { if (!rows.length) throw new Error("Choose entrants first."); setDraft(draftSessions(rows,capacity)); setError(""); } catch (err) { setError(String(err)); } }}>Generate draft groups</button></>}
    {draft?.map((entrants,index) => <section key={index} className={styles.card}><h4>Draft {index + 1}</h4>{entrants.map(row => <div key={row.key} className={styles.rosterRow}><span>{row.label}</span><select aria-label={`Move ${row.label} to draft`} value={index} onChange={e => { const target = Number(e.target.value); setDraft(draft.map((group,i) => i === target ? [...group,row] : i === index ? group.filter(r => r.key !== row.key) : group)); }}>{draft.map((_,i) => <option value={i} key={i}>Group {i + 1}</option>)}</select></div>)}</section>)}
    {error && <p role="alert">{error}</p>}<label className={styles.check}><input type="checkbox" name="is_final" disabled={!!draft && draft.length > 1} />This is the official final session</label><p>Drafts are private. Reorder and publish explicitly. Heat-to-final advancement is a new final draft, chosen by the organiser.</p><button className="portal-primary" disabled={!!draft?.some(group => !group.length)}>Save draft sessions</button>
  </form></details>;
}

function SessionCard({ session: s, candidates, settings, command, now }: { session: CompetitionSession; candidates: Entrant[]; settings: CompetitionSettings; command: CompetitionCommand; now: number }) {
  const [roster, setRoster] = useState<Entrant[]>(s.entrants.map(row => ({ ...identity(row), key: row.application_id ?? row.group_id!, label: row.label })));
  const [results, setResults] = useState(s.entrants);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const measured = ["time","distance","count"].includes(settings.result_mode);
  const canStart = istDate(s.starts_at) === istDate(now);
  const state = (value: string, position?: number) => void command("session_state", { session_id: s.id, version: s.version, state: value, ...(position ? { current_position: position } : {}) });
  const update = (index: number, change: Partial<typeof results[number]>) => setResults(results.map((row,i) => i === index ? { ...row,...change } : row));
  return <article className={styles.card} id={`session-${s.id}`}><div className={styles.banner}><div><span>{s.is_final ? "Official final" : label(settings.schedule_mode)} · {s.state}</span><h3>{s.title}</h3><p>{toISTInput(s.starts_at).replace("T"," ")} IST · {s.venue}</p></div><div className={styles.actions}>{s.state === "draft" && <button type="button" onClick={() => state("scheduled")}>Publish schedule</button>}{!["completed","cancelled","draft"].includes(s.state) && <button type="button" disabled={!s.actual_started_at && !canStart} onClick={() => state(s.state === "live" ? "paused" : "live")}>{s.state === "live" ? "Pause" : s.actual_started_at ? "Resume" : canStart ? "Start session" : "Locked until event day"}</button>}{s.actual_started_at && !["completed","cancelled"].includes(s.state) && <button type="button" onClick={() => state("completed")}>Complete session</button>}</div></div>
    {s.state === "draft" ? <details><summary>Edit draft order / entrants</summary><Roster rows={roster} setRows={setRoster} candidates={candidates} /><button type="button" onClick={() => void command("session_roster", { session_id: s.id, version: s.version, entrants: roster.map((r,i) => ({ ...identity(r),position:i+1 })) })}>Save draft roster</button></details> : <ol className={styles.runningOrder}>{s.entrants.map(row => <li key={row.id} aria-current={s.current_position === row.position ? "step" : undefined}>{row.label}{settings.schedule_mode === "running_order" && s.actual_started_at && s.state !== "completed" && <button type="button" onClick={() => state("live",row.position)}>{s.current_position === row.position ? "Current" : "Set current"}</button>}</li>)}</ol>}
    {s.actual_started_at && (measured || settings.result_mode === "faculty_places") && <details open={s.state !== "completed"}><summary>{measured ? "Enter measurements & confirm official places" : "Record faculty-approved final places"}</summary><form onSubmit={e => { e.preventDefault(); void command("session_results", { session_id: s.id, version: s.version, reason, results: results.map(row => ({ id:row.id, status:row.status, attempts:row.attempts, placing:row.placing, note:row.note })) }); }}>
      {measured && <p>Method: {settings.measurement_method}. Time in seconds or M:SS.xxx; distance in metres; count in whole numbers. Blank attempt = invalid/no mark. Suggested ranks never settle ties.</p>}
      {results.map((row,index) => <section key={row.id} className={styles.resultRow}><strong>{row.label}</strong><label>Status<select value={row.status} onChange={e => update(index, { status: e.target.value as typeof row.status, placing: null })}>{["valid","dns","dnf","dq"].map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>{measured && Array.from({ length: settings.attempts },(_,attempt) => <label key={attempt}>Attempt {attempt + 1}<input aria-label={`${row.label} attempt ${attempt + 1}`} inputMode="decimal" defaultValue={row.attempts[attempt] == null ? "" : String(row.attempts[attempt]! / (settings.result_mode === "count" ? 1 : 1000))} onChange={e => { try { const attempts = [...row.attempts]; attempts[attempt] = parseMeasurement(e.target.value,settings.result_mode); update(index,{ attempts: Array.from({length:attempts.length},(_,i) => attempts[i] ?? null) }); setError(""); } catch (err) { setError(String(err)); } }} /></label>)}<label>Official place<input type="number" min={1} max={results.length} disabled={row.status !== "valid"} value={row.placing ?? ""} onChange={e => update(index, { placing: e.target.value ? Number(e.target.value) : null })} /></label><label>Official note<input value={row.note} maxLength={500} onChange={e => update(index,{ note:e.target.value })} /></label></section>)}
      {measured && <div className={styles.card}><h4>Ranking suggestions</h4>{rankedMeasurements(results,settings.result_mode).map(({row,best,suggestedPlace,tied}) => <p key={row.id}>{row.label}: {measurementLabel(best,settings.result_mode)} · {suggestedPlace ?? "—"}{tied ? " · TIE — official decision required" : ""}</p>)}</div>}
      <label>Correction reason {s.state === "completed" ? "(required)" : "(optional)"}<input required={s.state === "completed"} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="portal-primary" disabled={!!error}>Save confirmed results</button>
    </form></details>}
    <details><summary>Correct schedule / cancel</summary><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void command("session_schedule", { session_id:s.id,version:s.version,title:form.get("title"),venue:form.get("venue"),starts_at:fromISTInput(String(form.get("start"))),reporting_at:fromISTInput(String(form.get("reporting"))),ends_at:fromISTInput(String(form.get("end"))),reason:form.get("reason") }); }}><div className={styles.grid}><label>Title<input name="title" defaultValue={s.title} required /></label><label>Venue<input name="venue" defaultValue={s.venue} required /></label><label>Start · IST<input name="start" type="datetime-local" defaultValue={toISTInput(s.starts_at)} required /></label><label>Reporting · IST<input name="reporting" type="datetime-local" defaultValue={toISTInput(s.reporting_at)} /></label><label>End · IST<input name="end" type="datetime-local" defaultValue={toISTInput(s.ends_at)} /></label><label>Reason<input name="reason" required maxLength={500} /></label></div><button>Save audited correction</button></form>{!["completed","cancelled"].includes(s.state) && <button type="button" onClick={() => { if (window.confirm("Cancel this session? Scores and history are retained.")) state("cancelled"); }}>Cancel session</button>}</details>
  </article>;
}

function VotingManagement({ workspace: w, command }: { workspace: CompetitionWorkspace; command: CompetitionCommand }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <section className={styles.card}><h3>Entries & public voting</h3><p>Submission deadline: {toISTInput(w.settings?.submission_closes_at ?? null).replace("T"," ")} IST. Entries freeze when the first round is scheduled. Totals stay hidden until close.</p><Link href={`/competition/${w.event.id}`}>Open entry submission & public gallery →</Link>
    {!w.rounds.length && <p>Before freezing options, ask the Main Admin to <Link href={`/admin/results?event=${w.event.id}`}>configure points for every award position</Link>. Award rules lock with voting.</p>}
    {w.entries.map(entry => <article key={entry.id} className={styles.card}><label className={styles.check}><input type="checkbox" checked={selected.includes(entry.id)} onChange={e => setSelected(e.target.checked ? [...selected,entry.id] : selected.filter(id => id !== entry.id))} />Entry {entry.entry_number} · {entry.title} · {entry.state}</label><p>{entry.description}</p><p>{entry.note}</p><Link href={`/api/media/${entry.media_id ?? "missing"}`}>Review submitted image ↗</Link><div className={styles.actions}>{["approved","rejected","disqualified"].map(state => <button key={state} type="button" disabled={w.settings?.verified || (!!w.rounds.length && state !== "disqualified") || !["submitted","approved","rejected"].includes(entry.state)} onClick={() => { const reason = state === "approved" ? "" : window.prompt("Audited reason (required)"); if (reason !== null) void command("review_entry", { entry_id:entry.id, version:entry.version,state,reason }); }}>{state === "approved" ? "Approve" : state === "rejected" ? "Reject" : "Disqualify"}</button>)}</div></article>)}
    {w.rounds.map(round => <p key={round.id}>Round {round.round_number} · {toISTInput(round.opens_at)} → {toISTInput(round.closes_at)} IST</p>)}
    <form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void command("voting_round", { opens_at:fromISTInput(String(form.get("open"))), closes_at:fromISTInput(String(form.get("close"))), entry_ids:selected }); }}><h4>{w.rounds.length ? "Schedule tied-group runoff" : "Schedule public voting"}</h4><p>{w.rounds.length ? "Select the complete tied podium group above. Database verification rejects unrelated entrants." : "All approved entries are included. Review all submissions before freezing options."}</p><div className={styles.grid}><label>Opens · IST<input name="open" required type="datetime-local" /></label><label>Closes · IST<input name="close" required type="datetime-local" /></label></div><button disabled={w.settings?.verified}>Freeze entries & schedule round</button></form>
    <button type="button" disabled={w.settings?.verified} onClick={() => void command("verify_votes",{})}>Reconcile ballots & verify ranking</button>{w.settings?.verified && <><p>Verified ranking: {w.placements.map(p => `#${p.placing}: Entry ${w.entries.find(n => n.id === p.entry_id)?.entry_number}`).join(" · ")}</p><Link className="portal-primary" href={`/admin/results?event=${w.event.id}`}>Publish verified winners & points →</Link></>}
  </section>;
}
