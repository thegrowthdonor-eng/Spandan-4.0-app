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
  "Final",
  "Semi-Final 1",
  "Semi-Final 2",
  "Quarter-Final 1",
  "Quarter-Final 2",
  "Quarter-Final 3",
  "Quarter-Final 4",
  "3rd Place Playoff",
  "Round of 16",
  "League Match",
  "Exhibition Match",
];

const CAMPUS_VENUES = [
  "Main Cricket Ground",
  "Football Turf",
  "Basketball Court",
  "Indoor Sports Complex",
  "Badminton Court 1",
  "Badminton Court 2",
  "Table Tennis Arena",
  "Auditorium Stage",
  "LT-1 Complex",
];

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
  isMainAdmin,
}: {
  event: EventMeta;
  fixtures: FixtureItem[];
  eligibleBatches?: BatchItem[];
  registeredGroups?: GroupItem[];
  isMainAdmin: boolean;
}) {
  const router = useRouter();
  const scoreTemplate = event.score_template || "generic";

  // Mode tabs: 'list' | 'single' | 'bracket'
  const [activeTab, setActiveTab] = useState<"list" | "single" | "bracket">("list");

  // Single Quick Match State
  const [quickStage, setQuickStage] = useState("Semi-Final 1");
  const [customStage, setCustomStage] = useState("");
  const [selectedPartA, setSelectedPartA] = useState("");
  const [selectedPartB, setSelectedPartB] = useState("");
  const [customPartA, setCustomPartA] = useState("");
  const [customPartB, setCustomPartB] = useState("");
  const [useCustomA, setUseCustomA] = useState(false);
  const [useCustomB, setUseCustomB] = useState(false);
  const [quickVenue, setQuickVenue] = useState(event.venue || "Main Cricket Ground");
  const [quickStarts, setQuickStarts] = useState(() => {
    const d = event.starts_at ? new Date(event.starts_at) : new Date();
    d.setHours(9, 0, 0, 0);
    return toLocalInput(d.toISOString());
  });
  const [quickReporting, setQuickReporting] = useState(() => {
    const d = event.starts_at ? new Date(event.starts_at) : new Date();
    d.setHours(8, 45, 0, 0);
    return toLocalInput(d.toISOString());
  });
  const [createPending, setCreatePending] = useState(false);

  // Tournament Auto-Generator State
  const [bracketBatches, setBracketBatches] = useState<string[]>([]);
  const [bracketFormat, setBracketFormat] = useState<"knockout" | "round_robin">("knockout");
  const [bracketInterval, setBracketInterval] = useState(60); // minutes
  const [bracketVenue, setBracketVenue] = useState(event.venue || "Main Cricket Ground");
  const [bracketStarts, setBracketStarts] = useState(() => {
    const d = event.starts_at ? new Date(event.starts_at) : new Date();
    d.setHours(9, 0, 0, 0);
    return toLocalInput(d.toISOString());
  });
  const [bracketPending, setBracketPending] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "scheduled" | "live" | "final">("all");
  const [stageFilter, setStageFilter] = useState("all");

  // Modals state
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

  // Candidate participant labels
  const participantOptions = useMemo(() => {
    const list: string[] = [];
    if (registeredGroups.length > 0) {
      registeredGroups.forEach((g) => list.push(g.name));
    }
    if (eligibleBatches.length > 0) {
      eligibleBatches.forEach((b) => {
        const name = b.label.toLowerCase().includes("batch") ? b.label : `Batch ${b.label}`;
        if (!list.includes(name)) list.push(name);
      });
    } else {
      ["Batch 2021", "Batch 2022", "Batch 2023", "Batch 2024", "Batch 2025", "Faculty / Staff", "Interns"].forEach(
        (b) => {
          if (!list.includes(b)) list.push(b);
        }
      );
    }
    return list;
  }, [eligibleBatches, registeredGroups]);

  // Derived filtered fixtures
  const filteredFixtures = useMemo(() => {
    return fixtures.filter((f) => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        f.participant_a_label.toLowerCase().includes(q) ||
        f.participant_b_label.toLowerCase().includes(q) ||
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

  // Status counts
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

  // Handle Start Time Change -> Auto set Reporting -15 mins
  function handleStartTimeChange(value: string) {
    setQuickStarts(value);
    if (value) {
      const startD = new Date(value);
      const repD = new Date(startD.getTime() - 15 * 60000);
      setQuickReporting(toLocalInput(repD.toISOString()));
    }
  }

  // 1-Tap Single Fixture Submission
  async function handleCreateQuickFixture(e: React.FormEvent) {
    e.preventDefault();
    if (createPending) return;

    const finalStage = quickStage === "custom" ? customStage.trim() : quickStage;
    const finalPartA = useCustomA ? customPartA.trim() : selectedPartA.trim();
    const finalPartB = useCustomB ? customPartB.trim() : selectedPartB.trim();

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
          participantALabel: finalPartA,
          participantBLabel: finalPartB,
          venue: quickVenue.trim() || undefined,
          reportingAt: quickReporting ? new Date(quickReporting).toISOString() : null,
          startsAt: quickStarts ? new Date(quickStarts).toISOString() : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Fixture "${finalPartA} vs ${finalPartB}" published successfully!` });
        setActiveTab("list");
        setSelectedPartA("");
        setSelectedPartB("");
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

  // Generate Bracket Matches Preview
  const bracketPreview = useMemo(() => {
    if (bracketBatches.length < 2) return [];
    const matches: Array<{
      stage: string;
      partA: string;
      partB: string;
      venue: string;
      startsAt: string;
      reportingAt: string;
    }> = [];

    const baseStart = bracketStarts ? new Date(bracketStarts).getTime() : Date.now();

    if (bracketFormat === "round_robin") {
      let matchIdx = 1;
      for (let i = 0; i < bracketBatches.length; i++) {
        for (let j = i + 1; j < bracketBatches.length; j++) {
          const matchTime = new Date(baseStart + (matchIdx - 1) * bracketInterval * 60000);
          const repTime = new Date(matchTime.getTime() - 15 * 60000);
          matches.push({
            stage: `League Match ${matchIdx}`,
            partA: bracketBatches[i],
            partB: bracketBatches[j],
            venue: bracketVenue,
            startsAt: matchTime.toISOString(),
            reportingAt: repTime.toISOString(),
          });
          matchIdx++;
        }
      }
    } else {
      // Knockout
      const teams = [...bracketBatches];
      if (teams.length === 4) {
        const semi1 = new Date(baseStart);
        const semi2 = new Date(baseStart + bracketInterval * 60000);
        const finalTime = new Date(baseStart + bracketInterval * 2 * 60000);

        matches.push({
          stage: "Semi-Final 1",
          partA: teams[0],
          partB: teams[1],
          venue: bracketVenue,
          startsAt: semi1.toISOString(),
          reportingAt: new Date(semi1.getTime() - 15 * 60000).toISOString(),
        });
        matches.push({
          stage: "Semi-Final 2",
          partA: teams[2],
          partB: teams[3],
          venue: bracketVenue,
          startsAt: semi2.toISOString(),
          reportingAt: new Date(semi2.getTime() - 15 * 60000).toISOString(),
        });
        matches.push({
          stage: "Final",
          partA: `Winner of Semi-Final 1`,
          partB: `Winner of Semi-Final 2`,
          venue: bracketVenue,
          startsAt: finalTime.toISOString(),
          reportingAt: new Date(finalTime.getTime() - 15 * 60000).toISOString(),
        });
      } else {
        // Pairs of teams
        let pairCount = Math.floor(teams.length / 2);
        for (let k = 0; k < pairCount; k++) {
          const tTime = new Date(baseStart + k * bracketInterval * 60000);
          matches.push({
            stage: teams.length <= 4 ? `Semi-Final ${k + 1}` : `Quarter-Final ${k + 1}`,
            partA: teams[k * 2],
            partB: teams[k * 2 + 1],
            venue: bracketVenue,
            startsAt: tTime.toISOString(),
            reportingAt: new Date(tTime.getTime() - 15 * 60000).toISOString(),
          });
        }
        // Final match slot
        const fTime = new Date(baseStart + pairCount * bracketInterval * 60000);
        matches.push({
          stage: "Final",
          partA: "Winner Match 1",
          partB: "Winner Match 2",
          venue: bracketVenue,
          startsAt: fTime.toISOString(),
          reportingAt: new Date(fTime.getTime() - 15 * 60000).toISOString(),
        });
      }
    }
    return matches;
  }, [bracketBatches, bracketFormat, bracketInterval, bracketVenue, bracketStarts]);

  // 1-Click Bulk Bracket Generation Submission
  async function handleBulkSubmit() {
    if (bracketPreview.length === 0 || bracketPending) return;
    setBracketPending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/fixtures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk_create",
          eventId: event.id,
          fixtures: bracketPreview.map((m) => ({
            stage: m.stage,
            participantALabel: m.partA,
            participantBLabel: m.partB,
            venue: m.venue || undefined,
            reportingAt: m.reportingAt,
            startsAt: m.startsAt,
          })),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; createdCount?: number; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Successfully generated ${data.createdCount} tournament matches!` });
        setActiveTab("list");
        setBracketBatches([]);
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed generating fixtures.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error generating tournament fixtures.", isError: true });
    } finally {
      setBracketPending(false);
    }
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
        setStatusMessage({ text: "Fixture deleted permanently." });
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
            className={`kpi-btn ${activeTab === "single" ? "active" : ""}`}
            onClick={() => setActiveTab(activeTab === "single" ? "list" : "single")}
          >
            {activeTab === "single" ? "✕ Close Form" : "+ Quick Match"}
          </button>
          <button
            type="button"
            className={`kpi-btn bracket ${activeTab === "bracket" ? "active" : ""}`}
            onClick={() => setActiveTab(activeTab === "bracket" ? "list" : "bracket")}
          >
            {activeTab === "bracket" ? "✕ Close Generator" : "⚡ Auto-Generate Bracket"}
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      {/* MODE 1: 1-Tap Quick Match Creator */}
      {activeTab === "single" && (
        <section className="fixture-form-drawer">
          <div className="drawer-header">
            <div>
              <h3>1-Tap Quick Match Creator</h3>
              <p>Pick rounds, tap participating batches, and publish to the live schedule in seconds.</p>
            </div>
            <button type="button" className="drawer-close" onClick={() => setActiveTab("list")}>
              ✕
            </button>
          </div>

          <form onSubmit={handleCreateQuickFixture} className="quick-fixture-form">
            {/* Stage Selector Chips */}
            <div className="chip-section">
              <label className="section-label">1. Match Stage / Round</label>
              <div className="chip-scroller">
                {COMMON_STAGES.map((s) => (
                  <button
                    type="button"
                    key={s}
                    className={`stage-chip ${quickStage === s ? "selected" : ""}`}
                    onClick={() => {
                      setQuickStage(s);
                      setCustomStage("");
                    }}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  className={`stage-chip ${quickStage === "custom" ? "selected" : ""}`}
                  onClick={() => setQuickStage("custom")}
                >
                  Custom…
                </button>
              </div>
              {quickStage === "custom" && (
                <input
                  className="custom-text-input"
                  placeholder="e.g. Pool A — Match 3"
                  maxLength={100}
                  required
                  value={customStage}
                  onChange={(e) => setCustomStage(e.target.value)}
                />
              )}
            </div>

            {/* Team A vs Team B Smart Pickers */}
            <div className="versus-grid">
              {/* Participant A */}
              <div className="team-picker-card">
                <div className="team-picker-header">
                  <span className="team-badge a">A</span>
                  <h4>Participant A (Home / 1st)</h4>
                  <button
                    type="button"
                    className="toggle-text-btn"
                    onClick={() => setUseCustomA(!useCustomA)}
                  >
                    {useCustomA ? "Choose from batches" : "Type custom"}
                  </button>
                </div>

                {useCustomA ? (
                  <input
                    className="custom-text-input"
                    placeholder="Type team / participant name"
                    maxLength={160}
                    value={customPartA}
                    onChange={(e) => setCustomPartA(e.target.value)}
                    required
                  />
                ) : (
                  <div className="batch-chips-grid">
                    {participantOptions.map((p) => (
                      <button
                        type="button"
                        key={p}
                        className={`batch-pill ${selectedPartA === p ? "active-a" : ""}`}
                        disabled={selectedPartB === p}
                        onClick={() => setSelectedPartA(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                <div className="selected-preview">
                  Selected: <strong>{useCustomA ? customPartA || "None" : selectedPartA || "Select above"}</strong>
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
                  <button
                    type="button"
                    className="toggle-text-btn"
                    onClick={() => setUseCustomB(!useCustomB)}
                  >
                    {useCustomB ? "Choose from batches" : "Type custom"}
                  </button>
                </div>

                {useCustomB ? (
                  <input
                    className="custom-text-input"
                    placeholder="Type team / participant name"
                    maxLength={160}
                    value={customPartB}
                    onChange={(e) => setCustomPartB(e.target.value)}
                    required
                  />
                ) : (
                  <div className="batch-chips-grid">
                    {participantOptions.map((p) => (
                      <button
                        type="button"
                        key={p}
                        className={`batch-pill ${selectedPartB === p ? "active-b" : ""}`}
                        disabled={selectedPartA === p}
                        onClick={() => setSelectedPartB(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                <div className="selected-preview">
                  Selected: <strong>{useCustomB ? customPartB || "None" : selectedPartB || "Select above"}</strong>
                </div>
              </div>
            </div>

            {/* Venue & Timings Row */}
            <div className="meta-inputs-grid">
              <div className="meta-input-group">
                <label>Venue / Ground</label>
                <div className="venue-chips">
                  {CAMPUS_VENUES.map((v) => (
                    <button
                      type="button"
                      key={v}
                      className={`venue-chip ${quickVenue === v ? "selected" : ""}`}
                      onClick={() => setQuickVenue(v)}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <input
                  className="custom-text-input"
                  placeholder="Or enter custom venue"
                  value={quickVenue}
                  maxLength={160}
                  onChange={(e) => setQuickVenue(e.target.value)}
                />
              </div>

              <div className="timings-grid">
                <label>
                  Start Time (IST)
                  <input
                    type="datetime-local"
                    required
                    value={quickStarts}
                    onChange={(e) => handleStartTimeChange(e.target.value)}
                  />
                </label>
                <label>
                  Reporting Time (IST)
                  <input
                    type="datetime-local"
                    value={quickReporting}
                    onChange={(e) => setQuickReporting(e.target.value)}
                  />
                  <small className="hint">Auto-set to 15m prior</small>
                </label>
              </div>
            </div>

            <div className="form-submit-row">
              <button type="submit" className="primary-action-btn" disabled={createPending}>
                {createPending ? "Publishing Match…" : "✓ Publish Match Fixture"}
              </button>
              <button type="button" className="secondary-action-btn" onClick={() => setActiveTab("list")}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* MODE 2: 1-Click Tournament Bracket Generator */}
      {activeTab === "bracket" && (
        <section className="fixture-form-drawer bracket-drawer">
          <div className="drawer-header">
            <div>
              <h3>⚡ 1-Click Tournament Bracket Generator</h3>
              <p>Select teams and generate entire Knockout or Round-Robin tournament schedules in one click.</p>
            </div>
            <button type="button" className="drawer-close" onClick={() => setActiveTab("list")}>
              ✕
            </button>
          </div>

          <div className="bracket-setup-grid">
            <div className="setup-column">
              <label className="section-label">1. Select Participating Batches / Squads ({bracketBatches.length} selected)</label>
              <div className="selectable-batches-grid">
                {participantOptions.map((p) => {
                  const isChecked = bracketBatches.includes(p);
                  return (
                    <label key={p} className={`batch-check-card ${isChecked ? "checked" : ""}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) setBracketBatches([...bracketBatches, p]);
                          else setBracketBatches(bracketBatches.filter((x) => x !== p));
                        }}
                      />
                      <span>{p}</span>
                    </label>
                  );
                })}
              </div>

              <div className="bracket-options">
                <label>
                  Format
                  <select
                    value={bracketFormat}
                    onChange={(e) => setBracketFormat(e.target.value as "knockout" | "round_robin")}
                  >
                    <option value="knockout">Single Elimination Knockout (Semis &amp; Final)</option>
                    <option value="round_robin">Round-Robin / League (All teams play each other)</option>
                  </select>
                </label>

                <label>
                  Match Interval
                  <select
                    value={bracketInterval}
                    onChange={(e) => setBracketInterval(Number(e.target.value))}
                  >
                    <option value={45}>45 Minutes</option>
                    <option value={60}>1 Hour</option>
                    <option value={90}>1.5 Hours</option>
                    <option value={120}>2 Hours</option>
                  </select>
                </label>

                <label>
                  Venue
                  <input
                    value={bracketVenue}
                    maxLength={160}
                    onChange={(e) => setBracketVenue(e.target.value)}
                    placeholder="e.g. Main Ground"
                  />
                </label>

                <label>
                  First Match Starts At
                  <input
                    type="datetime-local"
                    value={bracketStarts}
                    onChange={(e) => setBracketStarts(e.target.value)}
                  />
                </label>
              </div>
            </div>

            {/* Live Schedule Preview */}
            <div className="preview-column">
              <label className="section-label">2. Generated Schedule Preview ({bracketPreview.length} Matches)</label>
              {bracketPreview.length === 0 ? (
                <div className="empty-bracket-hint">
                  <p>Select at least 2 teams on the left to preview generated fixtures.</p>
                </div>
              ) : (
                <div className="preview-matches-list">
                  {bracketPreview.map((m, idx) => (
                    <div key={idx} className="preview-match-item">
                      <div className="match-tag-row">
                        <span className="stage-pill">{m.stage}</span>
                        <span className="time-pill">{formatIST(m.startsAt)}</span>
                      </div>
                      <div className="matchup-preview">
                        <strong>{m.partA}</strong>
                        <span className="vs-tag">vs</span>
                        <strong>{m.partB}</strong>
                      </div>
                      <small className="venue-text">📍 {m.venue}</small>
                    </div>
                  ))}

                  <button
                    type="button"
                    className="primary-action-btn full-width"
                    disabled={bracketPending}
                    onClick={handleBulkSubmit}
                  >
                    {bracketPending ? "Creating All Matches…" : `✓ Create All ${bracketPreview.length} Fixtures`}
                  </button>
                </div>
              )}
            </div>
          </div>
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
            <option value="final">Finals</option>
            <option value="semi">Semi-Finals</option>
            <option value="quarter">Quarter-Finals</option>
            <option value="league">League Matches</option>
          </select>
        </div>
      </div>

      {/* Stadium Fixture Cards Grid */}
      <div className="stadium-fixtures-list">
        {filteredFixtures.length === 0 ? (
          <div className="fixtures-empty-state">
            <h3>No fixtures match your filters</h3>
            <p>
              {fixtures.length === 0
                ? "Click \"+ Quick Match\" or \"Auto-Generate Bracket\" above to schedule your first matches."
                : "Try resetting your search query or status filter."}
            </p>
          </div>
        ) : (
          filteredFixtures.map((f) => {
            const scoreObj = (f.score_payload || {}) as Record<string, unknown>;
            const isLive = f.state === "ongoing" || f.score_status === "live";
            const isCompleted = f.state === "completed" || f.score_status === "final";

            return (
              <article
                key={f.fixture_id}
                className={`stadium-match-card ${isLive ? "is-live" : isCompleted ? "is-completed" : ""}`}
              >
                {/* Top Badge Bar */}
                <div className="stadium-card-top">
                  <div className="stage-and-status">
                    <span className="stadium-stage-tag">{f.stage}</span>
                    <span
                      className={`stadium-status-badge ${isLive ? "live" : isCompleted ? "completed" : "scheduled"}`}
                    >
                      {isLive ? "● LIVE" : isCompleted ? "FINAL" : "SCHEDULED"}
                    </span>
                  </div>

                  <div className="stadium-versions">
                    <span className="v-pill">v{f.schedule_version}</span>
                    {f.score_version > 0 && <span className="v-pill score">Score v{f.score_version}</span>}
                  </div>
                </div>

                {/* Scoreboard Stadium Center */}
                <div className="stadium-matchup-arena">
                  {/* Team A */}
                  <div className="stadium-competitor home">
                    <div className="competitor-avatar">
                      {f.participant_a_label.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="competitor-name">{f.participant_a_label}</span>
                    {scoreTemplate === "cricket" && (
                      <span className="competitor-live-score">
                        {String(scoreObj.teamA_runs ?? "0")}/{String(scoreObj.teamA_wickets ?? "0")}
                        <small>({String(scoreObj.teamA_overs ?? "0")})</small>
                      </span>
                    )}
                    {scoreTemplate === "football" && (
                      <span className="competitor-live-score big">
                        {String(scoreObj.teamA_goals ?? "0")}
                      </span>
                    )}
                  </div>

                  {/* Center VS or Score Divider */}
                  <div className="stadium-center-vs">
                    <span className="vs-badge">VS</span>
                    <span className="start-time-pill">{formatIST(f.starts_at)}</span>
                  </div>

                  {/* Team B */}
                  <div className="stadium-competitor away">
                    {scoreTemplate === "football" && (
                      <span className="competitor-live-score big">
                        {String(scoreObj.teamB_goals ?? "0")}
                      </span>
                    )}
                    {scoreTemplate === "cricket" && (
                      <span className="competitor-live-score">
                        {String(scoreObj.teamB_runs ?? "0")}/{String(scoreObj.teamB_wickets ?? "0")}
                        <small>({String(scoreObj.teamB_overs ?? "0")})</small>
                      </span>
                    )}
                    <span className="competitor-name">{f.participant_b_label}</span>
                    <div className="competitor-avatar">
                      {f.participant_b_label.slice(0, 2).toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Badminton / Generic / Summary Row */}
                {Boolean(scoreObj.summary) && (
                  <div className="match-summary-banner">
                    {String(scoreObj.summary)}
                  </div>
                )}
                {scoreTemplate === "badminton" && Object.keys(scoreObj).length > 0 && (
                  <div className="badminton-sets-strip">
                    <span>Set 1: {String(scoreObj.set1 || "—")}</span>
                    <span>Set 2: {String(scoreObj.set2 || "—")}</span>
                    <span>Set 3: {String(scoreObj.set3 || "—")}</span>
                    {Boolean(scoreObj.winner) && <strong>Winner: {String(scoreObj.winner)}</strong>}
                  </div>
                )}

                {/* Stadium Metadata Strip */}
                <div className="stadium-meta-strip">
                  <span className="meta-item">
                    📍 <strong>{f.venue || "Venue TBA"}</strong>
                  </span>
                  <span className="meta-item">
                    ⏱️ Reporting: {formatIST(f.reporting_at)}
                  </span>
                </div>

                {/* Thumb-Friendly Stadium Actions */}
                <div className="stadium-actions-strip">
                  <button
                    type="button"
                    className="action-icon-btn score-primary"
                    onClick={() => openScoreModal(f)}
                    title="Quick Score Entry"
                  >
                    ⚡ Score
                  </button>

                  <Link
                    href={`/scorer?fixture=${encodeURIComponent(f.fixture_id)}`}
                    className="action-icon-btn scorer-link"
                    title="Ground Scorer"
                  >
                    📱 Scorer App
                  </Link>

                  <button
                    type="button"
                    className="action-icon-btn"
                    onClick={() => openReschedule(f)}
                    title="Reschedule Match"
                  >
                    🕒 Reschedule
                  </button>

                  <button
                    type="button"
                    className="action-icon-btn"
                    title="Send participant reminder notifications"
                    onClick={() => {
                      setReminderFixture(f);
                      setReminderBody(
                        `Reminder: ${f.stage} between ${f.participant_a_label} and ${f.participant_b_label} starts at ${formatIST(f.starts_at)} at ${f.venue ?? "the venue"}.`
                      );
                    }}
                  >
                    🔔 Remind
                  </button>

                  <button
                    type="button"
                    className="action-icon-btn"
                    onClick={() => openHistory(f)}
                    title="Audit History"
                  >
                    📜 History
                  </button>

                  {isMainAdmin && (
                    <button
                      type="button"
                      className="action-icon-btn"
                      onClick={() => void forceReleaseScorer(f.fixture_id)}
                      title="Release Scorer Device"
                    >
                      🔄 Scorer Lock
                    </button>
                  )}

                  <button
                    type="button"
                    className="action-icon-btn danger"
                    onClick={() => setDeleteFixtureTarget(f)}
                    title="Delete Fixture"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

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
                {deleteFixtureTarget.stage}: {deleteFixtureTarget.participant_a_label} vs{" "}
                {deleteFixtureTarget.participant_b_label}
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
              Match: <strong>{historyFixture.participant_a_label}</strong> vs{" "}
              <strong>{historyFixture.participant_b_label}</strong> ({historyFixture.stage})
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
              <strong>{reminderFixture.stage}</strong> ({reminderFixture.participant_a_label} vs{" "}
              {reminderFixture.participant_b_label}).
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
