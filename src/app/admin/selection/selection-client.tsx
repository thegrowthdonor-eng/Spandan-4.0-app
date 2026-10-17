"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type SelectionRow = {
  application_id: string;
  student_id: string;
  full_name: string;
  batch_label: string;
  course_label: string | null;
  roll_canonical: string;
  review_state: string;
  selection_state: "unselected" | "selected" | "reserve" | "not_selected";
  answers: Record<string, string> | null;
  review_reason: string | null;
  submitted_at: string;
};

type EventMeta = {
  id: string;
  title: string;
  format: string;
};

export function SelectionClient({
  event,
  candidates,
}: {
  event: EventMeta;
  candidates: SelectionRow[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectionFilter, setSelectionFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedAnswers, setExpandedAnswers] = useState<Set<string>>(new Set());
  const [statusMessage, setStatusMessage] = useState<{ id?: string; text: string; isError?: boolean } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const batches = useMemo(() => {
    const set = new Set<string>();
    candidates.forEach((c) => {
      if (c.batch_label) set.add(c.batch_label);
    });
    return Array.from(set).sort();
  }, [candidates]);

  const filtered = useMemo(() => {
    return candidates.filter((item) => {
      if (selectionFilter !== "all" && item.selection_state !== selectionFilter) return false;
      if (batchFilter !== "all" && item.batch_label !== batchFilter) return false;
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesName = item.full_name.toLowerCase().includes(query);
        const matchesRoll = item.roll_canonical.toLowerCase().includes(query);
        const matchesBatch = item.batch_label.toLowerCase().includes(query);
        if (!matchesName && !matchesRoll && !matchesBatch) return false;
      }
      return true;
    });
  }, [candidates, selectionFilter, batchFilter, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selectedIds.has(c.application_id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.application_id)));
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

  async function submitSingleSelection(applicationId: string, state: "selected" | "reserve" | "not_selected") {
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
        setStatusMessage({ id: applicationId, text: `Marked as ${state}.` });
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

  async function submitBulkSelection(state: "selected" | "reserve" | "not_selected") {
    if (selectedIds.size === 0) return;
    setBulkPending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/applications/bulk-selection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationIds: Array.from(selectedIds),
          state,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; processedCount?: number; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Successfully updated ${data.processedCount ?? selectedIds.size} participants to ${state}.` });
        setSelectedIds(new Set());
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to process bulk selection.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error processing bulk selection.", isError: true });
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div className="selection-workspace">
      {/* Top Bar */}
      <div className="review-top-bar">
        <div className="review-links">
          <Link className="workspace-sublink" href={`/admin/review?event=${event.id}`}>
            ← Back to Review Queue
          </Link>
          <Link className="workspace-sublink" href={`/admin/fixtures?event=${event.id}`}>
            Fixtures & Draw →
          </Link>
        </div>

        <a
          className="export-button"
          href={`/api/admin/applications/export?event=${event.id}`}
          download
        >
          Export CSV (Audited)
        </a>
      </div>

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
            placeholder="Search approved candidates by name, roll, or batch…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search candidates"
          />
        </div>

        <div className="filter-row">
          <div className="filter-chips" role="group" aria-label="Selection state filter">
            {[
              { id: "all", label: `All Approved (${candidates.length})` },
              { id: "unselected", label: `Unselected (${candidates.filter((c) => c.selection_state === "unselected").length})` },
              { id: "selected", label: `Selected (${candidates.filter((c) => c.selection_state === "selected").length})` },
              { id: "reserve", label: `Reserve (${candidates.filter((c) => c.selection_state === "reserve").length})` },
              { id: "not_selected", label: `Not Selected (${candidates.filter((c) => c.selection_state === "not_selected").length})` },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`filter-chip ${selectionFilter === chip.id ? "active" : ""}`}
                onClick={() => setSelectionFilter(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {batches.length > 0 && (
            <div className="batch-dropdown-container">
              <label htmlFor="batch-select-solo" className="sr-only">Filter by batch</label>
              <select
                id="batch-select-solo"
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
        <div className="bulk-toolbar" role="region" aria-label="Bulk selection actions">
          <div className="bulk-info">
            <span className="bulk-count">{selectedIds.size}</span> candidate{selectedIds.size === 1 ? "" : "s"} selected
          </div>
          <div className="bulk-buttons">
            <button
              type="button"
              className="bulk-btn approve"
              disabled={bulkPending}
              onClick={() => submitBulkSelection("selected")}
            >
              Mark Selected
            </button>
            <button
              type="button"
              className="bulk-btn waitlist"
              disabled={bulkPending}
              onClick={() => submitBulkSelection("reserve")}
            >
              Mark Reserve
            </button>
            <button
              type="button"
              className="bulk-btn reject"
              disabled={bulkPending}
              onClick={() => submitBulkSelection("not_selected")}
            >
              Mark Not Selected
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

      {/* Select All Row */}
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
          Showing {filtered.length} of {candidates.length} approved candidates
        </span>
      </div>

      {/* Candidate List */}
      {filtered.length === 0 ? (
        <div className="review-empty-state">
          <h3>No approved candidates found</h3>
          <p>
            {candidates.length === 0
              ? `No approved candidates are waiting for solo selection in ${event.title}. Approve candidates in the Review Queue first.`
              : "No candidates match your current search/filter."}
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
                className={`review-card ${isSelected ? "selected-card" : ""}`}
              >
                <div className="card-primary-section">
                  <div className="card-select-col">
                    <label className="checkbox-label sr-only-text" htmlFor={`select-solo-${row.application_id}`}>
                      <input
                        id={`select-solo-${row.application_id}`}
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(row.application_id)}
                      />
                      <span className="sr-only">Select {row.full_name}</span>
                    </label>
                  </div>

                  <div className="card-info-col">
                    <div className="badge-row">
                      <span className={`status-badge selection-${row.selection_state}`}>
                        SELECTION: {row.selection_state.toUpperCase()}
                      </span>
                      <span className="status-badge review-approved">APPROVED</span>
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

                <div className="card-actions-section">
                  {rowMessage && (
                    <p className={`row-status ${rowMessage.isError ? "error" : "success"}`} role="status">
                      {rowMessage.text}
                    </p>
                  )}

                  <div className="solo-selection-controls" style={{ borderTop: 0, paddingTop: 0 }}>
                    <span className="solo-control-label">Final Selection:</span>
                    <div className="button-group">
                      <button
                        type="button"
                        className={`btn-select ${row.selection_state === "selected" ? "active" : ""}`}
                        disabled={isPending}
                        onClick={() => submitSingleSelection(row.application_id, "selected")}
                      >
                        ✓ Selected
                      </button>
                      <button
                        type="button"
                        className={`btn-reserve ${row.selection_state === "reserve" ? "active" : ""}`}
                        disabled={isPending}
                        onClick={() => submitSingleSelection(row.application_id, "reserve")}
                      >
                        Reserve
                      </button>
                      <button
                        type="button"
                        className={`btn-not-selected ${row.selection_state === "not_selected" ? "active" : ""}`}
                        disabled={isPending}
                        onClick={() => submitSingleSelection(row.application_id, "not_selected")}
                      >
                        Not Selected
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
