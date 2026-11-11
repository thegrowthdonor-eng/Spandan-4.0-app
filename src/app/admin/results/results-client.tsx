"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUploadWidget } from "@/components/admin/image-upload-widget";
import { finalValueLabel, finalValueSchema, type OperatingMethod, type ValueUnit } from "@/lib/event-operations";
import { batchName } from "@/lib/results";

export type PointRule = { placing: number; points: number };
export type ResultPublication = {
  publication_id: string; version: number; state: string; reason: string | null; published_by_name: string | null; published_at: string;
  podium_photo_url?: string | null; podium_caption?: string | null;
  positions: Array<{ placing: number; batch_id: string | null; batch_label: string; winner_name?: string | null; participant_category?: string | null; application_id?: string | null; group_id?: string | null; points: number; note: string | null; final_value?: string | number | null; value_unit?: string | null }>;
};
export type ResultParticipant = { target_id: string; target_kind: "application" | "group"; label: string; category: string; batch_id: string | null; roll_canonical: string | null; batch_label: string | null };
type Position = { placing: number; targetKey: string; note: string; finalValue: string };
type EventMeta = { id: string; title: string; category: string; format: string; operating_method: OperatingMethod; result_unit: ValueUnit | null };

function participantLabel(participant: ResultParticipant) {
  return [participant.label, participant.target_kind === "application" && participant.roll_canonical ? `Roll ${participant.roll_canonical}` : "", participant.batch_label ? batchName(participant.batch_label) : ""].filter(Boolean).join(" · ");
}

export function ResultsClient({ event, pointRules, results, participants = [], isMainAdmin, confirmedPositions = [], competitionPointsLocked = false, votingVerified = true }: {
  event: EventMeta; pointRules: PointRule[]; results: ResultPublication[]; participants?: ResultParticipant[]; isMainAdmin: boolean;
  confirmedPositions?: Array<{ placing: number; targetKey: string; note: string }>; competitionPointsLocked?: boolean; votingVerified?: boolean;
}) {
  const router = useRouter();
  const current = results.find(result => result.state === "published");
  const voting = event.operating_method === "voting";
  const [rules, setRules] = useState<PointRule[]>(pointRules.length ? pointRules : [{ placing: 1, points: 10 }, { placing: 2, points: 7 }, { placing: 3, points: 5 }]);
  const [positions, setPositions] = useState<Position[]>(() => {
    if (current) return current.positions.map(p => ({ placing: p.placing, targetKey: p.application_id ? `application:${p.application_id}` : p.group_id ? `group:${p.group_id}` : `batch:${p.batch_id}`, note: p.note ?? "", finalValue: p.final_value == null ? "" : String(p.final_value) }));
    if (voting) return confirmedPositions.map(p => ({ ...p, finalValue: "" }));
    return (pointRules.length ? pointRules : [{ placing: 1, points: 0 }, { placing: 2, points: 0 }, { placing: 3, points: 0 }]).slice(0, participants.length || 3).map(rule => ({ placing: rule.placing, targetKey: "", note: "", finalValue: "" }));
  });
  const [photo, setPhoto] = useState(current?.podium_photo_url ?? "");
  const [caption, setCaption] = useState(current?.podium_caption ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [review, setReview] = useState(false);
  const locked = results.length > 0 || competitionPointsLocked;
  const valueName = event.result_unit === "seconds" || event.result_unit === "minutes" ? "Final time" : event.result_unit === "metres" ? "Final distance" : event.result_unit === "count" ? "Final count" : "Final marks";
  const update = (index: number, patch: Partial<Position>) => { setPositions(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row)); setReview(false); };
  const winnerName = (position: Position) => participants.find(p => `${p.target_kind}:${p.target_id}` === position.targetKey)?.label ?? current?.positions.find(p => p.placing === position.placing)?.winner_name ?? position.targetKey;
  async function saveRules() {
    if (busy || locked) return; setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setPointRules", eventId: event.id, rules }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessage({ text: "Award points saved." }); router.refresh();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Unable to save award points.", error: true }); }
    finally { setBusy(false); }
  }
  function validate() {
    if (voting && !votingVerified) return "Voting must close and its ranking must be verified first.";
    if (!positions.length) return "Add the award positions first.";
    if (current && !reason.trim()) return "Enter a reason for this correction.";
    const seen = new Set<string>();
    for (const row of positions) {
      if (!row.targetKey) return `Choose the winner for position ${row.placing}.`;
      if (seen.has(row.targetKey)) return "Each position needs a different participant or team."; seen.add(row.targetKey);
      if (!pointRules.some(rule => rule.placing === row.placing)) return `Ask the Main Admin to save award points for position ${row.placing}.`;
      if (row.finalValue && (!finalValueSchema.safeParse(row.finalValue).success || (event.result_unit === "count" && !Number.isInteger(Number(row.finalValue))))) return "Check the final values. Counts must be whole numbers.";
    }
    return null;
  }
  async function publish() {
    if (busy) return; const error = validate(); if (error) { setMessage({ text: error, error: true }); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "publish", eventId: event.id, expectedVersion: Math.max(0, ...results.map(r => r.version)), reason: reason.trim() || undefined, podiumPhotoUrl: photo || undefined, podiumCaption: caption.trim() || undefined, positions: positions.map(row => { const [kind, id] = row.targetKey.split(":"); return { placing: row.placing, applicationId: kind === "application" ? id : undefined, groupId: kind === "group" ? id : undefined, batchId: kind === "batch" ? id : undefined, note: row.note.trim() || undefined, finalValue: voting || !event.result_unit ? null : row.finalValue.trim() || null }; }) }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Unable to publish results.");
      setReview(false); setReason(""); setMessage({ text: "Official results published. Batch standings have been updated." }); router.refresh();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Connection unavailable. Review the latest result before retrying.", error: true }); }
    finally { setBusy(false); }
  }
  return <div className="results-workspace">
    {message && <p role={message.error ? "alert" : "status"} className={`status-banner ${message.error ? "error" : "success"}`}>{message.text}</p>}
    <section className="results-panel publish-panel">
      <div className="panel-header"><h2>{current ? `Official results · v${current.version}` : voting ? "Publish vote-ranked winners" : "Enter official award positions"}</h2><span className="panel-subtitle">{voting ? "Winners are determined by verified public votes" : "Choose winners, add optional final values, then review"}</span></div>
      {voting && !votingVerified && <p className="roster-empty">Voting results are not verified yet. <Link href={`/admin/fixtures?event=${event.id}`}>Open entries & voting →</Link></p>}
      <form className="publish-form" onSubmit={e => { e.preventDefault(); const error = validate(); setMessage(error ? { text: error, error: true } : null); if (!error) setReview(true); }}>
        <fieldset disabled={busy || review} className="result-fields">
          {!participants.length && !current && <p className="roster-empty">No eligible winners are available yet. <Link href={event.format === "solo" ? `/admin/selection?event=${event.id}` : `/admin/groups?event=${event.id}`}>Review participants / published rosters →</Link></p>}
          <div className="positions-list">{positions.map((row, index) => <section key={row.placing} className="position-card">
            <div className="position-place-col"><strong className="medal-icon">{row.placing === 1 ? "1st" : row.placing === 2 ? "2nd" : row.placing === 3 ? "3rd" : `#${row.placing}`}</strong><span className="award-points">{pointRules.find(rule => rule.placing === row.placing)?.points ?? "—"} batch pts</span></div>
            <div className="position-inputs"><label>Participant / team<select aria-label={`Participant / team for position ${row.placing}`} required value={row.targetKey} disabled={voting} onChange={e => update(index, { targetKey: e.target.value })}><option value="">Choose the winner</option>{participants.map(p => <option key={p.target_id} value={`${p.target_kind}:${p.target_id}`} disabled={positions.some((other, i) => i !== index && other.targetKey === `${p.target_kind}:${p.target_id}`)}>{participantLabel(p)}</option>)}{current?.positions.filter(p => p.placing === row.placing && (!p.application_id && !p.group_id)).map(p => <option key={p.placing} value={`batch:${p.batch_id}`}>Historical result · Batch {p.batch_label}</option>)}</select></label>
              {!voting && event.result_unit && <label>{valueName} · {event.result_unit} (optional)<input inputMode={event.result_unit === "count" ? "numeric" : "decimal"} maxLength={16} value={row.finalValue} onChange={e => update(index, { finalValue: e.target.value })} placeholder="Enter the official final value" /></label>}
              <label>Coordinator note (optional)<input maxLength={500} value={row.note} onChange={e => update(index, { note: e.target.value })} /></label></div>
            {!voting && positions.length > 1 && <button type="button" className="remove-btn" aria-label={`Remove position ${row.placing}`} onClick={() => setPositions(positions.filter((_, i) => i !== index).map((p, i) => ({ ...p, placing: i + 1 })))}>×</button>}
          </section>)}</div>
          {!voting && positions.length < pointRules.length && <button type="button" className="secondary-btn" onClick={() => { const next = pointRules.find(rule => !positions.some(row => row.placing === rule.placing)); if (next) setPositions([...positions, { placing: next.placing, targetKey: "", note: "", finalValue: "" }]); }}>Add award position</button>}
          <details className="result-secondary"><summary>Podium photo & caption (optional)</summary><ImageUploadWidget eventId={event.id} folder="podiums" onUploadSuccess={setPhoto} label="Upload podium photo" />{photo && <p><a href={photo} target="_blank" rel="noopener noreferrer">View attached photo ↗</a> <button type="button" onClick={() => setPhoto("")}>Remove photo</button></p>}<label>Caption<input maxLength={500} value={caption} onChange={e => { setCaption(e.target.value); setReview(false); }} /></label></details>
          {current && <label className="correction-reason">Reason for correction (required)<textarea required maxLength={500} rows={2} value={reason} onChange={e => { setReason(e.target.value); setReview(false); }} /></label>}
          <div className="publish-actions"><button className="primary-btn" type="submit" disabled={busy || (voting && !votingVerified)}>Review results →</button></div>
        </fieldset>
        {review && <section className="result-review" aria-label="Review result publication"><h3>Check before publishing</h3>{positions.map(row => <p key={row.placing}><strong>#{row.placing} · {winnerName(row)}</strong>{row.finalValue && ` · ${finalValueLabel(row.finalValue, event.result_unit)}`}<small> · {pointRules.find(rule => rule.placing === row.placing)?.points ?? 0} batch points</small></p>)}<p>{current ? "This creates a correction version and retains the previous result." : "These award positions will be visible publicly and update batch standings."}</p><div className="publish-actions"><button type="button" className="primary-btn" disabled={busy} onClick={() => void publish()}>{busy ? "Publishing…" : "Confirm & publish"}</button><button type="button" className="secondary-btn" disabled={busy} onClick={() => setReview(false)}>Back to edit</button></div></section>}
      </form>
    </section>
    <details className="results-panel result-secondary" open={!pointRules.length && isMainAdmin}><summary>Award points {locked ? "· locked" : !isMainAdmin ? "· Main Admin manages these" : "· Main Admin settings"}</summary><p>Batch leaderboard points are separate from an event’s final time, distance or marks. Points lock after voting is scheduled or results are published.</p><form onSubmit={e => { e.preventDefault(); void saveRules(); }}><div className="point-rules-list">{rules.map((rule, index) => <div className="rule-row" key={rule.placing}><span className="placing-badge">#{rule.placing}</span><label className="points-input-label">Batch points<input type="number" min={0} value={rule.points} disabled={busy || locked || !isMainAdmin} onChange={e => setRules(rules.map((r, i) => i === index ? { ...r, points: Number(e.target.value) } : r))} /></label>{isMainAdmin && !locked && rules.length > 1 && <button className="remove-btn" type="button" aria-label={`Remove award rule ${rule.placing}`} onClick={() => setRules(rules.filter((_, i) => i !== index).map((r, i) => ({ ...r, placing: i + 1 })))}>×</button>}</div>)}</div>{isMainAdmin && !locked && <div className="rules-actions"><button className="secondary-btn" type="button" disabled={busy} onClick={() => setRules([...rules, { placing: rules.length + 1, points: 0 }])}>Add award position</button><button className="primary-btn" disabled={busy}>Save award points</button></div>}</form></details>
    {results.length > 0 && <details className="results-panel result-secondary"><summary>Publication history · {results.length} versions</summary>{results.map(pub => <article className="pub-card" key={pub.publication_id}><h3>Version {pub.version} · {pub.state}</h3><p>{pub.published_by_name ?? "Organiser"} · {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(pub.published_at))}</p>{pub.reason && <p>{pub.reason}</p>}{pub.positions.map(p => <p key={p.placing}>#{p.placing} · {p.winner_name ?? p.batch_label}{p.final_value != null ? ` · ${finalValueLabel(p.final_value, p.value_unit)}` : ""} · {p.points} batch pts{p.note ? ` · ${p.note}` : ""}</p>)}</article>)}</details>}
  </div>;
}
