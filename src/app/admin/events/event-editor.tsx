"use client";

import { useMemo, useState } from "react";
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
  starts_at: string | null;
  eligibility: Record<string, unknown>;
  application_questions: ApplicationQuestion[];
  group_min_size: number | null;
  group_max_size: number | null;
  batch_restricted: boolean;
  poster_url: string | null;
};

type EditionData = {
  edition_id: string;
  name: string;
  status: string;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
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

export function EventEditor({ events, editions, isAdmin = true }: { events: EventData[]; editions: EditionData[]; isAdmin?: boolean }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(events[0]?.event_id ?? "");
  const [eventSearch, setEventSearch] = useState("");
  const [eventStateFilter, setEventStateFilter] = useState("all");
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [activeTab, setActiveTab] = useState<"content" | "timing" | "questions">("content");
  const [editionId, setEditionId] = useState(editions[0]?.edition_id ?? "");
  const selectedEdition = editions.find((edition) => edition.edition_id === editionId) ?? editions[0];
  const [globalOpensAt, setGlobalOpensAt] = useState(toDatetimeLocal(selectedEdition?.registration_opens_at ?? null));
  const [globalClosesAt, setGlobalClosesAt] = useState(toDatetimeLocal(selectedEdition?.registration_closes_at ?? null));
  const [newEvent, setNewEvent] = useState({ title: "", category: "sport", format: "sport", scoreTemplate: "generic", division: "open" });

  // Get the live event record (always reflect current selection)
  const current = events.find((e) => e.event_id === selectedId);

  // All form fields — always initialized from current event when selection changes
  const [title, setTitle] = useState(current?.title ?? "");
  const [summary, setSummary] = useState(current?.summary ?? "");
  const [rules, setRules] = useState(current?.rules_markdown ?? "");
  const [venue, setVenue] = useState(current?.venue ?? "");
  const [capacity, setCapacity] = useState(current?.application_capacity?.toString() ?? "");
  const [waitlistEnabled, setWaitlistEnabled] = useState(current?.waitlist_enabled ?? false);
  const [startsAt, setStartsAt] = useState(toDatetimeLocal(current?.starts_at ?? null));
  const [groupMinSize, setGroupMinSize] = useState(current?.group_min_size?.toString() ?? "");
  const [groupMaxSize, setGroupMaxSize] = useState(current?.group_max_size?.toString() ?? "");
  const [batchRestricted, setBatchRestricted] = useState(current?.batch_restricted ?? false);
  const [posterUrl, setPosterUrl] = useState(current?.poster_url ?? "");
  const [questions, setQuestions] = useState<ApplicationQuestion[]>(current?.application_questions ?? []);
  const [division, setDivision] = useState(String(current?.eligibility?.division ?? "open"));
  const [newQuestion, setNewQuestion] = useState({ label: "", required: false });
  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    return events.filter((event) => {
      if (eventStateFilter !== "all" && event.state !== eventStateFilter) return false;
      return !query || `${event.title} ${event.category} ${event.format} ${event.state}`.toLowerCase().includes(query);
    });
  }, [eventSearch, eventStateFilter, events]);

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
    setStartsAt(toDatetimeLocal(e.starts_at));
    setGroupMinSize(e.group_min_size?.toString() ?? "");
    setGroupMaxSize(e.group_max_size?.toString() ?? "");
    setBatchRestricted(e.batch_restricted);
    setPosterUrl(e.poster_url ?? "");
    setQuestions(e.application_questions ?? []);
    setDivision(String(e.eligibility?.division ?? "open"));
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

  async function changeEventState(newState: string) {
    if (!current) return;
    const ok = await post({
      action: "setEventState",
      eventId: selectedId,
      state: newState,
    });
    if (ok) {
      setMessage({
        text: newState === "open"
          ? "Event approved and opened for student registrations!"
          : `Event state set to ${newState}.`,
        isError: false,
      });
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
      startsAt: fromDatetimeLocal(startsAt),
      eligibility: { ...(current.eligibility ?? {}), division },
      applicationQuestions: questions,
      groupMinSize: groupMinSize ? Number(groupMinSize) : null,
      groupMaxSize: groupMaxSize ? Number(groupMaxSize) : null,
      batchRestricted,
      posterUrl: posterUrl.trim() || null,
    });
  }

  function addQuestion() {
    if (!newQuestion.label.trim()) return;
    const key = `question_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
    setQuestions([...questions, {
      key,
      label: newQuestion.label.trim(),
      type: "text",
      required: newQuestion.required,
    }]);
    setNewQuestion({ label: "", required: false });
  }

  function removeQuestion(key: string) {
    setQuestions(questions.filter((q) => q.key !== key));
  }

  function selectEdition(id: string) {
    setEditionId(id);
    const edition = editions.find((item) => item.edition_id === id);
    setGlobalOpensAt(toDatetimeLocal(edition?.registration_opens_at ?? null));
    setGlobalClosesAt(toDatetimeLocal(edition?.registration_closes_at ?? null));
  }

  async function saveRegistrationWindow() {
    const opensAt = fromDatetimeLocal(globalOpensAt);
    const closesAt = fromDatetimeLocal(globalClosesAt);
    if (!opensAt || !closesAt) {
      setMessage({ text: "Choose both registration dates.", isError: true });
      return;
    }
    await post({ action: "setRegistrationWindow", editionId, applicationOpensAt: opensAt, applicationClosesAt: closesAt });
  }

  async function createEvent() {
    const created = await post({
      action: "createEvent",
      editionId,
      title: newEvent.title,
      category: newEvent.category,
      format: newEvent.format,
      scoreTemplate: newEvent.scoreTemplate,
      division: newEvent.division,
      summary: "",
      venue: "",
      capacity: null,
      startsAt: null,
      posterUrl: null,
    });
    if (created) {
      setNewEvent({ title: "", category: "sport", format: "sport", scoreTemplate: "generic", division: "open" });
      setMessage({
        text: isAdmin
          ? "Event created successfully and open for registrations."
          : "Event proposed in Draft state! Fill in its rules, venue and poster below. It will go live once approved by Main Admin.",
        isError: false,
      });
    }
  }

  return (
    <section className="event-editor">
      <div className="editor-management-grid">
        {isAdmin && (
          <section className="control-panel editor-management-card">
            <p className="eyebrow">One registration window</p>
            <h2>Festival registrations</h2>
            <p className="control-copy">These dates apply to every event. Registrations are currently open for testing.</p>
            <label>Festival edition
              <select value={editionId} onChange={(event) => selectEdition(event.target.value)} disabled={pending}>
                {editions.map((edition) => <option key={edition.edition_id} value={edition.edition_id}>{edition.name}</option>)}
              </select>
            </label>
            <div className="field-pair">
              <label>Opens<input type="datetime-local" value={globalOpensAt} onChange={(event) => setGlobalOpensAt(event.target.value)} /></label>
              <label>Closes<input type="datetime-local" value={globalClosesAt} onChange={(event) => setGlobalClosesAt(event.target.value)} /></label>
            </div>
            <button type="button" className="primary-control" disabled={pending || !editionId} onClick={() => void saveRegistrationWindow()}>
              {pending ? "Saving…" : "Save for every event"}
            </button>
          </section>
        )}

        <section className="control-panel editor-management-card">
          <p className="eyebrow">{isAdmin ? "Event catalogue" : "Propose Event"}</p>
          <h2>{isAdmin ? "Create event" : "Propose new event"}</h2>
          <p className="control-copy">
            {isAdmin
              ? "Create it here, then complete its content and timing below."
              : "Propose a new event. It will be created as a Draft for your coordination, ready for admin review."}
          </p>
          <label>Event title<input value={newEvent.title} onChange={(event) => setNewEvent({ ...newEvent, title: event.target.value })} maxLength={160} placeholder="e.g. Inter-batch Cricket" /></label>
          <div className="field-pair">
            <label>Category<select value={newEvent.category} onChange={(event) => setNewEvent({ ...newEvent, category: event.target.value })}><option value="sport">Sport</option><option value="cultural">Cultural</option><option value="literary">Literary</option><option value="creative">Creative</option><option value="other">Other</option></select></label>
            <label>Format<select value={newEvent.format} onChange={(event) => setNewEvent({ ...newEvent, format: event.target.value })}><option value="sport">Sport</option><option value="solo">Solo</option><option value="pair">Pair</option><option value="group">Group</option></select></label>
          </div>
          <div className="field-pair">
            <label>Division<select value={newEvent.division} onChange={(event) => setNewEvent({ ...newEvent, division: event.target.value })}><option value="open">Open / mixed</option><option value="boys">Boys</option><option value="girls">Girls</option></select></label>
            <label>Score template<select value={newEvent.scoreTemplate} onChange={(event) => setNewEvent({ ...newEvent, scoreTemplate: event.target.value })}><option value="generic">Generic</option><option value="cricket">Cricket</option><option value="football">Football</option><option value="badminton">Badminton</option></select></label>
          </div>
          <button type="button" className="primary-control" disabled={pending || !newEvent.title.trim() || !editionId} onClick={() => void createEvent()}>
            {pending ? "Creating…" : isAdmin ? "Create event" : "Propose event (Draft)"}
          </button>
        </section>
      </div>

      {!events.length ? (
        <section className="control-panel editor-empty">
          <p className="eyebrow">Event editor</p>
          <h1>No events yet.</h1>
          <p className="control-copy">{isAdmin ? "Create the first event above." : "Propose your first event above."}</p>
        </section>
      ) : <>
      <div className="editor-header">
        <div>
          <p className="eyebrow">{isAdmin ? "Event editor" : "Assigned Event"}</p>
          <h1>{current?.title ?? "Choose an event"}</h1>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.5rem", flexWrap: "wrap" }}>
            {current && (
              <span
                className="editor-state-badge"
                style={{
                  background: current.state === "draft" ? "#b45309" : stateColor(current.state),
                  color: "#fff",
                  fontWeight: 600,
                  letterSpacing: "0.03em",
                }}
              >
                {current.state === "draft" ? "Draft · Needs Admin Approval" : current.state}
              </span>
            )}
            {isAdmin && current && (
              <div style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center", marginLeft: "0.5rem" }}>
                {current.state === "draft" && (
                  <button
                    type="button"
                    style={{
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      padding: "0.25rem 0.75rem",
                      borderRadius: "6px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: "0.82rem",
                    }}
                    disabled={pending}
                    onClick={() => void changeEventState("open")}
                  >
                    ✓ Approve & Open Event
                  </button>
                )}
                <label style={{ fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span style={{ color: "var(--muted, #94a3b8)" }}>Change status:</span>
                  <select
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      color: "inherit",
                      border: "1px solid rgba(255,255,255,0.2)",
                      borderRadius: "4px",
                      padding: "0.2rem 0.5rem",
                      fontSize: "0.8rem",
                    }}
                    value={current.state}
                    disabled={pending}
                    onChange={(e) => void changeEventState(e.target.value)}
                  >
                    <option value="draft">draft</option>
                    <option value="published">published</option>
                    <option value="open">open</option>
                    <option value="closed">closed</option>
                    <option value="cancelled">cancelled</option>
                  </select>
                </label>
              </div>
            )}
          </div>
        </div>
        <div className="editor-event-filters">
          <label>
            <span>Search events</span>
            <input type="search" value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} placeholder="Search title or category" />
          </label>
          <label>
            <span>Status</span>
            <select value={eventStateFilter} onChange={(event) => setEventStateFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {[...new Set(events.map((event) => event.state))].map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
        <label className="editor-event-select">
          <span>Choose event</span>
          <select
            value={selectedId}
            onChange={(e) => selectEvent(e.target.value)}
            disabled={pending}
          >
            {filteredEvents.map((ev) => (
              <option key={ev.event_id} value={ev.event_id}>
                {ev.title} · {ev.state}{ev.state === "draft" ? " [Needs Approval]" : ""}
              </option>
            ))}
          </select>
        </label>
        </div>
      </div>

      {current && (
        <>
          <nav className="editor-tabs" aria-label="Editor sections">
            {(["content", "timing", "questions"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={activeTab === tab ? "editor-tab active" : "editor-tab"}
                onClick={() => setActiveTab(tab)}
              >
                {tab === "content" ? "Content & rules" : tab === "timing" ? "Event timing" : "Registration questions"}
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
              <label>
                Gender division
                <select value={division} onChange={(event) => setDivision(event.target.value)}>
                  <option value="open">Open / mixed</option>
                  <option value="boys">Boys</option>
                  <option value="girls">Girls</option>
                </select>
                <small>Matched against the gender saved during student sign-up.</small>
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
                <p>Event start is interpreted as Indian Standard Time (IST, UTC+5:30). Registration dates are managed once for the full festival above.</p>
              </div>
              <label>
                Event start
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
              </label>
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
                <p>Add only event-specific questions. Name, roll number, batch, phone and gender already come from the verified profile.</p>
              </div>
              {questions.length > 0 && (
                <ul className="question-list">
                  {questions.map((q) => (
                    <li key={q.key} className="question-row">
                      <div>
                        <strong>{q.label}</strong>
                        <span>{q.required ? "Required" : "Optional"}</span>
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
                <label>
                  Question
                  <input
                    value={newQuestion.label}
                    onChange={(e) => setNewQuestion({ ...newQuestion, label: e.target.value })}
                    placeholder="e.g. Which song will you perform?"
                    maxLength={200}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newQuestion.required}
                    onChange={(e) => setNewQuestion({ ...newQuestion, required: e.target.checked })}
                  />
                  Required to apply
                </label>
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

        </>
      )}

      </>}

      {message && (
        <p className={`control-message ${message.isError ? "error-message" : ""}`} role="status">
          {message.text}
        </p>
      )}
    </section>
  );
}
