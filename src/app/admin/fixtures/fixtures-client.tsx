"use client";

import { PortalDialog } from "@/components/admin/portal-dialog";
import { useState, useMemo } from "react";
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
  venue?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

type BatchItem = {
  batch_id: string;
  label: string;
  course_label?: string | null;
};

type GroupItem = {
  group_id: string;
  name: string;
  batch_id: string;
  state: string;
};

export type SoloStudentItem = {
  application_id: string;
  student_id: string;
  full_name: string;
  batch_label: string;
  course_label?: string | null;
  roll_canonical: string;
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

const COMMON_STAGES = [
  "Quarter-Final 1",
  "Quarter-Final 2",
  "Quarter-Final 3",
  "Quarter-Final 4",
  "Semi-Final 1",
  "Semi-Final 2",
  "3rd Place Playoff",
  "Final",
  "Custom…",
];

export function formatTeamLabel(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) return `Batch ${trimmed}`;
  return trimmed;
}

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
  eligibleBatches = [],
  registeredGroups = [],
  soloStudents = [],
  isMainAdmin,
}: {
  event: EventMeta;
  fixtures: FixtureItem[];
  eligibleBatches?: BatchItem[];
  registeredGroups?: GroupItem[];
  soloStudents?: SoloStudentItem[];
  isMainAdmin: boolean;
}) {
  const router = useRouter();
  const scoreTemplate = event.score_template || "generic";

  // Create Form visibility
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Selected Fixture for Inspection Modal
  const [selectedFixture, setSelectedFixture] = useState<FixtureItem | null>(null);

  // Single Match Form State
  const [stageSelection, setStageSelection] = useState("Quarter-Final 1");
  const [customStage, setCustomStage] = useState("");
  const [venueInput, setVenueInput] = useState(event.venue || "");
  const [startsInput, setStartsInput] = useState(() => {
    const d = event.starts_at ? new Date(event.starts_at) : new Date();
    d.setHours(9, 0, 0, 0);
    return toLocalInput(d.toISOString());
  });
  const [reportingInput, setReportingInput] = useState(() => {
    const d = event.starts_at ? new Date(event.starts_at) : new Date();
    d.setHours(8, 45, 0, 0);
    return toLocalInput(d.toISOString());
  });

  // Participant A & B Selection Modes
  type PartMode = "person" | "pair" | "batch" | "custom";
  const defaultMode: PartMode =
    event.format === "solo"
      ? "person"
      : event.format === "pair"
        ? "pair"
        : "batch";

  const [modeA, setModeA] = useState<PartMode>(defaultMode);
  const [modeB, setModeB] = useState<PartMode>(defaultMode);

  const [chosenPartA, setChosenPartA] = useState("");
  const [chosenPartB, setChosenPartB] = useState("");
  const [customPartA, setCustomPartA] = useState("");
  const [customPartB, setCustomPartB] = useState("");

  const [soloSearchA, setSoloSearchA] = useState("");
  const [soloSearchB, setSoloSearchB] = useState("");

  const [createPending, setCreatePending] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "scheduled" | "live" | "final">("all");
  const [stageFilter, setStageFilter] = useState("all");

  // Operational Modals
  const [rescheduleFixture, setRescheduleFixture] = useState<FixtureItem | null>(null);
  const [rescheduleReporting, setRescheduleReporting] = useState("");
  const [rescheduleStarts, setRescheduleStarts] = useState("");
  const [rescheduleVenue, setRescheduleVenue] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [reschedulePending, setReschedulePending] = useState(false);

  const [scoreFixture, setScoreFixture] = useState<FixtureItem | null>(null);
  const [scoreStatus, setScoreStatus] = useState<"scheduled" | "live" | "paused" | "final" | "cancelled">("live");
  const [scoreForm, setScoreForm] = useState<Record<string, string>>({});
  const [scorePending, setScorePending] = useState(false);

  const [deleteFixtureTarget, setDeleteFixtureTarget] = useState<FixtureItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const [historyFixture, setHistoryFixture] = useState<FixtureItem | null>(null);
  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [reminderFixture, setReminderFixture] = useState<FixtureItem | null>(null);
  const [reminderBody, setReminderBody] = useState("");
  const [reminderPending, setReminderPending] = useState(false);

  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // Batches list with "Batch" prefix
  const batchOptions = useMemo(() => {
    if (eligibleBatches.length > 0) {
      return eligibleBatches.map((b) => (b.label.toLowerCase().includes("batch") ? b.label : `Batch ${b.label}`));
    }
    return ["Batch 2021", "Batch 2022", "Batch 2023", "Batch 2024", "Batch 2025", "Faculty / Staff", "Interns"];
  }, [eligibleBatches]);

  // Pairs / Teams list
  const groupOptions = useMemo(() => {
    return registeredGroups.map((g) => g.name);
  }, [registeredGroups]);

  // Filtered solo students
  const filteredSoloA = useMemo(() => {
    const q = soloSearchA.toLowerCase().trim();
    return soloStudents.filter(
      (s) =>
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.roll_canonical.toLowerCase().includes(q) ||
        s.batch_label.toLowerCase().includes(q)
    );
  }, [soloStudents, soloSearchA]);

  const filteredSoloB = useMemo(() => {
    const q = soloSearchB.toLowerCase().trim();
    return soloStudents.filter(
      (s) =>
        !q ||
        s.full_name.toLowerCase().includes(q) ||
        s.roll_canonical.toLowerCase().includes(q) ||
        s.batch_label.toLowerCase().includes(q)
    );
  }, [soloStudents, soloSearchB]);

  // Status counters
  const counts = useMemo(() => {
    let scheduled = 0;
    let live = 0;
    let finalCount = 0;
    fixtures.forEach((f) => {
      if (f.state === "ongoing" || f.score_status === "live") live++;
      else if (f.state === "completed" || f.score_status === "final") finalCount++;
      else scheduled++;
    });
    return { all: fixtures.length, scheduled, live, final: finalCount };
  }, [fixtures]);

  // Derived filtered fixtures
  const filteredFixtures = useMemo(() => {
    return fixtures.filter((f) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        formatTeamLabel(f.participant_a_label).toLowerCase().includes(q) ||
        formatTeamLabel(f.participant_b_label).toLowerCase().includes(q) ||
        f.stage.toLowerCase().includes(q) ||
        (f.venue && f.venue.toLowerCase().includes(q));

      const matchStatus =
        statusFilter === "all" ||
        (statusFilter === "scheduled" && (f.state === "scheduled" || f.state === "draft")) ||
        (statusFilter === "live" && (f.state === "ongoing" || f.score_status === "live")) ||
        (statusFilter === "final" && (f.state === "completed" || f.score_status === "final"));

      const matchStage =
        stageFilter === "all" ||
        f.stage.toLowerCase().includes(stageFilter.toLowerCase());

      return matchSearch && matchStatus && matchStage;
    });
  }, [fixtures, searchQuery, statusFilter, stageFilter]);

  // Auto set Reporting -15 mins
  function handleStartTimeChange(value: string) {
    setStartsInput(value);
    if (value) {
      const startD = new Date(value);
      const repD = new Date(startD.getTime() - 15 * 60000);
      setReportingInput(toLocalInput(repD.toISOString()));
    }
  }

  // Create Fixture Submission
  async function handleCreateFixture(e: React.FormEvent) {
    e.preventDefault();
    if (createPending) return;

    const finalStage = stageSelection === "Custom…" ? customStage.trim() : stageSelection;
    const finalPartA = modeA === "custom" ? customPartA.trim() : chosenPartA.trim();
    const finalPartB = modeB === "custom" ? customPartB.trim() : chosenPartB.trim();

    if (!finalStage) {
      setStatusMessage({ text: "Please enter or select a round/stage.", isError: true });
      return;
    }
    if (!finalPartA || !finalPartB) {
      setStatusMessage({ text: "Please select or enter both Participant A and Participant B.", isError: true });
      return;
    }
    if (finalPartA.toLowerCase() === finalPartB.toLowerCase()) {
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
          stage: finalStage,
          participantALabel: formatTeamLabel(finalPartA),
          participantBLabel: formatTeamLabel(finalPartB),
          venue: venueInput.trim() || undefined,
          reportingAt: reportingInput ? new Date(reportingInput).toISOString() : null,
          startsAt: startsInput ? new Date(startsInput).toISOString() : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Fixture "${formatTeamLabel(finalPartA)} vs ${formatTeamLabel(finalPartB)}" created successfully.` });
        setShowCreateForm(false);
        setChosenPartA("");
        setChosenPartB("");
        setCustomPartA("");
        setCustomPartB("");
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

  // Strict Match Time Check for Scoring
  function isScoringEnabled(f: FixtureItem): boolean {
    if (f.state === "completed" || f.score_status === "final") return true;
    if (f.state === "ongoing" || f.score_status === "live") return true;
    if (event.state === "ongoing") return true;
    if (f.starts_at && new Date() >= new Date(f.starts_at)) return true;
    return false;
  }

  // Delete Fixture
  async function handleDeleteConfirm() {
    if (!deleteFixtureTarget || deletePending) return;
    setDeletePending(true);
    try {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          fixtureId: deleteFixtureTarget.fixture_id,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: "Fixture deleted successfully." });
        if (selectedFixture?.fixture_id === deleteFixtureTarget.fixture_id) {
          setSelectedFixture(null);
        }
        setDeleteFixtureTarget(null);
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to delete fixture.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error deleting fixture.", isError: true });
    } finally {
      setDeletePending(false);
    }
  }

  // Reschedule
  function openReschedule(f: FixtureItem) {
    setRescheduleFixture(f);
    setRescheduleReporting(toLocalInput(f.reporting_at));
    setRescheduleStarts(toLocalInput(f.starts_at));
    setRescheduleVenue(f.venue ?? "");
    setRescheduleReason("");
    setStatusMessage(null);
  }

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
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({
          text: `Fixture rescheduled. Schedule version bumped to v${rescheduleFixture.schedule_version + 1}.`,
        });
        if (selectedFixture?.fixture_id === rescheduleFixture.fixture_id) {
          setSelectedFixture({
            ...selectedFixture,
            starts_at: rescheduleStarts ? new Date(rescheduleStarts).toISOString() : null,
            reporting_at: rescheduleReporting ? new Date(rescheduleReporting).toISOString() : null,
            venue: rescheduleVenue.trim() || null,
            schedule_version: rescheduleFixture.schedule_version + 1,
          });
        }
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

  // Score
  function openScoreModal(f: FixtureItem) {
    setScoreFixture(f);
    setScoreStatus((f.score_status as any) || "live");
    const payload = (f.score_payload || {}) as Record<string, string>;
    setScoreForm({ ...payload });
    setStatusMessage(null);
  }

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
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Score updated to v${scoreFixture.score_version + 1} (${scoreStatus}).` });
        if (selectedFixture?.fixture_id === scoreFixture.fixture_id) {
          setSelectedFixture({
            ...selectedFixture,
            score_version: scoreFixture.score_version + 1,
            score_status: scoreStatus,
            score_payload: scoreForm,
            state: scoreStatus === "final" ? "completed" : "ongoing",
          });
        }
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

  // Reminders
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
      });
      const data = (await res.json()) as { ok?: boolean; remindersGenerated?: number; error?: string };
      if (data.ok) {
        setStatusMessage({
          text: `In-app reminders issued to ${data.remindersGenerated ?? 0} participants for this match.`,
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

  // History
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

  async function forceReleaseScorer(fixtureId: string) {
    if (!window.confirm("Release current scoring device? Unsynced local score will not be published.")) return;
    try {
      const res = await fetch("/api/admin/fixtures/release-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, deviceId: crypto.randomUUID(), force: true }),
      });
      const body = (await res.json()) as { error?: string };
      setStatusMessage(
        res.ok
          ? { text: "Scoring device released. Replacement can now prepare this fixture." }
          : { text: body.error ?? "Unable to release scorer.", isError: true }
      );
    } catch {
      setStatusMessage({ text: "Network error releasing scorer.", isError: true });
    }
  }

  return (
    <div className="fixtures-workspace">
      {/* KPI & Quick Operational Bar */}
      <div className="fixtures-kpi-bar">
        <div className="kpi-event-pill">
          <span className="kpi-icon">
            {event.category === "sport" ? "🏆" : event.category === "cultural" ? "🎭" : "⚡"}
          </span>
          <div className="kpi-event-info">
            <strong>{event.title}</strong>
            <span>{scoreTemplate.toUpperCase()} · {event.format.toUpperCase()}</span>
          </div>
        </div>

        <div className="kpi-actions">
          <button
            type="button"
            className={`kpi-btn ${showCreateForm ? "active" : ""}`}
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? "✕ Close Form" : "+ Create Match"}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      {/* Manual Match Creator Drawer */}
      {showCreateForm && (
        <section className="fixture-form-drawer">
          <div className="drawer-header">
            <div>
              <h3>Create New Match Fixture</h3>
              <p>Choose the round, pick participants, set the venue and schedule.</p>
            </div>
            <button type="button" className="drawer-close" onClick={() => setShowCreateForm(false)}>
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateFixture} className="quick-fixture-form">
            {/* Stage Selector Grid (Full readable buttons, no cutoffs) */}
            <div className="chip-section">
              <label className="section-label">1. Match Stage / Round</label>
              <div className="stage-chips-grid">
                {COMMON_STAGES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`stage-chip ${stageSelection === s ? "selected" : ""}`}
                    onClick={() => {
                      setStageSelection(s);
                      setCustomStage("");
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {stageSelection === "Custom…" && (
                <input
                  className="custom-text-input"
                  placeholder="e.g. Round of 16 — Pool A"
                  maxLength={100}
                  required
                  value={customStage}
                  onChange={(e) => setCustomStage(e.target.value)}
                />
              )}
            </div>

            {/* Team A vs Team B Adaptive Selector */}
            <div className="versus-grid">
              {/* Participant A */}
              <div className="team-picker-card">
                <div className="team-picker-header">
                  <span className="team-badge a">A</span>
                  <h4>Participant A (Home / 1st)</h4>
                </div>

                {/* Source Mode Tabs */}
                <div className="part-mode-tabs">
                  {soloStudents.length > 0 && (
                    <button
                      type="button"
                      className={`mode-tab ${modeA === "person" ? "active" : ""}`}
                      onClick={() => setModeA("person")}
                    >
                      Person / Solo ({soloStudents.length})
                    </button>
                  )}
                  {groupOptions.length > 0 && (
                    <button
                      type="button"
                      className={`mode-tab ${modeA === "pair" ? "active" : ""}`}
                      onClick={() => setModeA("pair")}
                    >
                      Pair / Team ({groupOptions.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className={`mode-tab ${modeA === "batch" ? "active" : ""}`}
                    onClick={() => setModeA("batch")}
                  >
                    Batch ({batchOptions.length})
                  </button>
                  <button
                    type="button"
                    className={`mode-tab ${modeA === "custom" ? "active" : ""}`}
                    onClick={() => setModeA("custom")}
                  >
                    Custom
                  </button>
                </div>

                {/* Person / Solo Student list */}
                {modeA === "person" && (
                  <div className="candidates-picker-box">
                    <input
                      type="search"
                      placeholder="Search student by name or roll…"
                      value={soloSearchA}
                      onChange={(e) => setSoloSearchA(e.target.value)}
                      className="candidate-search-input"
                    />
                    <div className="candidates-list-scroll">
                      {filteredSoloA.length === 0 ? (
                        <p className="no-candidates">No approved students found.</p>
                      ) : (
                        filteredSoloA.map((s) => {
                          const label = `${s.full_name} (${s.batch_label}${s.roll_canonical ? `, #${s.roll_canonical}` : ""})`;
                          const isSelected = chosenPartA === label;
                          return (
                            <button
                              type="button"
                              key={s.student_id}
                              className={`candidate-row-btn ${isSelected ? "selected-a" : ""}`}
                              onClick={() => setChosenPartA(label)}
                            >
                              <strong>{s.full_name}</strong>
                              <span>Batch {s.batch_label} {s.roll_canonical ? `· Roll ${s.roll_canonical}` : ""}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Pair / Team list */}
                {modeA === "pair" && (
                  <div className="batch-chips-grid">
                    {groupOptions.map((g) => (
                      <button
                        type="button"
                        key={g}
                        className={`batch-pill ${chosenPartA === g ? "active-a" : ""}`}
                        disabled={chosenPartB === g}
                        onClick={() => setChosenPartA(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}

                {/* Batch list */}
                {modeA === "batch" && (
                  <div className="batch-chips-grid">
                    {batchOptions.map((b) => (
                      <button
                        type="button"
                        key={b}
                        className={`batch-pill ${chosenPartA === b ? "active-a" : ""}`}
                        disabled={chosenPartB === b}
                        onClick={() => setChosenPartA(b)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom text input */}
                {modeA === "custom" && (
                  <input
                    className="custom-text-input"
                    placeholder="Enter custom team or participant name"
                    maxLength={160}
                    value={customPartA}
                    onChange={(e) => setCustomPartA(e.target.value)}
                    required
                  />
                )}

                <div className="selected-preview">
                  Selected: <strong>{modeA === "custom" ? customPartA || "None" : chosenPartA || "Select above"}</strong>
                </div>
              </div>

              <div className="versus-divider">
                <span>VS</span>
              </div>

              {/* Participant B */}
              <div className="team-picker-card">
                <div className="team-picker-header">
                  <span className="team-badge b">B</span>
                  <h4>Participant B (Away / 2nd)</h4>
                </div>

                {/* Source Mode Tabs */}
                <div className="part-mode-tabs">
                  {soloStudents.length > 0 && (
                    <button
                      type="button"
                      className={`mode-tab ${modeB === "person" ? "active" : ""}`}
                      onClick={() => setModeB("person")}
                    >
                      Person / Solo ({soloStudents.length})
                    </button>
                  )}
                  {groupOptions.length > 0 && (
                    <button
                      type="button"
                      className={`mode-tab ${modeB === "pair" ? "active" : ""}`}
                      onClick={() => setModeB("pair")}
                    >
                      Pair / Team ({groupOptions.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className={`mode-tab ${modeB === "batch" ? "active" : ""}`}
                    onClick={() => setModeB("batch")}
                  >
                    Batch ({batchOptions.length})
                  </button>
                  <button
                    type="button"
                    className={`mode-tab ${modeB === "custom" ? "active" : ""}`}
                    onClick={() => setModeB("custom")}
                  >
                    Custom
                  </button>
                </div>

                {/* Person / Solo Student list */}
                {modeB === "person" && (
                  <div className="candidates-picker-box">
                    <input
                      type="search"
                      placeholder="Search student by name or roll…"
                      value={soloSearchB}
                      onChange={(e) => setSoloSearchB(e.target.value)}
                      className="candidate-search-input"
                    />
                    <div className="candidates-list-scroll">
                      {filteredSoloB.length === 0 ? (
                        <p className="no-candidates">No approved students found.</p>
                      ) : (
                        filteredSoloB.map((s) => {
                          const label = `${s.full_name} (${s.batch_label}${s.roll_canonical ? `, #${s.roll_canonical}` : ""})`;
                          const isSelected = chosenPartB === label;
                          return (
                            <button
                              type="button"
                              key={s.student_id}
                              className={`candidate-row-btn ${isSelected ? "selected-b" : ""}`}
                              onClick={() => setChosenPartB(label)}
                            >
                              <strong>{s.full_name}</strong>
                              <span>Batch {s.batch_label} {s.roll_canonical ? `· Roll ${s.roll_canonical}` : ""}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Pair / Team list */}
                {modeB === "pair" && (
                  <div className="batch-chips-grid">
                    {groupOptions.map((g) => (
                      <button
                        type="button"
                        key={g}
                        className={`batch-pill ${chosenPartB === g ? "active-b" : ""}`}
                        disabled={chosenPartA === g}
                        onClick={() => setChosenPartB(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                )}

                {/* Batch list */}
                {modeB === "batch" && (
                  <div className="batch-chips-grid">
                    {batchOptions.map((b) => (
                      <button
                        type="button"
                        key={b}
                        className={`batch-pill ${chosenPartB === b ? "active-b" : ""}`}
                        disabled={chosenPartA === b}
                        onClick={() => setChosenPartB(b)}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                )}

                {/* Custom text input */}
                {modeB === "custom" && (
                  <input
                    className="custom-text-input"
                    placeholder="Enter custom team or participant name"
                    maxLength={160}
                    value={customPartB}
                    onChange={(e) => setCustomPartB(e.target.value)}
                    required
                  />
                )}

                <div className="selected-preview">
                  Selected: <strong>{modeB === "custom" ? customPartB || "None" : chosenPartB || "Select above"}</strong>
                </div>
              </div>
            </div>

            {/* Venue (Manual Typing Only) & Timings Row */}
            <div className="meta-inputs-grid">
              <div className="meta-input-group">
                <label>Venue (Manual Entry)</label>
                <input
                  className="custom-text-input"
                  placeholder="e.g. Main Cricket Ground / LT-1"
                  value={venueInput}
                  maxLength={160}
                  onChange={(e) => setVenueInput(e.target.value)}
                />
              </div>

              <div className="timings-grid">
                <label>
                  Start Time (IST)
                  <input
                    type="datetime-local"
                    required
                    value={startsInput}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                  />
                </label>
                <label>
                  Reporting Time (IST)
                  <input
                    type="datetime-local"
                    value={reportingInput}
                    onChange={(e) => setReportingInput(e.target.value)}
                  />
                  <small className="hint">Auto-set to 15m prior</small>
                </label>
              </div>
            </div>

            <div className="form-submit-row">
              <button type="submit" className="primary-action-btn" disabled={createPending}>
                {createPending ? "Publishing Match…" : "✓ Publish Match Fixture"}
              </button>
              <button type="button" className="secondary-action-btn" onClick={() => setShowCreateForm(false)}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Search & Filter Toolstrip */}
      <div className="fixtures-filter-strip">
        <div className="status-tabs">
          <button
            type="button"
            className={`status-tab ${statusFilter === "all" ? "active" : ""}`}
            onClick={() => setStatusFilter("all")}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            className={`status-tab ${statusFilter === "scheduled" ? "active" : ""}`}
            onClick={() => setStatusFilter("scheduled")}
          >
            Scheduled ({counts.scheduled})
          </button>
          <button
            type="button"
            className={`status-tab live ${statusFilter === "live" ? "active" : ""}`}
            onClick={() => setStatusFilter("live")}
          >
            <span className="live-dot" /> Live ({counts.live})
          </button>
          <button
            type="button"
            className={`status-tab ${statusFilter === "final" ? "active" : ""}`}
            onClick={() => setStatusFilter("final")}
          >
            Completed ({counts.final})
          </button>
        </div>

        <div className="search-and-stage">
          <input
            type="search"
            placeholder="Search teams, rounds, venues…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="fixtures-search-input"
          />
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="stage-filter-select"
          >
            <option value="all">All Stages</option>
            <option value="quarter">Quarter-Finals</option>
            <option value="semi">Semi-Finals</option>
            <option value="final">Finals</option>
          </select>
        </div>
      </div>

      {/* Compact Strip Rows List */}
      <div className="fixture-strips-container">
        {filteredFixtures.length === 0 ? (
          <div className="fixtures-empty-state">
            <h3>No fixtures found</h3>
            <p>
              {fixtures.length === 0
                ? "Click \"+ Create Match\" above to schedule your first fixture."
                : "No matches match your active filters or search."}
            </p>
          </div>
        ) : (
          filteredFixtures.map((f) => {
            const isLive = f.state === "ongoing" || f.score_status === "live";
            const isCompleted = f.state === "completed" || f.score_status === "final";
            const scoreObj = (f.score_payload || {}) as Record<string, unknown>;

            let scoreSnippet = "";
            if (scoreTemplate === "cricket" && scoreObj.teamA_runs !== undefined) {
              scoreSnippet = `${scoreObj.teamA_runs}/${scoreObj.teamA_wickets ?? 0} vs ${scoreObj.teamB_runs ?? 0}/${scoreObj.teamB_wickets ?? 0}`;
            } else if (scoreTemplate === "football" && scoreObj.teamA_goals !== undefined) {
              scoreSnippet = `${scoreObj.teamA_goals} — ${scoreObj.teamB_goals ?? 0}`;
            } else if (scoreTemplate === "badminton" && scoreObj.set1) {
              scoreSnippet = `Sets: ${scoreObj.set1}${scoreObj.set2 ? `, ${scoreObj.set2}` : ""}`;
            } else if (scoreObj.winner) {
              scoreSnippet = `Winner: ${scoreObj.winner}`;
            }

            const teamALabel = formatTeamLabel(f.participant_a_label);
            const teamBLabel = formatTeamLabel(f.participant_b_label);

            return (
              <article
                key={f.fixture_id}
                className={`fixture-strip-row ${isLive ? "is-live" : isCompleted ? "is-completed" : ""}`}
                onClick={() => setSelectedFixture(f)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFixture(f);
                  }
                }}
              >
                {/* Left Side: Stage + Matchup + Score Snippet */}
                <div className="strip-left">
                  <div className="strip-stage-pill">{f.stage}</div>
                  <div className="strip-matchup-names">
                    <span className="team-text home" title={teamALabel}>
                      {teamALabel}
                    </span>
                    <span className="vs-sep">vs</span>
                    <span className="team-text away" title={teamBLabel}>
                      {teamBLabel}
                    </span>
                  </div>
                  {scoreSnippet && <div className="strip-score-snippet">{scoreSnippet}</div>}
                </div>

                {/* Right Side: Status Badge + Time/Venue + Chevron */}
                <div className="strip-right">
                  <div className="strip-meta-col">
                    <span className={`strip-status-badge ${isLive ? "live" : isCompleted ? "completed" : "scheduled"}`}>
                      {isLive ? "● LIVE" : isCompleted ? "FINAL" : "SCHEDULED"}
                    </span>
                    <span className="strip-time-text">{formatIST(f.starts_at)}</span>
                    <span className="strip-venue-text">{f.venue || "TBA"}</span>
                  </div>
                  <span className="strip-chevron">›</span>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* FULL FIXTURE INSPECTION MODAL (Tap-to-Open) */}
      {selectedFixture && (
        <PortalDialog
          labelledBy="fixture-detail-title"
          onClose={() => setSelectedFixture(null)}
        >
          <div className="fixture-modal-card">
            {/* Modal Header */}
            <div className="fixture-modal-header">
              <div>
                <span className="modal-stage-tag">{selectedFixture.stage}</span>
                <h2 id="fixture-detail-title">
                  {formatTeamLabel(selectedFixture.participant_a_label)} <span className="vs-modal">vs</span> {formatTeamLabel(selectedFixture.participant_b_label)}
                </h2>
              </div>
              <button
                type="button"
                className="modal-close-icon"
                onClick={() => setSelectedFixture(null)}
                aria-label="Close match details"
              >
                ✕
              </button>
            </div>

            {/* Stadium Matchup Card (No confusing 20/20 circles!) */}
            <div className="modal-stadium-card">
              <div className="stadium-competitor home">
                <span className="team-indicator a">A</span>
                <div className="competitor-info">
                  <strong>{formatTeamLabel(selectedFixture.participant_a_label)}</strong>
                  <span className="sub-role">Home / 1st</span>
                </div>
              </div>

              <div className="stadium-center-badge">
                <span className="vs-circle">VS</span>
                <span
                  className={`modal-live-tag ${
                    selectedFixture.state === "ongoing" || selectedFixture.score_status === "live"
                      ? "live"
                      : selectedFixture.state === "completed" || selectedFixture.score_status === "final"
                        ? "completed"
                        : "scheduled"
                  }`}
                >
                  {selectedFixture.state === "ongoing" || selectedFixture.score_status === "live"
                    ? "● LIVE"
                    : selectedFixture.state === "completed" || selectedFixture.score_status === "final"
                      ? "FINAL"
                      : "SCHEDULED"}
                </span>
              </div>

              <div className="stadium-competitor away">
                <div className="competitor-info right">
                  <strong>{formatTeamLabel(selectedFixture.participant_b_label)}</strong>
                  <span className="sub-role">Away / 2nd</span>
                </div>
                <span className="team-indicator b">B</span>
              </div>
            </div>

            {/* Scoreboard Display (if scored) */}
            {selectedFixture.score_payload && Object.keys(selectedFixture.score_payload).length > 0 && (
              <div className="modal-scoreboard-section">
                <h4>Official Scoreboard ({scoreTemplate.toUpperCase()})</h4>
                {scoreTemplate === "cricket" && (
                  <div className="scoreboard-cricket">
                    <div className="cricket-team-row">
                      <span>{formatTeamLabel(selectedFixture.participant_a_label)}:</span>
                      <strong>
                        {String(selectedFixture.score_payload.teamA_runs ?? 0)}/
                        {String(selectedFixture.score_payload.teamA_wickets ?? 0)}
                        <small>({String(selectedFixture.score_payload.teamA_overs ?? "0.0")} ov)</small>
                      </strong>
                    </div>
                    <div className="cricket-team-row">
                      <span>{formatTeamLabel(selectedFixture.participant_b_label)}:</span>
                      <strong>
                        {String(selectedFixture.score_payload.teamB_runs ?? 0)}/
                        {String(selectedFixture.score_payload.teamB_wickets ?? 0)}
                        <small>({String(selectedFixture.score_payload.teamB_overs ?? "0.0")} ov)</small>
                      </strong>
                    </div>
                  </div>
                )}

                {scoreTemplate === "football" && (
                  <div className="scoreboard-football">
                    <div className="football-score-large">
                      <span>{String(selectedFixture.score_payload.teamA_goals ?? 0)}</span>
                      <span>—</span>
                      <span>{String(selectedFixture.score_payload.teamB_goals ?? 0)}</span>
                    </div>
                    {Boolean(selectedFixture.score_payload.penalties) && (
                      <p className="penalties-note">Penalties: {String(selectedFixture.score_payload.penalties)}</p>
                    )}
                  </div>
                )}

                {scoreTemplate === "badminton" && (
                  <div className="scoreboard-badminton">
                    <p>
                      Sets: {String(selectedFixture.score_payload.set1 || "—")} |{" "}
                      {String(selectedFixture.score_payload.set2 || "—")}{" "}
                      {selectedFixture.score_payload.set3 ? `| ${String(selectedFixture.score_payload.set3)}` : ""}
                    </p>
                    {Boolean(selectedFixture.score_payload.winner) && (
                      <p className="winner-tag">Winner: {String(selectedFixture.score_payload.winner)}</p>
                    )}
                  </div>
                )}

                {scoreTemplate === "generic" && (
                  <div className="scoreboard-generic">
                    {Boolean(selectedFixture.score_payload.winner) && (
                      <p><strong>Winner:</strong> {String(selectedFixture.score_payload.winner)}</p>
                    )}
                  </div>
                )}

                {Boolean(selectedFixture.score_payload.summary) && (
                  <div className="match-summary-quote">
                    &quot;{String(selectedFixture.score_payload.summary)}&quot;
                  </div>
                )}
              </div>
            )}

            {/* Schedule & Venue Metadata */}
            <div className="modal-meta-grid">
              <div>
                <span className="m-label">Venue</span>
                <span className="m-val">📍 {selectedFixture.venue || "To be announced"}</span>
              </div>
              <div>
                <span className="m-label">Match Starts (IST)</span>
                <span className="m-val highlight">🕒 {formatIST(selectedFixture.starts_at)}</span>
              </div>
              <div>
                <span className="m-label">Reporting Time</span>
                <span className="m-val">⏱️ {formatIST(selectedFixture.reporting_at)}</span>
              </div>
              <div>
                <span className="m-label">Audit Versions</span>
                <span className="m-val">
                  Schedule v{selectedFixture.schedule_version} · Score v{selectedFixture.score_version}
                </span>
              </div>
            </div>

            {/* STRICT TIME-BASED SCORING: Unlocks strictly at match start time */}
            {!isScoringEnabled(selectedFixture) ? (
              <div className="scoring-locked-card">
                <span className="lock-title">🔒 Scoring Locked</span>
                <p>
                  Scoring and Scorer App will automatically enable when the scheduled match start time arrives (
                  {formatIST(selectedFixture.starts_at)}).
                </p>
              </div>
            ) : (
              <div className="scoring-unlocked-card">
                <span className="unlocked-header">⚡ Scoring Open</span>
                <div className="scoring-actions-row">
                  <button
                    type="button"
                    className="modal-action-btn primary-score"
                    onClick={() => openScoreModal(selectedFixture)}
                  >
                    ⚡ Enter Live Score
                  </button>
                  <Link
                    href={`/scorer?fixture=${encodeURIComponent(selectedFixture.fixture_id)}`}
                    className="modal-action-btn scorer-app-link"
                  >
                    📱 Open Scorer App
                  </Link>
                </div>
              </div>
            )}

            {/* Standard Operations Footer */}
            <div className="modal-operations-footer">
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => openReschedule(selectedFixture)}
              >
                🕒 Reschedule Match
              </button>
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => {
                  setReminderFixture(selectedFixture);
                  setReminderBody(
                    `Reminder: ${selectedFixture.stage} between ${formatTeamLabel(selectedFixture.participant_a_label)} and ${formatTeamLabel(selectedFixture.participant_b_label)} starts at ${formatIST(selectedFixture.starts_at)} at ${selectedFixture.venue ?? "the venue"}.`
                  );
                }}
              >
                🔔 Send Reminder
              </button>
              <button
                type="button"
                className="modal-action-btn"
                onClick={() => openHistory(selectedFixture)}
              >
                📜 History Log
              </button>
              {isMainAdmin && (
                <button
                  type="button"
                  className="modal-action-btn"
                  onClick={() => void forceReleaseScorer(selectedFixture.fixture_id)}
                >
                  🔄 Release Scorer
                </button>
              )}
              <button
                type="button"
                className="modal-action-btn danger"
                onClick={() => setDeleteFixtureTarget(selectedFixture)}
              >
                🗑️ Delete Match
              </button>
            </div>
          </div>
        </PortalDialog>
      )}

      {/* Delete Confirmation Modal */}
      {deleteFixtureTarget && (
        <PortalDialog
          labelledBy="delete-modal-title"
          onClose={() => setDeleteFixtureTarget(null)}
          busy={deletePending}
        >
          <div className="modal-card wide">
            <h2 id="delete-modal-title">Delete Fixture Permanently?</h2>
            <p>
              Are you sure you want to delete this match?
              <br />
              <strong>
                {deleteFixtureTarget.stage}: {formatTeamLabel(deleteFixtureTarget.participant_a_label)} vs{" "}
                {formatTeamLabel(deleteFixtureTarget.participant_b_label)}
              </strong>
            </p>
            <p className="reschedule-audit-notice">
              ⚠️ This will remove all associated live score snapshots, audit entries, and offline scorer locks. This action cannot be undone.
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                disabled={deletePending}
                onClick={() => setDeleteFixtureTarget(null)}
              >
                Keep Match
              </button>
              <button
                type="button"
                className="modal-btn confirm-reject"
                style={{ background: "#c53030", borderColor: "#c53030" }}
                disabled={deletePending}
                onClick={handleDeleteConfirm}
              >
                {deletePending ? "Deleting…" : "Yes, Delete Match"}
              </button>
            </div>
          </div>
        </PortalDialog>
      )}

      {/* Reschedule Modal */}
      {rescheduleFixture && (
        <PortalDialog
          labelledBy="reschedule-modal-title"
          onClose={() => setRescheduleFixture(null)}
          busy={reschedulePending}
        >
          <div className="modal-card wide">
            <h2 id="reschedule-modal-title">Reschedule Fixture</h2>
            <p>
              Match: <strong>{formatTeamLabel(rescheduleFixture.participant_a_label)}</strong> vs{" "}
              <strong>{formatTeamLabel(rescheduleFixture.participant_b_label)}</strong> ({rescheduleFixture.stage})
            </p>
            <p className="reschedule-audit-notice">
              ⚠️ Changing fixture timings increments the schedule version to{" "}
              <strong>v{rescheduleFixture.schedule_version + 1}</strong> and saves the previous schedule in the audit history.
            </p>

            <form onSubmit={handleRescheduleSubmit}>
              <div className="form-grid-2">
                <label className="modal-label">
                  New Start Time (IST)
                  <input
                    type="datetime-local"
                    value={rescheduleStarts}
                    onChange={(e) => setRescheduleStarts(e.target.value)}
                  />
                </label>
                <label className="modal-label">
                  New Reporting Time (IST)
                  <input
                    type="datetime-local"
                    value={rescheduleReporting}
                    onChange={(e) => setRescheduleReporting(e.target.value)}
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
        </PortalDialog>
      )}

      {/* Quick Score Entry Modal */}
      {scoreFixture && (
        <PortalDialog
          labelledBy="score-modal-title"
          onClose={() => setScoreFixture(null)}
          busy={scorePending}
        >
          <div className="modal-card wide">
            <h2 id="score-modal-title">
              Score Entry: {formatTeamLabel(scoreFixture.participant_a_label)} vs {formatTeamLabel(scoreFixture.participant_b_label)}
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
                  onChange={(e) =>
                    setScoreStatus(e.target.value as "scheduled" | "live" | "paused" | "final" | "cancelled")
                  }
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
                    <h4>{formatTeamLabel(scoreFixture.participant_a_label)}</h4>
                    <div className="form-grid-3">
                      <label>Runs<input type="number" min={0} value={scoreForm.teamA_runs ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamA_runs: e.target.value })} /></label>
                      <label>Wickets<input type="number" min={0} max={10} value={scoreForm.teamA_wickets ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamA_wickets: e.target.value })} /></label>
                      <label>Overs<input type="text" value={scoreForm.teamA_overs ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, teamA_overs: e.target.value })} placeholder="e.g. 19.4" /></label>
                    </div>
                  </div>

                  <div className="team-score-block">
                    <h4>{formatTeamLabel(scoreFixture.participant_b_label)}</h4>
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
                      placeholder="e.g. Batch 2023 won by 14 runs"
                    />
                  </label>
                </div>
              )}

              {/* FOOTBALL TEMPLATE */}
              {scoreTemplate === "football" && (
                <div className="template-fields">
                  <div className="form-grid-2">
                    <label className="modal-label">
                      {formatTeamLabel(scoreFixture.participant_a_label)} Goals
                      <input
                        type="number"
                        min={0}
                        value={scoreForm.teamA_goals ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, teamA_goals: e.target.value })}
                      />
                    </label>
                    <label className="modal-label">
                      {formatTeamLabel(scoreFixture.participant_b_label)} Goals
                      <input
                        type="number"
                        min={0}
                        value={scoreForm.teamB_goals ?? ""}
                        onChange={(e) => setScoreForm({ ...scoreForm, teamB_goals: e.target.value })}
                      />
                    </label>
                  </div>
                  <label className="modal-label">
                    Penalties / Shootout (if applicable)
                    <input
                      value={scoreForm.penalties ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, penalties: e.target.value })}
                      placeholder="e.g. 4-3 penalties"
                    />
                  </label>
                  <label className="modal-label">
                    Match Summary
                    <input
                      value={scoreForm.summary ?? ""}
                      onChange={(e) => setScoreForm({ ...scoreForm, summary: e.target.value })}
                      placeholder="e.g. Batch 2024 won in extra time"
                    />
                  </label>
                </div>
              )}

              {/* BADMINTON TEMPLATE */}
              {scoreTemplate === "badminton" && (
                <div className="template-fields">
                  <div className="form-grid-3">
                    <label className="modal-label">Set 1<input value={scoreForm.set1 ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, set1: e.target.value })} placeholder="21-18" /></label>
                    <label className="modal-label">Set 2<input value={scoreForm.set2 ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, set2: e.target.value })} placeholder="19-21" /></label>
                    <label className="modal-label">Set 3<input value={scoreForm.set3 ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, set3: e.target.value })} placeholder="21-14" /></label>
                  </div>
                  <label className="modal-label">Winner<input value={scoreForm.winner ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, winner: e.target.value })} placeholder="Name of winner" /></label>
                </div>
              )}

              {/* GENERIC TEMPLATE */}
              {scoreTemplate === "generic" && (
                <div className="template-fields">
                  <label className="modal-label">Winner<input value={scoreForm.winner ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, winner: e.target.value })} placeholder="Winner participant or team" /></label>
                  <label className="modal-label">Match Summary<input value={scoreForm.summary ?? ""} onChange={(e) => setScoreForm({ ...scoreForm, summary: e.target.value })} placeholder="e.g. Qualified for Finals" /></label>
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
                  className="modal-btn confirm-activate"
                  style={{ background: "#261923" }}
                  disabled={scorePending}
                >
                  {scorePending ? "Saving Score…" : "Publish Score"}
                </button>
              </div>
            </form>
          </div>
        </PortalDialog>
      )}

      {/* Audit History Modal */}
      {historyFixture && (
        <PortalDialog
          labelledBy="history-modal-title"
          onClose={() => setHistoryFixture(null)}
        >
          <div className="modal-card wide">
            <h2 id="history-modal-title">Schedule Audit History</h2>
            <p>
              Match: <strong>{formatTeamLabel(historyFixture.participant_a_label)}</strong> vs{" "}
              <strong>{formatTeamLabel(historyFixture.participant_b_label)}</strong> ({historyFixture.stage})
            </p>

            {historyLoading ? (
              <p className="loading-note">Loading history log…</p>
            ) : historyList.length === 0 ? (
              <p className="empty-history-note">No reschedules recorded. This fixture is on its original schedule (v1).</p>
            ) : (
              <div className="history-entries-list">
                {historyList.map((h) => (
                  <div key={h.id} className="history-item">
                    <div className="history-header">
                      <span className="history-actor">{h.actor_name || "Organiser"}</span>
                      <span className="history-time">{formatIST(h.created_at)}</span>
                    </div>
                    <p className="history-reason">Reason: &quot;{h.reason}&quot;</p>
                    <div className="history-diff">
                      <span>Previous: {formatIST(h.previous_schedule.starts_at ?? null)} at {h.previous_schedule.venue || "TBA"}</span>
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
        </PortalDialog>
      )}

      {/* Reminder Modal */}
      {reminderFixture && (
        <PortalDialog
          labelledBy="reminder-modal-title"
          onClose={() => setReminderFixture(null)}
          busy={reminderPending}
        >
          <div className="modal-card wide">
            <h2 id="reminder-modal-title">Send Match Reminder Notification</h2>
            <p>
              Send an instant push and in-app reminder to registered participants for{" "}
              <strong>{reminderFixture.stage}</strong> ({formatTeamLabel(reminderFixture.participant_a_label)} vs{" "}
              {formatTeamLabel(reminderFixture.participant_b_label)}).
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
                  className="modal-btn confirm-activate"
                  style={{ background: "#261923" }}
                  disabled={reminderPending || !reminderBody.trim()}
                >
                  {reminderPending ? "Sending Reminders…" : "Send Notifications"}
                </button>
              </div>
            </form>
          </div>
        </PortalDialog>
      )}
    </div>
  );
}
