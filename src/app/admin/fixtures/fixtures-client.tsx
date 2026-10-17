"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type FixtureItem = {
  fixture_id: string;
  stage: string;
  participant_a_label: string;
  participant_b_label: string;
  venue: string | null;
  reporting_at: string | null;
  starts_at: string | null;
  state: string;
  schedule_version: number;
  score_version: number;
  score_status: string | null;
  score_payload: Record<string, unknown> | null;
};

type EventMeta = {
  id: string;
  title: string;
  category: string;
  format: string;
  state: string;
  score_template?: string;
};

type HistoryEntry = {
  id: string;
  actor_name: string | null;
  previous_schedule: {
    stage?: string;
    participant_a_label?: string;
    participant_b_label?: string;
    venue?: string;
    reporting_at?: string;
    starts_at?: string;
    schedule_version?: number;
  };
  reason: string;
  created_at: string;
};

function formatIST(iso: string | null) {
  if (!iso) return "To be announced";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FixturesClient({
  event,
  fixtures,
}: {
  event: EventMeta;
  fixtures: FixtureItem[];
}) {
  const router = useRouter();
  const scoreTemplate = event.score_template || "generic";

  // New fixture state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newStage, setNewStage] = useState("");
  const [newPartA, setNewPartA] = useState("");
  const [newPartB, setNewPartB] = useState("");
  const [newVenue, setNewVenue] = useState("");
  const [newReporting, setNewReporting] = useState("");
  const [newStarts, setNewStarts] = useState("");
  const [createPending, setCreatePending] = useState(false);

  // Reschedule modal state
  const [rescheduleFixture, setRescheduleFixture] = useState<FixtureItem | null>(null);
  const [rescheduleReporting, setRescheduleReporting] = useState("");
  const [rescheduleStarts, setRescheduleStarts] = useState("");
  const [rescheduleVenue, setRescheduleVenue] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [reschedulePending, setReschedulePending] = useState(false);

  // Score modal state
  const [scoreFixture, setScoreFixture] = useState<FixtureItem | null>(null);
  const [scoreStatus, setScoreStatus] = useState<"scheduled" | "live" | "paused" | "final" | "cancelled">("live");
  const [scoreForm, setScoreForm] = useState<Record<string, string>>({});
  const [scorePending, setScorePending] = useState(false);

  // History modal state
  const [historyFixture, setHistoryFixture] = useState<FixtureItem | null>(null);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Reminder modal state
  const [reminderFixture, setReminderFixture] = useState<FixtureItem | null>(null);
  const [reminderBody, setReminderBody] = useState("");
  const [reminderPending, setReminderPending] = useState(false);

  // Messages
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Open Reschedule Modal
  function openReschedule(f: FixtureItem) {
    setRescheduleFixture(f);
    setRescheduleReporting(toLocalInput(f.reporting_at));
    setRescheduleStarts(toLocalInput(f.starts_at));
    setRescheduleVenue(f.venue ?? "");
    setRescheduleReason("");
    setStatusMessage(null);
  }

  // Open Score Modal
  function openScore(f: FixtureItem) {
    setScoreFixture(f);
    const allowedStatuses = ["scheduled", "live", "paused", "final", "cancelled"] as const;
    setScoreStatus(allowedStatuses.includes(f.score_status as typeof allowedStatuses[number]) ? f.score_status as typeof allowedStatuses[number] : "live");
    // Preload existing score payload if available
    const existing = (f.score_payload || {}) as Record<string, string>;
    setScoreForm({ ...existing });
    setStatusMessage(null);
  }

  // Open History Modal
  async function openHistory(f: FixtureItem) {
    setHistoryFixture(f);
    setHistoryLoading(true);
    setHistoryList([]);
    try {
      const res = await fetch(`/api/admin/fixtures?fixtureId=${f.fixture_id}&type=history`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; data?: HistoryEntry[] };
      if (data.ok && data.data) {
        setHistoryList(data.data);
      }
    } catch {
      setStatusMessage({ text: "Failed to load fixture history.", isError: true });
    } finally {
      setHistoryLoading(false);
    }
  }

  // Submit New Fixture
  async function handleCreateFixture(e: React.FormEvent) {
    e.preventDefault();
    if (createPending) return;
    if (newPartA.trim() === newPartB.trim()) {
      setStatusMessage({ text: "Participant A and Participant B must be different.", isError: true });
      return;
    }
    setCreatePending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          eventId: event.id,
          stage: newStage.trim(),
          participantALabel: newPartA.trim(),
          participantBLabel: newPartB.trim(),
          venue: newVenue.trim() || undefined,
          reportingAt: newReporting ? new Date(newReporting).toISOString() : null,
          startsAt: newStarts ? new Date(newStarts).toISOString() : null,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: "Fixture created successfully." });
        setShowNewForm(false);
        setNewStage("");
        setNewPartA("");
        setNewPartB("");
        setNewVenue("");
        setNewReporting("");
        setNewStarts("");
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to create fixture.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error creating fixture.", isError: true });
    } finally {
      setCreatePending(false);
    }
  }

  // Submit Reschedule
  async function handleRescheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rescheduleFixture || reschedulePending) return;
    if (!rescheduleReason.trim()) {
      setStatusMessage({ text: "A reason is mandatory when rescheduling a fixture.", isError: true });
      return;
    }
    setReschedulePending(true);
    try {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          fixtureId: rescheduleFixture.fixture_id,
          reportingAt: rescheduleReporting ? new Date(rescheduleReporting).toISOString() : null,
          startsAt: rescheduleStarts ? new Date(rescheduleStarts).toISOString() : null,
          venue: rescheduleVenue.trim() || undefined,
          reason: rescheduleReason.trim(),
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Fixture rescheduled. Schedule version bumped to v${rescheduleFixture.schedule_version + 1}.` });
        setRescheduleFixture(null);
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to reschedule fixture.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error rescheduling fixture.", isError: true });
    } finally {
      setReschedulePending(false);
    }
  }

  // Submit Score
  async function handleScoreSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!scoreFixture || scorePending) return;
    setScorePending(true);
    try {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "score",
          fixtureId: scoreFixture.fixture_id,
          expectedVersion: scoreFixture.score_version,
          scorePayload: scoreForm,
          status: scoreStatus,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Score updated to v${scoreFixture.score_version + 1} (${scoreStatus}).` });
        setScoreFixture(null);
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to save score.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error saving score.", isError: true });
    } finally {
      setScorePending(false);
    }
  }

  // Submit Reminder
  async function handleReminderSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reminderFixture || reminderPending) return;
    setReminderPending(true);
    try {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reminders",
          fixtureId: reminderFixture.fixture_id,
          body: reminderBody.trim() || undefined,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; remindersGenerated?: number; error?: string };
      if (data.ok) {
        setStatusMessage({
          text: `In-app reminders issued to ${data.remindersGenerated ?? 0} selected participants for this event.`,
        });
        setReminderFixture(null);
        setReminderBody("");
      } else {
        setStatusMessage({ text: data.error ?? "Failed to send reminders.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error sending reminders.", isError: true });
    } finally {
      setReminderPending(false);
    }
  }

  return (
    <div className="fixtures-workspace">
      {/* Navigation Sub-bar */}
      <div className="review-top-bar">
        <div className="review-links">
          <Link className="workspace-sublink" href={`/admin/review?event=${event.id}`}>
            ← Review Queue
          </Link>
          {event.format !== "solo" && (
            <Link className="workspace-sublink" href={`/admin/groups?event=${event.id}`}>
              Squads & Groups →
            </Link>
          )}
          <Link className="workspace-sublink" href={`/admin/results?event=${event.id}`}>
            Results & Standings →
          </Link>
        </div>

        <button
          type="button"
          className="create-toggle-button"
          onClick={() => setShowNewForm(!showNewForm)}
        >
          {showNewForm ? "✕ Close Form" : "+ Create New Fixture"}
        </button>
      </div>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      {/* New Fixture Form Drawer */}
      {showNewForm && (
        <form className="fixture-form new-fixture-card" onSubmit={handleCreateFixture}>
          <div className="form-heading-row">
            <h3>Add New Fixture to {event.title}</h3>
            <span className="template-tag">Template: {scoreTemplate.toUpperCase()}</span>
          </div>

          <div className="form-grid-2">
            <label>
              Stage / Round (e.g. Quarter-Final, Group A)
              <input
                required
                maxLength={100}
                value={newStage}
                onChange={(e) => setNewStage(e.target.value)}
                placeholder="e.g. Quarter-final 1"
              />
            </label>
            <label>
              Venue / Field
              <input
                maxLength={160}
                value={newVenue}
                onChange={(e) => setNewVenue(e.target.value)}
                placeholder="e.g. Main Court, Ground A"
              />
            </label>
          </div>

          <div className="form-grid-2">
            <label>
              Participant A (Batch / Squad / Name)
              <input
                required
                maxLength={160}
                value={newPartA}
                onChange={(e) => setNewPartA(e.target.value)}
                placeholder="e.g. Batch 2024"
              />
            </label>
            <label>
              Participant B (Batch / Squad / Name)
              <input
                required
                maxLength={160}
                value={newPartB}
                onChange={(e) => setNewPartB(e.target.value)}
                placeholder="e.g. Batch 2025"
              />
            </label>
          </div>

          <div className="form-grid-2">
            <label>
              Reporting Time (IST)
              <input
                type="datetime-local"
                value={newReporting}
                onChange={(e) => setNewReporting(e.target.value)}
              />
            </label>
            <label>
              Start Time (IST)
              <input
                type="datetime-local"
                value={newStarts}
                onChange={(e) => setNewStarts(e.target.value)}
              />
            </label>
          </div>

          <div className="form-actions-row">
            <button type="submit" className="primary-btn" disabled={createPending}>
              {createPending ? "Creating Fixture…" : "Publish Fixture"}
            </button>
            <button
              type="button"
              className="cancel-btn"
              onClick={() => setShowNewForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Fixtures List */}
      <div className="fixtures-container">
        <div className="fixtures-header-count">
          <span>{fixtures.length} Fixture{fixtures.length === 1 ? "" : "s"} Scheduled</span>
          <span className="template-note">Score rules: {scoreTemplate}</span>
        </div>

        {fixtures.length === 0 ? (
          <div className="review-empty-state">
            <h3>No fixtures created yet</h3>
            <p>Click &quot;+ Create New Fixture&quot; above to schedule the first match or round.</p>
          </div>
        ) : (
          <div className="fixture-cards-grid">
            {fixtures.map((f) => {
              const scoreObj = (f.score_payload || {}) as Record<string, unknown>;
              return (
                <article key={f.fixture_id} className={`fixture-item-card state-${f.state}`}>
                  <div className="card-top-bar">
                    <span className="fixture-stage-tag">{f.stage}</span>
                    <div className="versions-box">
                      <span className="version-pill">Sched v{f.schedule_version}</span>
                      {f.score_version > 0 && (
                        <span className="version-pill score">Score v{f.score_version} ({f.score_status})</span>
                      )}
                    </div>
                  </div>

                  <div className="matchup-row">
                    <span className="participant-a">{f.participant_a_label}</span>
                    <span className="versus-pill">VS</span>
                    <span className="participant-b">{f.participant_b_label}</span>
                  </div>

                  {/* Score Snapshot Display if present */}
                  {f.score_payload && Object.keys(scoreObj).length > 0 && (
                    <div className="live-score-display">
                      <div className="score-header">
                        <strong>Scoreboard</strong>
                        <span className={`score-status-tag ${f.score_status}`}>{f.score_status?.toUpperCase()}</span>
                      </div>
                      <div className="score-details">
                        {scoreTemplate === "cricket" && (
                          <div className="score-cricket">
                            <p><strong>{f.participant_a_label}:</strong> {String(scoreObj.teamA_runs ?? "0")}/{String(scoreObj.teamA_wickets ?? "0")} ({String(scoreObj.teamA_overs ?? "0")} ov)</p>
                            <p><strong>{f.participant_b_label}:</strong> {String(scoreObj.teamB_runs ?? "0")}/{String(scoreObj.teamB_wickets ?? "0")} ({String(scoreObj.teamB_overs ?? "0")} ov)</p>
                            {Boolean(scoreObj.summary) && <p className="match-summary">{String(scoreObj.summary)}</p>}
                          </div>
                        )}
                        {scoreTemplate === "football" && (
                          <div className="score-football">
                            <div className="football-score-row">
                              <span>{String(scoreObj.teamA_goals ?? "0")}</span>
                              <span>—</span>
                              <span>{String(scoreObj.teamB_goals ?? "0")}</span>
                            </div>
                            {Boolean(scoreObj.penalties) && <p className="penalties-note">Penalties: {String(scoreObj.penalties)}</p>}
                          </div>
                        )}
                        {scoreTemplate === "badminton" && (
                          <div className="score-badminton">
                            <p>Sets: {String(scoreObj.set1 ?? "—")} | {String(scoreObj.set2 ?? "—")} | {String(scoreObj.set3 ?? "—")}</p>
                            {Boolean(scoreObj.winner) && <p className="winner-note">Winner: {String(scoreObj.winner)}</p>}
                          </div>
                        )}
                        {scoreTemplate === "generic" && (
                          <div className="score-generic">
                            {Boolean(scoreObj.winner) && <p><strong>Winner:</strong> {String(scoreObj.winner)}</p>}
                            {Boolean(scoreObj.summary) && <p>{String(scoreObj.summary)}</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="fixture-meta-grid">
                    <div>
                      <span className="meta-label">Venue</span>
                      <span className="meta-val">{f.venue || "To be announced"}</span>
                    </div>
                    <div>
                      <span className="meta-label">Reporting</span>
                      <span className="meta-val">{formatIST(f.reporting_at)}</span>
                    </div>
                    <div>
                      <span className="meta-label">Match Starts</span>
                      <span className="meta-val highlight">{formatIST(f.starts_at)}</span>
                    </div>
                  </div>

                  {/* Fixture Operational Actions */}
                  <div className="fixture-control-buttons">
                    <button
                      type="button"
                      className="btn-action score-btn"
                      onClick={() => openScore(f)}
                    >
                      Enter Score
                    </button>
                    <button
                      type="button"
                      className="btn-action reschedule-btn"
                      onClick={() => openReschedule(f)}
                    >
                      Reschedule…
                    </button>
                    <button
                      type="button"
                      className="btn-action history-btn"
                      onClick={() => openHistory(f)}
                    >
                      History ({f.schedule_version})
                    </button>
                    <button
                      type="button"
                      className="btn-action reminder-btn"
                      title="Send in-app notifications to participants"
                      onClick={() => {
                        setReminderFixture(f);
                        setReminderBody(`Reminder: ${f.stage} between ${f.participant_a_label} and ${f.participant_b_label} starts at ${formatIST(f.starts_at)} at ${f.venue ?? "the venue"}.`);
                      }}
                    >
                      Send Reminder
                    </button>
                    <button
                      type="button"
                      className="btn-action print-btn"
                      title="Print Ground Scorecard / Roster for Umpires"
                      onClick={() => window.print()}
                    >
                      🖨️ Print Card
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {rescheduleFixture && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reschedule-modal-title">
          <div className="modal-card wide">
            <h2 id="reschedule-modal-title">Reschedule Fixture</h2>
            <p>
              Match: <strong>{rescheduleFixture.participant_a_label}</strong> vs{" "}
              <strong>{rescheduleFixture.participant_b_label}</strong> ({rescheduleFixture.stage})
            </p>
            <p className="reschedule-audit-notice">
              ⚠️ Changing fixture timings increments the schedule version to{" "}
              <strong>v{rescheduleFixture.schedule_version + 1}</strong> and saves the previous schedule in the audit history.
            </p>

            <form onSubmit={handleRescheduleSubmit}>
              <div className="form-grid-2">
                <label className="modal-label">
                  New Reporting Time (IST)
                  <input
                    type="datetime-local"
                    value={rescheduleReporting}
                    onChange={(e) => setRescheduleReporting(e.target.value)}
                  />
                </label>
                <label className="modal-label">
                  New Start Time (IST)
                  <input
                    type="datetime-local"
                    value={rescheduleStarts}
                    onChange={(e) => setRescheduleStarts(e.target.value)}
                  />
                </label>
              </div>

              <label className="modal-label">
                Venue
                <input
                  value={rescheduleVenue}
                  maxLength={160}
                  onChange={(e) => setRescheduleVenue(e.target.value)}
                  placeholder="e.g. Ground B (Shifted due to weather)"
                />
              </label>

              <label className="modal-label mandatory">
                Reason for Reschedule (Mandatory)
                <textarea
                  required
                  rows={3}
                  maxLength={500}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="State why this fixture was rescheduled (e.g. Rain delay, team request approved by committee)"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn cancel"
                  disabled={reschedulePending}
                  onClick={() => setRescheduleFixture(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn confirm-reject"
                  style={{ background: "#261923" }}
                  disabled={reschedulePending || !rescheduleReason.trim()}
                >
                  {reschedulePending ? "Updating Schedule…" : "Confirm Reschedule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Score Entry Modal */}
      {scoreFixture && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="score-modal-title">
          <div className="modal-card wide">
            <h2 id="score-modal-title">
              Score Entry: {scoreFixture.participant_a_label} vs {scoreFixture.participant_b_label}
            </h2>
            <p>
              Template: <strong>{scoreTemplate.toUpperCase()}</strong> · Current Version:{" "}
              <strong>v{scoreFixture.score_version}</strong>
            </p>

            <form onSubmit={handleScoreSubmit}>
              <label className="modal-label">
                Match Status
                <select
                  value={scoreStatus}
                  onChange={(e) => setScoreStatus(e.target.value as "scheduled" | "live" | "paused" | "final" | "cancelled")}
                  className="score-select"
                >
                  <option value="live">Live (Ongoing)</option>
                  <option value="paused">Paused</option>
                  <option value="final">Final (Official Result)</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>

              {/* CRICKET TEMPLATE */}
              {scoreTemplate === "cricket" && (
                <div className="template-fields">
                  <div className="team-score-block">
                    <h4>{scoreFixture.participant_a_label}</h4>
                    <div className="form-grid-3">
                      <label>Runs<input type="number" min={0} value={scoreForm.teamA_runs ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamA_runs: e.target.value })} /></label>
                      <label>Wickets<input type="number" min={0} max={10} value={scoreForm.teamA_wickets ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamA_wickets: e.target.value })} /></label>
                      <label>Overs<input type="text" value={scoreForm.teamA_overs ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamA_overs: e.target.value })} placeholder="e.g. 19.4" /></label>
                    </div>
                  </div>

                  <div className="team-score-block">
                    <h4>{scoreFixture.participant_b_label}</h4>
                    <div className="form-grid-3">
                      <label>Runs<input type="number" min={0} value={scoreForm.teamB_runs ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamB_runs: e.target.value })} /></label>
                      <label>Wickets<input type="number" min={0} max={10} value={scoreForm.teamB_wickets ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamB_wickets: e.target.value })} /></label>
                      <label>Overs<input type="text" value={scoreForm.teamB_overs ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamB_overs: e.target.value })} placeholder="e.g. 20.0" /></label>
                    </div>
                  </div>

                  <label className="modal-label">
                    Match Summary / Outcome
                    <input
                      value={scoreForm.summary ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, summary: e.target.value })}
                      placeholder="e.g. Team A won by 14 runs"
                    />
                  </label>
                </div>
              )}

              {/* FOOTBALL TEMPLATE */}
              {scoreTemplate === "football" && (
                <div className="template-fields">
                  <div className="form-grid-2">
                    <label className="modal-label">
                      {scoreFixture.participant_a_label} Goals
                      <input
                        type="number"
                        min={0}
                        value={scoreForm.teamA_goals ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, teamA_goals: e.target.value })}
                      />
                    </label>
                    <label className="modal-label">
                      {scoreFixture.participant_b_label} Goals
                      <input
                        type="number"
                        min={0}
                        value={scoreForm.teamB_goals ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, teamB_goals: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="modal-label">
                    Penalties / Extra time notes (if any)
                    <input
                      value={scoreForm.penalties ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, penalties: e.target.value })}
                      placeholder="e.g. 4 - 3 on penalties"
                    />
                  </label>
                </div>
              )}

              {/* BADMINTON TEMPLATE */}
              {scoreTemplate === "badminton" && (
                <div className="template-fields">
                  <div className="form-grid-3">
                    <label className="modal-label">
                      Set 1 (e.g. 21-18)
                      <input
                        value={scoreForm.set1 ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, set1: e.target.value })}
                        placeholder="21-19"
                      />
                    </label>
                    <label className="modal-label">
                      Set 2 (e.g. 19-21)
                      <input
                        value={scoreForm.set2 ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, set2: e.target.value })}
                        placeholder="19-21"
                      />
                    </label>
                    <label className="modal-label">
                      Set 3 (if played)
                      <input
                        value={scoreForm.set3 ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, set3: e.target.value })}
                        placeholder="21-15"
                      />
                    </label>
                  </div>
                  <label className="modal-label">
                    Winner
                    <select
                      value={scoreForm.winner ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, winner: e.target.value })}
                      className="score-select"
                    >
                      <option value="">Deciding / In progress</option>
                      <option value={scoreFixture.participant_a_label}>{scoreFixture.participant_a_label}</option>
                      <option value={scoreFixture.participant_b_label}>{scoreFixture.participant_b_label}</option>
                    </select>
                  </label>
                </div>
              )}

              {/* GENERIC TEMPLATE */}
              {scoreTemplate === "generic" && (
                <div className="template-fields">
                  <label className="modal-label">
                    Result / Winner
                    <input
                      value={scoreForm.winner ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, winner: e.target.value })}
                      placeholder="e.g. Participant A won, or Draw"
                    />
                  </label>
                  <label className="modal-label">
                    Summary / Points Note
                    <textarea
                      rows={2}
                      value={scoreForm.summary ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, summary: e.target.value })}
                      placeholder="e.g. Advanced to Semi-Finals on points tally 45-38"
                    />
                  </label>
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn cancel"
                  disabled={scorePending}
                  onClick={() => setScoreFixture(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn confirm-reject"
                  style={{ background: "#261923" }}
                  disabled={scorePending}
                >
                  {scorePending ? "Saving Score…" : "Publish Score Snapshot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyFixture && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="history-modal-title">
          <div className="modal-card wide">
            <h2 id="history-modal-title">Schedule Audit History</h2>
            <p>
              Fixture: <strong>{historyFixture.participant_a_label}</strong> vs{" "}
              <strong>{historyFixture.participant_b_label}</strong> ({historyFixture.stage})
            </p>

            {historyLoading ? (
              <p>Loading history records…</p>
            ) : historyList.length === 0 ? (
              <p className="no-history-text">No prior reschedule events logged for this fixture. Original version v1.</p>
            ) : (
              <div className="history-timeline">
                {historyList.map((entry) => (
                  <div key={entry.id} className="history-entry">
                    <div className="history-entry-header">
                      <span className="history-actor">By: {entry.actor_name || "Organiser"}</span>
                      <span className="history-time">{formatIST(entry.created_at)}</span>
                    </div>
                    <p className="history-reason">
                      <strong>Reason:</strong> {entry.reason}
                    </p>
                    <div className="previous-schedule-box">
                      <span>Prior Venue: {entry.previous_schedule.venue || "None"}</span>
                      <span>Prior Starts: {formatIST(entry.previous_schedule.starts_at ?? null)}</span>
                      <span>Version: v{entry.previous_schedule.schedule_version}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                onClick={() => setHistoryFixture(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reminder Modal */}
      {reminderFixture && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="reminder-modal-title">
          <div className="modal-card">
            <h2 id="reminder-modal-title">Send In-App Fixture Reminder</h2>
            <p>
              This will create an in-app reminder in My Fest for all <strong>selected participants</strong> in this event.
            </p>
            <form onSubmit={handleReminderSubmit}>
              <label className="modal-label">
                Reminder Message
                <textarea
                  rows={3}
                  maxLength={500}
                  value={reminderBody}
                  onChange={(e) => setReminderBody(e.target.value)}
                  required
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn cancel"
                  disabled={reminderPending}
                  onClick={() => setReminderFixture(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn confirm-reject"
                  style={{ background: "#261923" }}
                  disabled={reminderPending || !reminderBody.trim()}
                >
                  {reminderPending ? "Sending Reminders…" : "Send to Participants"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
