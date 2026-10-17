"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUploadWidget } from "@/components/admin/image-upload-widget";

type ApplicationQuestion = {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: string[];
};

type EventData = {
  event_id: string;
  title: string;
  category: string;
  format: string;
  score_template: string;
  state: string;
  summary: string;
  rules_markdown: string;
  venue: string | null;
  application_capacity: number | null;
  waitlist_enabled: boolean;
  application_opens_at: string | null;
  application_closes_at: string | null;
  roster_lock_at: string | null;
  reporting_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
  eligibility: Record<string, unknown>;
  application_questions: ApplicationQuestion[];
  group_min_size: number | null;
  group_max_size: number | null;
  batch_restricted: boolean;
  poster_url: string | null;
};

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  // Interpret datetime-local as Asia/Kolkata (+05:30)
  // The input is YYYY-MM-DDTHH:mm — we treat it as IST and convert to UTC ISO
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [year, month, day] = datePart.split("-").map(Number);
  const [hours, minutes] = timePart.split(":").map(Number);
  // IST = UTC + 5:30, so subtract 5h30m to get UTC
  const localMs = Date.UTC(year, month - 1, day, hours - 5, minutes - 30);
  return new Date(localMs).toISOString();
}

const LIFECYCLE_ACTIONS: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: "Publish", next: "published" }],
  published: [{ label: "Open registrations", next: "open" }, { label: "Cancel", next: "cancelled" }],
  open: [{ label: "Close registrations", next: "closed" }, { label: "Cancel", next: "cancelled" }],
  closed: [{ label: "Open registrations again", next: "open" }, { label: "Cancel", next: "cancelled" }],
  ongoing: [{ label: "Mark completed", next: "completed" }, { label: "Cancel", next: "cancelled" }],
  completed: [],
  cancelled: [],
};

function stateColor(state: string): string {
  switch (state) {
    case "draft": return "#705c5a";
    case "published": return "#2563eb";
    case "open": return "#16a34a";
    case "closed": return "#dc2626";
    case "ongoing": return "#d97706";
    case "completed": return "#6d28d9";
    case "cancelled": return "#80524d";
    default: return "#705c5a";
  }
}

export function EventEditor({ events }: { events: EventData[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(events[0]?.event_id ?? "");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "timing" | "questions" | "lifecycle">("content");

  // Get the live event record (always reflect current selection)
  const current = events.find((e) => e.event_id === selectedId);

  // All form fields — always initialized from current event when selection changes
  const [title, setTitle] = useState(current?.title ?? "");
  const [summary, setSummary] = useState(current?.summary ?? "");
  const [rules, setRules] = useState(current?.rules_markdown ?? "");
  const [venue, setVenue] = useState(current?.venue ?? "");
  const [capacity, setCapacity] = useState(current?.application_capacity?.toString() ?? "");
  const [waitlistEnabled, setWaitlistEnabled] = useState(current?.waitlist_enabled ?? false);
  const [applicationOpensAt, setApplicationOpensAt] = useState(toDatetimeLocal(current?.application_opens_at ?? null));
  const [applicationClosesAt, setApplicationClosesAt] = useState(toDatetimeLocal(current?.application_closes_at ?? null));
  const [rosterLockAt, setRosterLockAt] = useState(toDatetimeLocal(current?.roster_lock_at ?? null));
  const [reportingAt, setReportingAt] = useState(toDatetimeLocal(current?.reporting_at ?? null));
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(current?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toDatetimeLocal(current?.ends_at ?? null));
  const [groupMinSize, setGroupMinSize] = useState(current?.group_min_size?.toString() ?? "");
  const [groupMaxSize, setGroupMaxSize] = useState(current?.group_max_size?.toString() ?? "");
  const [batchRestricted, setBatchRestricted] = useState(current?.batch_restricted ?? false);
  const [posterUrl, setPosterUrl] = useState(current?.poster_url ?? "");
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(current?.application_questions ?? []);
  const [newQuestion, setNewQuestion] = useState({ key: "", label: "", type: "text" as "text" | "select", required: false, options: "" });

  function selectEvent(id: string) {
    const e = events.find((ev) => ev.event_id === id);
    if (!e) return;
    setSelectedId(id);
    setTitle(e.title);
    setSummary(e.summary);
    setRules(e.rules_markdown);
    setVenue(e.venue ?? "");
    setCapacity(e.application_capacity?.toString() ?? "");
    setWaitlistEnabled(e.waitlist_enabled);
    setApplicationOpensAt(toDatetimeLocal(e.application_opens_at));
    setApplicationClosesAt(toDatetimeLocal(e.application_closes_at));
    setRosterLockAt(toDatetimeLocal(e.roster_lock_at));
    setReportingAt(toDatetimeLocal(e.reporting_at));
    setStartsAt(toDatetimeLocal(e.starts_at));
    setEndsAt(toDatetimeLocal(e.ends_at));
    setGroupMinSize(e.group_min_size?.toString() ?? "");
    setGroupMaxSize(e.group_max_size?.toString() ?? "");
    setBatchRestricted(e.batch_restricted);
    setPosterUrl(e.poster_url ?? "");
    setQuestions(e.application_questions ?? []);
    setMessage(null);
  }

  async function post(body: Record<string, unknown>) {
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/festival", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (res.ok) {
        setMessage({ text: "Saved successfully.", isError: false });
        router.refresh();
        return true;
      }
      setMessage({ text: json.error ?? "Could not save.", isError: true });
      return false;
    } catch {
      setMessage({ text: "Network error. Please try again.", isError: true });
      return false;
    } finally {
      setPending(false);
    }
  }

  async function saveContent() {
    if (!current) return;
    // Build application_questions from state
    await post({
      action: "updateEventFull",
      eventId: selectedId,
      title: title.trim(),
      summary: summary.trim(),
      rules: rules.trim(),
      venue: venue.trim(),
      capacity: capacity ? Number(capacity) : null,
      waitlistEnabled,
      applicationOpensAt: fromDatetimeLocal(applicationOpensAt),
      applicationClosesAt: fromDatetimeLocal(applicationClosesAt),
      rosterLockAt: fromDatetimeLocal(rosterLockAt),
      reportingAt: fromDatetimeLocal(reportingAt),
      startsAt: fromDatetimeLocal(startsAt),
      endsAt: fromDatetimeLocal(endsAt),
      eligibility: current.eligibility ?? {},
      applicationQuestions: questions,
      groupMinSize: groupMinSize ? Number(groupMinSize) : null,
      groupMaxSize: groupMaxSize ? Number(groupMaxSize) : null,
      batchRestricted,
      posterUrl: posterUrl.trim() || null,
    });
  }

  async function setLifecycleState(state: string) {
    await post({ action: "setEventState", eventId: selectedId, state });
  }

  function addQuestion() {
    const key = newQuestion.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || !newQuestion.label.trim()) return;
    if (questions.some((q) => q.key === key)) {
      setMessage({ text: "A question with this key already exists.", isError: true });
      return;
    }
    setQuestions([...questions, {
      key,
      label: newQuestion.label.trim(),
      type: newQuestion.type,
      required: newQuestion.required,
      options: newQuestion.type === "select" ? newQuestion.options.split("\n").map((o) => o.trim()).filter(Boolean) : undefined,
    }]);
    setNewQuestion({ key: "", label: "", type: "text", required: false, options: "" });
  }

  function removeQuestion(key: string) {
    setQuestions(questions.filter((q) => q.key !== key));
  }

  if (!events.length) {
    return (
      <section className="control-panel editor-empty">
        <p className="eyebrow">Event editor</p>
        <h1>No events yet.</h1>
        <p className="control-copy">Create a draft event in Festival Setup before editing it here.</p>
      </section>
    );
  }

  return (
    <section className="event-editor">
      <div className="editor-header">
        <div>
          <p className="eyebrow">Event editor</p>
          <h1>{current?.title ?? "Choose an event"}</h1>
          {current && (
            <span className="editor-state-badge" style={{ background: stateColor(current.state) }}>
              {current.state}
            </span>
          )}
        </div>
        <label className="editor-event-select">
          <span>Event</span>
          <select
            value={selectedId}
            onChange={(e) => selectEvent(e.target.value)}
            disabled={pending}
          >
            {events.map((ev) => (
              <option key={ev.event_id} value={ev.event_id}>
                {ev.title} · {ev.state}
              </option>
            ))}
          </select>
        </label>
      </div>

      {current && (
        <>
          <nav className="editor-tabs" aria-label="Editor sections">
            {(["content", "timing", "questions", "lifecycle"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? "editor-tab active" : "editor-tab"}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "content" ? "Content & rules" : tab === "timing" ? "Schedule & timing" : tab === "questions" ? "Registration questions" : "Lifecycle"}
              </button>
            ))}
          </nav>

          {activeTab === "content" && (
            <div className="editor-section">
              <div className="editor-hint">
                <p>Fields marked with ✦ are required before publishing. Saving here does not change the event state.</p>
              </div>
              <label>
                Title ✦
                <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required />
              </label>
              <div className="poster-field-group">
                <label>
                  Event Poster / Banner Image
                  <ImageUploadWidget
                    folder="posters"
                    onUploadSuccess={(url) => setPosterUrl(url)}
                    label="Upload Poster (Auto-Compress to WebP)"
                  />
                  <input
                    type="url"
                    value={posterUrl}
                    onChange={(e) => setPosterUrl(e.target.value)}
                    maxLength={1000}
                    placeholder="https://... or paste any external image link"
                  />
                  <small>Displayed prominently on the event details page and schedule cards.</small>
                </label>
                {posterUrl && (
                  <div className="poster-preview-card">
                    <div className="poster-preview-thumb">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={posterUrl}
                        alt="Event poster banner preview"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.opacity = "0.3";
                        }}
                      />
                    </div>
                    <div className="poster-preview-info">
                      <span>✦ Active Poster Banner</span>
                      <button
                        type="button"
                        onClick={() => setPosterUrl("")}
                      >
                        Remove poster
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <label>
                Summary <span className="char-count">{summary.length}/600</span>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  maxLength={600}
                  rows={3}
                  placeholder="Short public description shown on the event card."
                />
              </label>
              <label>
                Rules ✦ <span className="char-count">{rules.length}/20000</span>
                <textarea
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  maxLength={20000}
                  rows={10}
                  placeholder="Paste or type the official event rules. Markdown is preserved."
                />
              </label>
              <label>
                Venue ✦
                <input value={venue} onChange={(e) => setVenue(e.target.value)} maxLength={160} placeholder="Room number, ground, or area" />
              </label>
              <div className="field-pair">
                <label>
                  Capacity
                  <input
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="Leave blank for unlimited"
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={waitlistEnabled}
                    onChange={(e) => setWaitlistEnabled(e.target.checked)}
                  />
                  Enable waitlist when full
                </label>
              </div>
              <div className="field-pair">
                <label>
                  Format
                  <div className="readonly-field">{current.format}</div>
                </label>
                <label>
                  Category
                  <div className="readonly-field">{current.category}</div>
                </label>
              </div>
              <div className="field-pair">
                <label>
                  Score template
                  <div className="readonly-field">{current.score_template}</div>
                </label>
                <label>
                  Edition
                  <div className="readonly-field">Fixed at creation</div>
                </label>
              </div>
              <fieldset className="group-rules">
                <legend>Group / squad rules</legend>
                <div className="field-pair">
                  <label>
                    Min group size
                    <input type="number" min={1} value={groupMinSize} onChange={(e) => setGroupMinSize(e.target.value)} placeholder="Optional" />
                  </label>
                  <label>
                    Max group size
                    <input type="number" min={1} value={groupMaxSize} onChange={(e) => setGroupMaxSize(e.target.value)} placeholder="Optional" />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input type="checkbox" checked={batchRestricted} onChange={(e) => setBatchRestricted(e.target.checked)} />
                  Restrict squads to one batch (sports events)
                </label>
              </fieldset>
              <button
                type="button"
                className="primary-control"
                disabled={pending || !title.trim()}
                onClick={() => void saveContent()}
              >
                {pending ? "Saving…" : "Save all content"}
              </button>
            </div>
          )}

          {activeTab === "timing" && (
            <div className="editor-section">
              <div className="editor-hint">
                <p>All times are interpreted as Indian Standard Time (IST, UTC+5:30). Registration window is required before opening applications.</p>
              </div>
              <div className="field-pair">
                <label>
                  Registration opens ✦
                  <input
                    type="datetime-local"
                    value={applicationOpensAt}
                    onChange={(e) => setApplicationOpensAt(e.target.value)}
                  />
                </label>
                <label>
                  Registration closes ✦
                  <input
                    type="datetime-local"
                    value={applicationClosesAt}
                    onChange={(e) => setApplicationClosesAt(e.target.value)}
                  />
                </label>
              </div>
              <div className="field-pair">
                <label>
                  Roster lock
                  <input
                    type="datetime-local"
                    value={rosterLockAt}
                    onChange={(e) => setRosterLockAt(e.target.value)}
                  />
                  <small>Students cannot withdraw after this time.</small>
                </label>
                <label>
                  Reporting time
                  <input
                    type="datetime-local"
                    value={reportingAt}
                    onChange={(e) => setReportingAt(e.target.value)}
                  />
                </label>
              </div>
              <div className="field-pair">
                <label>
                  Event start
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </label>
                <label>
                  Event end
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="primary-control"
                disabled={pending || !title.trim()}
                onClick={() => void saveContent()}
              >
                {pending ? "Saving…" : "Save all timing"}
              </button>
            </div>
          )}

          {activeTab === "questions" && (
            <div className="editor-section">
              <div className="editor-hint">
                <p>Registration questions are shown to students when they apply. Answers are stored per application. Save content to persist changes.</p>
              </div>
              {questions.length > 0 && (
                <ul className="question-list">
                  {questions.map((q) => (
                    <li key={q.key} className="question-row">
                      <div>
                        <strong>{q.label}</strong>
                        <span>{q.type} · key: {q.key}{q.required ? " · required" : ""}</span>
                        {q.options && <span>{q.options.join(", ")}</span>}
                      </div>
                      <button
                        type="button"
                        className="revoke-button"
                        onClick={() => removeQuestion(q.key)}
                        disabled={pending}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <fieldset className="new-question-form">
                <legend>Add question</legend>
                <div className="field-pair">
                  <label>
                    Display label
                    <input
                      value={newQuestion.label}
                      onChange={(e) => setNewQuestion({ ...newQuestion, label: e.target.value })}
                      placeholder="e.g. Roll number in your batch"
                      maxLength={200}
                    />
                  </label>
                  <label>
                    Field key
                    <input
                      value={newQuestion.key}
                      onChange={(e) => setNewQuestion({ ...newQuestion, key: e.target.value })}
                      placeholder="e.g. roll_number"
                      maxLength={80}
                    />
                  </label>
                </div>
                <div className="field-pair">
                  <label>
                    Type
                    <select
                      value={newQuestion.type}
                      onChange={(e) => setNewQuestion({ ...newQuestion, type: e.target.value as "text" | "select" })}
                    >
                      <option value="text">Text (free response)</option>
                      <option value="select">Select (fixed options)</option>
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newQuestion.required}
                      onChange={(e) => setNewQuestion({ ...newQuestion, required: e.target.checked })}
                    />
                    Required to apply
                  </label>
                </div>
                {newQuestion.type === "select" && (
                  <label>
                    Options (one per line)
                    <textarea
                      value={newQuestion.options}
                      onChange={(e) => setNewQuestion({ ...newQuestion, options: e.target.value })}
                      rows={4}
                      placeholder={"Option A\nOption B\nOption C"}
                    />
                  </label>
                )}
                <button type="button" className="primary-control" onClick={addQuestion}>
                  Add question
                </button>
              </fieldset>
              <button
                type="button"
                className="primary-control"
                disabled={pending || !title.trim()}
                onClick={() => void saveContent()}
              >
                {pending ? "Saving…" : "Save questions"}
              </button>
            </div>
          )}

          {activeTab === "lifecycle" && (
            <div className="editor-section">
              <div className="editor-hint lifecycle-state">
                <p>Current state: <strong style={{ color: stateColor(current.state) }}>{current.state}</strong></p>
                <p>Publishing requires: summary, venue, and rules to be set. Opening requires registration window times.</p>
              </div>
              <div className="lifecycle-actions">
                {(LIFECYCLE_ACTIONS[current.state] ?? []).map(({ label, next }) => (
                  <button
                    key={next}
                    type="button"
                    className={next === "cancelled" ? "revoke-button lifecycle-btn" : "primary-control lifecycle-btn"}
                    disabled={pending}
                    onClick={() => void setLifecycleState(next)}
                  >
                    {pending ? "Working…" : label}
                  </button>
                ))}
                {(LIFECYCLE_ACTIONS[current.state] ?? []).length === 0 && (
                  <p className="control-copy">No lifecycle actions are available for a {current.state} event.</p>
                )}
              </div>
              <div className="readiness-check">
                <p className="eyebrow">Readiness checks</p>
                <ul>
                  <li className={current.summary ? "check-pass" : "check-fail"}>Summary {current.summary ? "✓" : "✗ required"}</li>
                  <li className={current.venue ? "check-pass" : "check-fail"}>Venue {current.venue ? "✓" : "✗ required"}</li>
                  <li className={current.rules_markdown ? "check-pass" : "check-fail"}>Rules {current.rules_markdown ? "✓" : "✗ required"}</li>
                  <li className={current.application_opens_at ? "check-pass" : "check-warn"}>Registration opens {current.application_opens_at ? "✓" : "⚠ needed to open"}</li>
                  <li className={current.application_closes_at ? "check-pass" : "check-warn"}>Registration closes {current.application_closes_at ? "✓" : "⚠ needed to open"}</li>
                  <li className={current.roster_lock_at ? "check-pass" : "check-warn"}>Roster lock {current.roster_lock_at ? "✓" : "— optional"}</li>
                  <li className={current.starts_at ? "check-pass" : "check-warn"}>Start time {current.starts_at ? "✓" : "— optional"}</li>
                </ul>
              </div>
            </div>
          )}
        </>
      )}

      {message && (
        <p className={`control-message ${message.isError ? "error-message" : ""}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
