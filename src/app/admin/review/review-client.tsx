"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type ApplicationRow = {
  application_id: string;
  student_id: string;
  full_name: string;
  batch_label: string;
  course_label: string | null;
  roll_canonical: string;
  review_state: "submitted" | "approved" | "waitlisted" | "rejected" | "withdrawn";
  selection_state: "unselected" | "selected" | "reserve" | "not_selected" | "removed";
  answers: Record<string, string> | null;
  review_reason: string | null;
  submitted_at: string;
};

type EventMeta = {
  id: string;
  title: string;
  category: string;
  format: "solo" | "pair" | "group" | "sport";
  state: string;
};

export function ReviewClient({
  event,
  applications,
}: {
  event: EventMeta;
  applications: ApplicationRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [reviewFilter, setReviewFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Individual action state
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{ id?: string; text: string; isError?: boolean } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Bulk action state
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [showBulkRejectModal, setShowBulkRejectModal] = useState(false);

  // Batches present in the list
  const batches = useMemo(() => {
    const set = new Set<string>();
    applications.forEach((a) => {
      if (a.batch_label) set.add(a.batch_label);
    });
    return Array.from(set).sort();
  }, [applications]);

  // Filtered rows
  const filtered = useMemo(() => {
    return applications.filter((app) => {
      if (reviewFilter !== "all" && app.review_state !== reviewFilter) return false;
      if (batchFilter !== "all" && app.batch_label !== batchFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesName = app.full_name.toLowerCase().includes(query);
        const matchesRoll = app.roll_canonical.toLowerCase().includes(query);
        const matchesBatch = app.batch_label.toLowerCase().includes(query);
        if (!matchesName && !matchesRoll && !matchesBatch) return false;
      }
      return true;
    });
  }, [applications, reviewFilter, batchFilter, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((app) => selectedIds.has(app.application_id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((app) => app.application_id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAnswers(id: string) {
    setExpandedAnswers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Single review submit
  async function submitReview(applicationId: string, state: "approved" | "waitlisted" | "rejected") {
    const reason = reasonMap[applicationId]?.trim() || "";
    if (state === "rejected" && !reason) {
      setStatusMessage({ id: applicationId, text: "A reason is required when rejecting an application.", isError: true });
      return;
    }
    setPendingId(applicationId);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/applications/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, state, reason }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ id: applicationId, text: `Application marked ${state}.` });
        router.refresh();
      } else {
        setStatusMessage({ id: applicationId, text: data.error ?? "Failed to save review.", isError: true });
      }
    } catch {
      setStatusMessage({ id: applicationId, text: "Network error saving review.", isError: true });
    } finally {
      setPendingId(null);
    }
  }

  // Single solo selection submit
  async function submitSoloSelection(applicationId: string, state: "selected" | "reserve" | "not_selected") {
    setPendingId(applicationId);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/applications/selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, state }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ id: applicationId, text: `Participant selection updated to ${state}.` });
        router.refresh();
      } else {
        setStatusMessage({ id: applicationId, text: data.error ?? "Failed to save selection.", isError: true });
      }
    } catch {
      setStatusMessage({ id: applicationId, text: "Network error saving selection.", isError: true });
    } finally {
      setPendingId(null);
    }
  }

  // Bulk review submit
  async function submitBulkReview(state: "approved" | "waitlisted" | "rejected") {
    if (selectedIds.size === 0) return;
    if (state === "rejected" && !bulkReason.trim()) {
      setStatusMessage({ text: "A rejection reason is required for bulk rejection.", isError: true });
      return;
    }
    setBulkPending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/applications/bulk-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationIds: Array.from(selectedIds),
          state,
          reason: bulkReason.trim() || undefined,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; processedCount?: number; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Successfully updated ${data.processedCount ?? selectedIds.size} applications to ${state}.` });
        setSelectedIds(new Set());
        setBulkReason("");
        setShowBulkRejectModal(false);
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to process bulk review.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error processing bulk review.", isError: true });
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div className="review-workspace">
      {/* Action Navigation Bar */}
      <div className="review-top-bar">
        <div className="review-links">
          {event.format !== "solo" ? (
            <Link className="workspace-sublink" href={`/admin/groups?event=${event.id}`}>
              Squads & Captains →
            </Link>
          ) : (
            <Link className="workspace-sublink" href={`/admin/selection?event=${event.id}`}>
              Solo Selection Queue →
            </Link>
          )}
          <Link className="workspace-sublink" href={`/admin/fixtures?event=${event.id}`}>
            Fixtures & Draw →
          </Link>
        </div>

        <a
          className="export-button"
          href={`/api/admin/applications/export?event=${event.id}`}
          download
          title="Download audited CSV list of participants"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Export CSV (Audited)
        </a>
      </div>

      {/* Global Status Banner */}
      {statusMessage && !statusMessage.id && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="review-controls-card">
        <div className="search-box">
          <input
            type="search"
            placeholder="Search by student name, roll number, or batch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search applicants"
          />
        </div>

        <div className="filter-row">
          <div className="filter-chips" role="group" aria-label="Review state filter">
            {[
              { id: "all", label: `All (${applications.length})` },
              { id: "submitted", label: `Pending (${applications.filter((a) => a.review_state === "submitted").length})` },
              { id: "approved", label: `Approved (${applications.filter((a) => a.review_state === "approved").length})` },
              { id: "waitlisted", label: `Waitlisted (${applications.filter((a) => a.review_state === "waitlisted").length})` },
              { id: "rejected", label: `Rejected (${applications.filter((a) => a.review_state === "rejected").length})` },
              { id: "withdrawn", label: `Withdrawn (${applications.filter((a) => a.review_state === "withdrawn").length})` },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`filter-chip ${reviewFilter === chip.id ? "active" : ""}`}
                onClick={() => setReviewFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {batches.length > 0 && (
            <div className="batch-dropdown-container">
              <label htmlFor="batch-select" className="sr-only">Filter by batch</label>
              <select
                id="batch-select"
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="batch-select"
              >
                <option value="all">All Batches</option>
                {batches.map((b) => (
                  <option key={b} value={b}>
                    Batch {b}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bulk-toolbar" role="region" aria-label="Bulk actions">
          <div className="bulk-info">
            <span className="bulk-count">{selectedIds.size}</span> applicant{selectedIds.size === 1 ? "" : "s"} selected
          </div>
          <div className="bulk-buttons">
            <button
              type="button"
              className="bulk-btn approve"
              disabled={bulkPending}
              onClick={() => submitBulkReview("approved")}
            >
              Approve Selected
            </button>
            <button
              type="button"
              className="bulk-btn waitlist"
              disabled={bulkPending}
              onClick={() => submitBulkReview("waitlisted")}
            >
              Waitlist Selected
            </button>
            <button
              type="button"
              className="bulk-btn reject"
              disabled={bulkPending}
              onClick={() => setShowBulkRejectModal(true)}
            >
              Reject Selected…
            </button>
            <button
              type="button"
              className="bulk-btn clear"
              disabled={bulkPending}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Bulk Reject Modal */}
      {showBulkRejectModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bulk-reject-title">
          <div className="modal-card">
            <h2 id="bulk-reject-title">Bulk Reject Applications</h2>
            <p>
              You are about to reject <strong>{selectedIds.size}</strong> application{selectedIds.size === 1 ? "" : "s"}.
              A clear reason is required and will be logged into the audit trail.
            </p>
            <label className="modal-label">
              Reason for rejection (Required)
              <textarea
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="e.g. Incomplete eligibility requirements or quota exceeded"
                required
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn cancel"
                disabled={bulkPending}
                onClick={() => {
                  setShowBulkRejectModal(false);
                  setBulkReason("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn confirm-reject"
                disabled={bulkPending || !bulkReason.trim()}
                onClick={() => submitBulkReview("rejected")}
              >
                {bulkPending ? "Rejecting…" : `Confirm Reject (${selectedIds.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select All Checkbox Header */}
      <div className="queue-header-row">
        <label className="checkbox-label select-all-label">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleSelectAll}
            disabled={filtered.length === 0}
          />
          <span>Select all matching ({filtered.length})</span>
        </label>
        <span className="queue-count-label">
          Showing {filtered.length} of {applications.length} applications
        </span>
      </div>

      {/* Applicant Cards List */}
      {filtered.length === 0 ? (
        <div className="review-empty-state">
          <h3>No applications found</h3>
          <p>
            {search || reviewFilter !== "all" || batchFilter !== "all"
              ? "No applicants match your current filters. Try resetting the filters above."
              : `No applications have been submitted for ${event.title} yet.`}
          </p>
        </div>
      ) : (
        <div className="review-list">
          {filtered.map((row) => {
            const isSelected = selectedIds.has(row.application_id);
            const isExpanded = expandedAnswers.has(row.application_id);
            const isPending = pendingId === row.application_id;
            const rowMessage = statusMessage?.id === row.application_id ? statusMessage : null;
            const answers = row.answers && typeof row.answers === "object" ? Object.entries(row.answers) : [];

            return (
              <article
                key={row.application_id}
                className={`review-card ${isSelected ? "selected-card" : ""} state-${row.review_state}`}
              >
                <div className="card-primary-section">
                  <div className="card-select-col">
                    <label className="checkbox-label sr-only-text" htmlFor={`select-${row.application_id}`}>
                      <input
                        id={`select-${row.application_id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(row.application_id)}
                      />
                      <span className="sr-only">Select {row.full_name}</span>
                    </label>
                  </div>

                  <div className="card-info-col">
                    <div className="badge-row">
                      <span className={`status-badge review-${row.review_state}`}>
                        {row.review_state.toUpperCase()}
                      </span>
                      <span className={`status-badge selection-${row.selection_state}`}>
                        SELECTION: {row.selection_state}
                      </span>
                      <span className="timestamp-badge">
                        Submitted:{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(row.submitted_at))}
                      </span>
                    </div>

                    <h2 className="applicant-name">{row.full_name}</h2>
                    <p className="applicant-meta">
                      {row.roll_canonical ? (
                        <>
                          <strong>Batch:</strong> {row.batch_label}
                          {row.course_label ? ` · ${row.course_label}` : ""}
                          {" · "}
                          <strong>Roll:</strong> {row.roll_canonical}
                        </>
                      ) : (
                        <>
                          <strong>Category:</strong> {row.batch_label}
                          {row.course_label ? <> · <strong>Department:</strong> {row.course_label}</> : ""}
                        </>
                      )}
                    </p>

                    {/* Rejection / Waitlist reason notice */}
                    {row.review_reason && (
                      <div className="reason-callout">
                        <strong>Review Note:</strong> {row.review_reason}
                      </div>
                    )}

                    {/* Toggle Answers Viewer */}
                    {answers.length > 0 && (
                      <div className="answers-section">
                        <button
                          type="button"
                          className="toggle-answers-btn"
                          onClick={() => toggleAnswers(row.application_id)}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "▾ Hide Answers" : "▸ View Registration Answers"} ({answers.length})
                        </button>

                        {isExpanded && (
                          <dl className="answers-list">
                            {answers.map(([question, ans]) => (
                              <div key={question} className="answer-item">
                                <dt>{question}</dt>
                                <dd>{ans || "—"}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Individual Actions Section */}
                <div className="card-actions-section">
                  {rowMessage && (
                    <p className={`row-status ${rowMessage.isError ? "error" : "success"}`} role="status">
                      {rowMessage.text}
                    </p>
                  )}

                  {row.review_state !== "withdrawn" && (
                    <div className="review-action-controls">
                      <div className="reason-input-group">
                        <label htmlFor={`reason-${row.application_id}`}>Note / Reason</label>
                        <input
                          id={`reason-${row.application_id}`}
                          value={reasonMap[row.application_id] ?? ""}
                          disabled={isPending}
                          onChange={(e) =>
                            setReasonMap({ ...reasonMap, [row.application_id]: e.target.value })
                          }
                          maxLength={500}
                          placeholder="Required for rejection"
                        />
                      </div>

                      <div className="button-group">
                        <button
                          type="button"
                          className="btn-approve"
                          disabled={isPending || row.review_state === "approved"}
                          onClick={() => submitReview(row.application_id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-waitlist"
                          disabled={isPending || row.review_state === "waitlisted"}
                          onClick={() => submitReview(row.application_id, "waitlisted")}
                        >
                          Waitlist
                        </button>
                        <button
                          type="button"
                          className="btn-reject"
                          disabled={isPending || row.review_state === "rejected"}
                          onClick={() => submitReview(row.application_id, "rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inline Solo Selection for solo events once approved */}
                  {event.format === "solo" && row.review_state === "approved" && (
                    <div className="solo-selection-controls">
                      <span className="solo-control-label">Solo Selection:</span>
                      <div className="button-group mini">
                        <button
                          type="button"
                          className={`btn-select ${row.selection_state === "selected" ? "active" : ""}`}
                          disabled={isPending}
                          onClick={() => submitSoloSelection(row.application_id, "selected")}
                        >
                          ✓ Selected
                        </button>
                        <button
                          type="button"
                          className={`btn-reserve ${row.selection_state === "reserve" ? "active" : ""}`}
                          disabled={isPending}
                          onClick={() => submitSoloSelection(row.application_id, "reserve")}
                        >
                          Reserve
                        </button>
                        <button
                          type="button"
                          className={`btn-not-selected ${row.selection_state === "not_selected" ? "active" : ""}`}
                          disabled={isPending}
                          onClick={() => submitSoloSelection(row.application_id, "not_selected")}
                        >
                          Not Selected
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
