"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PortalDialog } from "@/components/admin/portal-dialog";

export type ActivationRecord = {
  edition_id: string;
  profile_id: string;
  access_state: "pending" | "active" | "rejected" | "suspended";
  requested_at: string;
  full_name: string;
  batch_label: string;
  course_label: string | null;
  roll_canonical: string;
  fest_id: string;
  is_admin?: boolean;
};

type SortOption = "newest" | "name_asc" | "roll_asc";

export function ActivationClient({
  queue,
  canRemoveProfiles,
  isViewerMainAdmin = false,
  currentUserId,
}: {
  queue: ActivationRecord[];
  canRemoveProfiles: boolean;
  isViewerMainAdmin?: boolean;
  currentUserId?: string;
}) {
  const router = useRouter();

  // Filters & Sorting
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [batchFilter, setBatchFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  // Interaction State
  const [selectedRecord, setSelectedRecord] = useState<ActivationRecord | null>(null);
  const [modalReason, setModalReason] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ id?: string; text: string; isError?: boolean } | null>(null);
  const [copiedFestId, setCopiedFestId] = useState<string | null>(null);

  // Recovery modal state
  const [recoveryRecord, setRecoveryRecord] = useState<ActivationRecord | null>(null);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ token: string; expiresAt: string } | null>(null);

  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  // Extract distinct batches dynamically
  const availableBatches = useMemo(() => {
    const set = new Set<string>();
    queue.forEach((item) => {
      if (item.batch_label) set.add(item.batch_label);
    });
    return Array.from(set).sort();
  }, [queue]);

  // Filtered & Sorted list
  const filtered = useMemo(() => {
    const list = queue.filter((item) => {
      if (deletedIds.has(item.profile_id)) return false;
      if (stateFilter !== "all" && item.access_state !== stateFilter) return false;
      if (batchFilter !== "all" && item.batch_label !== batchFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = item.full_name.toLowerCase().includes(q);
        const matchesRoll = item.roll_canonical.toLowerCase().includes(q);
        const matchesFest = item.fest_id.toLowerCase().includes(q);
        const matchesBatch = item.batch_label.toLowerCase().includes(q);
        const matchesCourse = item.course_label?.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesFest && !matchesBatch && !matchesCourse) return false;
      }
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === "name_asc") return a.full_name.localeCompare(b.full_name);
      if (sortBy === "roll_asc") {
        const numA = parseInt(a.roll_canonical, 10);
        const numB = parseInt(b.roll_canonical, 10);
        if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
        return a.roll_canonical.localeCompare(b.roll_canonical);
      }
      return new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime();
    });
  }, [queue, deletedIds, stateFilter, batchFilter, search, sortBy]);

  // Copy helper
  const copyFestId = (festId: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(festId);
      setCopiedFestId(festId);
      setTimeout(() => setCopiedFestId(null), 2000);
    }
  };

  // Update Access Handler (1-tap instant activation, no ledger input required)
  async function handleUpdateAccess(record: ActivationRecord, state: "active" | "rejected" | "suspended", customReason?: string) {
    if (record.is_admin && !isViewerMainAdmin) {
      setStatusMessage({ id: record.profile_id, text: "Only Main Admins can modify or suspend an Admin profile.", isError: true });
      return;
    }
    if (record.is_admin && record.profile_id === currentUserId && (state === "suspended" || state === "rejected")) {
      setStatusMessage({ id: record.profile_id, text: "You cannot suspend or reject your own Admin profile.", isError: true });
      return;
    }
    if (record.is_admin && isViewerMainAdmin && record.profile_id !== currentUserId && (state === "suspended" || state === "rejected")) {
      if (!window.confirm(`Are you sure you want to ${state === "suspended" ? "suspend" : "reject"} Main Admin ${record.full_name}'s access?`)) return;
    }

    setPendingId(record.profile_id);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/activation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editionId: record.edition_id,
          profileId: record.profile_id,
          state,
          reason: customReason || modalReason.trim() || undefined,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ id: record.profile_id, text: `Registration marked as ${state}.` });
        // Update local object if modal is open
        if (selectedRecord && selectedRecord.profile_id === record.profile_id) {
          setSelectedRecord({ ...selectedRecord, access_state: state });
        }
        router.refresh();
      } else {
        setStatusMessage({ id: record.profile_id, text: data.error ?? "Failed to update activation.", isError: true });
      }
    } catch {
      setStatusMessage({ id: record.profile_id, text: "Network error updating activation.", isError: true });
    } finally {
      setPendingId(null);
    }
  }

  // Remove Profile
  async function removeProfile(record: ActivationRecord) {
    if (record.is_admin && !isViewerMainAdmin) {
      setStatusMessage({ id: record.profile_id, text: "Only Main Admins can remove an Admin profile.", isError: true });
      return;
    }
    if (record.is_admin && record.profile_id === currentUserId) {
      setStatusMessage({ id: record.profile_id, text: "You cannot remove your own Admin profile.", isError: true });
      return;
    }

    const confirmMsg = record.is_admin
      ? `CRITICAL: Permanently remove Main Admin ${record.full_name}'s profile, login, and all festival roles? At least one active Main Admin must remain.`
      : `Permanently remove ${record.full_name}'s profile and login? This is only allowed when no event records depend on it.`;

    if (!window.confirm(confirmMsg)) return;

    setPendingId(record.profile_id);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/admin/activation", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: record.profile_id }),
        cache: "no-store",
      });
      const result = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) return setStatusMessage({ id: record.profile_id, text: result.error ?? "Unable to remove this profile.", isError: true });
      setDeletedIds((prev) => new Set([...prev, record.profile_id]));
      setStatusMessage({ text: `${record.full_name}'s profile was permanently removed.` });
      setSelectedRecord(null);
      router.refresh();
    } catch {
      setStatusMessage({ id: record.profile_id, text: "Unable to remove this profile.", isError: true });
    } finally {
      setPendingId(null);
    }
  }

  // Issue Recovery Token
  async function handleIssueRecovery(e: React.FormEvent) {
    e.preventDefault();
    if (!recoveryRecord || recoveryPending) return;
    if (!recoveryReason.trim()) {
      setStatusMessage({ text: "A reason is required to issue an audited recovery token.", isError: true });
      return;
    }
    setRecoveryPending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/recovery/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: recoveryRecord.profile_id,
          reason: recoveryReason.trim(),
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; token?: string; expiresAt?: string; error?: string };
      if (data.ok && data.token && data.expiresAt) {
        setIssuedToken({ token: data.token, expiresAt: data.expiresAt });
      } else {
        setStatusMessage({ text: data.error ?? "Failed to issue recovery token.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error issuing recovery token.", isError: true });
    } finally {
      setRecoveryPending(false);
    }
  }

  const pendingCount = queue.filter((q) => q.access_state === "pending").length;
  const activeCount = queue.filter((q) => q.access_state === "active").length;
  const rejectedCount = queue.filter((q) => q.access_state === "rejected").length;

  return (
    <div className="activation-workspace">
      {/* Top quick stats & hub links */}
      <div className="review-top-bar">
        <div className="roster-metrics">
          <span className="metric-pill pending">
            Pending: <strong>{pendingCount}</strong>
          </span>
          <span className="metric-pill active">
            Active: <strong>{activeCount}</strong>
          </span>
          <span className="metric-pill total">
            Total: <strong>{queue.length}</strong>
          </span>
        </div>
        <div className="review-links">
          <Link className="workspace-sublink" href="/admin">
            ← Organiser Hub
          </Link>
          <Link className="workspace-sublink" href="/admin/help">
            Support Desk →
          </Link>
        </div>
      </div>

      {statusMessage && !statusMessage.id && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      {/* Primary Toolbar: Search + Sort */}
      <div className="activation-toolbar-card">
        <div className="toolbar-search-row">
          <div className="search-box">
            <span className="search-icon" aria-hidden>🔍</span>
            <input
              type="search"
              placeholder="Search by student name, roll number, or Fest ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search registrations"
            />
            {search && (
              <button type="button" className="clear-search-btn" onClick={() => setSearch("")} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>

          <div className="sort-selector-wrap">
            <label htmlFor="sort-select">Sort:</label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="sort-select"
            >
              <option value="newest">Newest First</option>
              <option value="roll_asc">Roll Number (Asc)</option>
              <option value="name_asc">Name (A–Z)</option>
            </select>
          </div>
        </div>

        {/* Batch-wise Filters */}
        <div className="filter-section-row">
          <span className="filter-section-label">Batches:</span>
          <div className="batch-chips-scroll" role="group" aria-label="Batch filter">
            <button
              type="button"
              className={`filter-chip batch-chip ${batchFilter === "all" ? "active" : ""}`}
              onClick={() => setBatchFilter("all")}
            >
              All Batches <span className="chip-count">({queue.length})</span>
            </button>
            {availableBatches.map((b) => {
              const count = queue.filter((q) => q.batch_label === b).length;
              return (
                <button
                  key={b}
                  type="button"
                  className={`filter-chip batch-chip ${batchFilter === b ? "active" : ""}`}
                  onClick={() => setBatchFilter(b)}
                >
                  Batch {b} <span className="chip-count">({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Status Filters */}
        <div className="filter-section-row">
          <span className="filter-section-label">Status:</span>
          <div className="status-chips-wrap" role="group" aria-label="Status filter">
            {[
              { id: "all", label: "All", count: queue.length },
              { id: "pending", label: "Pending", count: pendingCount },
              { id: "active", label: "Active", count: activeCount },
              { id: "rejected", label: "Rejected", count: rejectedCount },
              { id: "suspended", label: "Suspended", count: queue.filter((q) => q.access_state === "suspended").length },
            ].map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`filter-chip status-chip status-${chip.id} ${stateFilter === chip.id ? "active" : ""}`}
                onClick={() => setStateFilter(chip.id)}
              >
                {chip.label} <span className="chip-count">({chip.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Compact List Form */}
      <div className="student-roster-list" role="list">
        {filtered.length === 0 ? (
          <div className="review-empty-state">
            <h3>No student registrations found</h3>
            <p>
              {search || stateFilter !== "all" || batchFilter !== "all"
                ? "No registration records match your filter criteria."
                : "No student registrations are waiting in this queue."}
            </p>
          </div>
        ) : (
          filtered.map((row) => {
            const isPending = pendingId === row.profile_id;
            const rowMessage = statusMessage?.id === row.profile_id ? statusMessage : null;

            // Generate monogram initials
            const initials = row.full_name
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0].toUpperCase())
              .join("");

            return (
              <div
                key={row.profile_id}
                role="listitem"
                className={`student-row state-${row.access_state} ${selectedRecord?.profile_id === row.profile_id ? "selected" : ""}`}
                onClick={() => {
                  setSelectedRecord(row);
                  setModalReason("");
                }}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedRecord(row);
                    setModalReason("");
                  }
                }}
              >
                {/* Avatar with Status Ring */}
                <div className={`student-avatar-ring status-${row.access_state}`} aria-hidden>
                  {initials || "ST"}
                </div>

                {/* Primary Student Info */}
                <div className="student-main-info">
                  <div className="student-name-row">
                    <span className="student-name">{row.full_name}</span>
                    {row.is_admin && <span className="admin-role-badge">🛡️ Admin</span>}
                    {row.profile_id === currentUserId && <span className="badge-self">You</span>}
                  </div>

                  <div className="student-meta-row">
                    {row.roll_canonical ? (
                      <span className="meta-roll">
                        Roll <strong>{row.roll_canonical}</strong>
                      </span>
                    ) : null}
                    <span className="meta-batch">Batch {row.batch_label}</span>
                    {row.course_label && <span className="meta-course">{row.course_label}</span>}
                    <span className="meta-fest-id">{row.fest_id}</span>
                  </div>

                  {rowMessage && (
                    <span className={`row-inline-status ${rowMessage.isError ? "error" : "success"}`}>
                      {rowMessage.text}
                    </span>
                  )}
                </div>

                {/* Right Actions & Status */}
                <div className="student-row-right">
                  <span className={`status-badge access-${row.access_state}`}>
                    {row.access_state.toUpperCase()}
                  </span>

                  {/* 1-Tap Quick Activate for Pending rows */}
                  {row.access_state === "pending" && (
                    <button
                      type="button"
                      className="btn-quick-activate"
                      disabled={isPending}
                      title="1-tap quick activation"
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleUpdateAccess(row, "active");
                      }}
                    >
                      {isPending ? "…" : "✓ Activate"}
                    </button>
                  )}

                  <span className="row-chevron" aria-hidden>›</span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Tap-to-Open Full Profile Inspection Modal */}
      {selectedRecord && (
        <PortalDialog
          labelledBy="student-detail-title"
          onClose={() => setSelectedRecord(null)}
          busy={pendingId === selectedRecord.profile_id}
        >
          <div className="modal-card student-profile-modal">
            {/* Modal Header */}
            <div className="modal-profile-header">
              <div className={`modal-avatar-lg status-${selectedRecord.access_state}`}>
                {selectedRecord.full_name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0].toUpperCase())
                  .join("") || "ST"}
              </div>

              <div className="modal-profile-titles">
                <div className="modal-title-row">
                  <h2 id="student-detail-title">{selectedRecord.full_name}</h2>
                  {selectedRecord.is_admin && <span className="admin-role-badge">🛡️ Main Admin</span>}
                  {selectedRecord.profile_id === currentUserId && <span className="badge-self">You</span>}
                </div>

                <div className="modal-fest-id-row">
                  <span className="fest-id-pill">
                    ID: <strong>{selectedRecord.fest_id}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn-copy-id"
                    onClick={() => copyFestId(selectedRecord.fest_id)}
                    title="Copy Fest ID"
                  >
                    {copiedFestId === selectedRecord.fest_id ? "Copied!" : "Copy"}
                  </button>
                  <span className={`status-badge access-${selectedRecord.access_state}`}>
                    {selectedRecord.access_state.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>

            {/* Credentials Meta Grid */}
            <div className="modal-meta-grid">
              <div className="meta-cell">
                <span className="cell-label">Academic Batch</span>
                <span className="cell-value">Batch {selectedRecord.batch_label}</span>
              </div>
              <div className="meta-cell">
                <span className="cell-label">Course / Dept</span>
                <span className="cell-value">{selectedRecord.course_label ?? "MBBS"}</span>
              </div>
              <div className="meta-cell">
                <span className="cell-label">College Roll No</span>
                <span className="cell-value"><strong>{selectedRecord.roll_canonical || "N/A"}</strong></span>
              </div>
              <div className="meta-cell">
                <span className="cell-label">Requested On</span>
                <span className="cell-value">
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(selectedRecord.requested_at))}
                </span>
              </div>
            </div>

            {selectedRecord.is_admin && !isViewerMainAdmin && (
              <div className="admin-protected-banner">
                <strong>🛡️ Protected Administrator Profile</strong>
                <span>Suspension, rejection, and removal are strictly restricted to Main Admins.</span>
              </div>
            )}

            {/* Optional Remark Input (No ledger reference needed) */}
            <div className="modal-remark-row">
              <label htmlFor="modal-reason-input">Internal Remark (Optional)</label>
              <input
                id="modal-reason-input"
                type="text"
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Optional internal remark or rejection reason"
                maxLength={500}
                disabled={pendingId === selectedRecord.profile_id}
              />
            </div>

            {/* Action Buttons */}
            <div className="modal-actions-container">
              <div className="primary-actions-group">
                {selectedRecord.access_state !== "active" && (
                  <button
                    type="button"
                    className="modal-btn btn-approve"
                    disabled={pendingId === selectedRecord.profile_id}
                    onClick={() => void handleUpdateAccess(selectedRecord, "active")}
                  >
                    {pendingId === selectedRecord.profile_id ? "Activating…" : "✓ Activate Festival Pass"}
                  </button>
                )}

                {selectedRecord.access_state !== "rejected" && (
                  <button
                    type="button"
                    className="modal-btn btn-reject"
                    disabled={
                      pendingId === selectedRecord.profile_id ||
                      (selectedRecord.is_admin && selectedRecord.profile_id === currentUserId)
                    }
                    title={
                      selectedRecord.is_admin && selectedRecord.profile_id === currentUserId
                        ? "You cannot reject your own Admin profile"
                        : undefined
                    }
                    onClick={() => void handleUpdateAccess(selectedRecord, "rejected")}
                  >
                    ✕ Reject Application
                  </button>
                )}

                {selectedRecord.access_state === "active" && (
                  <button
                    type="button"
                    className="modal-btn btn-waitlist"
                    disabled={
                      pendingId === selectedRecord.profile_id ||
                      (selectedRecord.is_admin && selectedRecord.profile_id === currentUserId)
                    }
                    title={
                      selectedRecord.is_admin && selectedRecord.profile_id === currentUserId
                        ? "You cannot suspend your own Admin profile"
                        : undefined
                    }
                    onClick={() => void handleUpdateAccess(selectedRecord, "suspended")}
                  >
                    ⏸ Suspend Access
                  </button>
                )}
              </div>

              <div className="secondary-tools-group">
                <button
                  type="button"
                  className="modal-link-btn"
                  onClick={() => {
                    setRecoveryRecord(selectedRecord);
                    setIssuedToken(null);
                    setRecoveryReason("");
                  }}
                >
                  🔑 Issue Recovery Token
                </button>

                {canRemoveProfiles && (
                  <button
                    type="button"
                    className="modal-link-btn danger"
                    disabled={
                      pendingId === selectedRecord.profile_id ||
                      (selectedRecord.is_admin && selectedRecord.profile_id === currentUserId)
                    }
                    title={
                      selectedRecord.is_admin && selectedRecord.profile_id === currentUserId
                        ? "You cannot remove your own Admin profile"
                        : undefined
                    }
                    onClick={() => void removeProfile(selectedRecord)}
                  >
                    🗑️ Remove Profile
                  </button>
                )}

                <button
                  type="button"
                  className="modal-btn cancel"
                  onClick={() => setSelectedRecord(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </PortalDialog>
      )}

      {/* Recovery Token Modal */}
      {recoveryRecord && (
        <PortalDialog labelledBy="recovery-modal-title" onClose={() => setRecoveryRecord(null)} busy={recoveryPending}>
          <div className="modal-card wide">
            <h2 id="recovery-modal-title">Issue Account Recovery Token</h2>
            <p>
              Student: <strong>{recoveryRecord.full_name}</strong> (Roll: {recoveryRecord.roll_canonical}, ID: {recoveryRecord.fest_id})
            </p>

            {issuedToken ? (
              <div className="issued-token-box">
                <p className="token-instructions">
                  ✅ One-time recovery token generated. Hand this code securely to the verified student:
                </p>
                <div className="token-code-display">{issuedToken.token}</div>
                <p className="token-expiry">
                  Expires in 2 hours (at{" "}
                  {new Intl.DateTimeFormat("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(issuedToken.expiresAt))}
                  ). The student can reset their password on the Account page.
                </p>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-btn confirm-reject"
                    style={{ background: "#261923" }}
                    onClick={() => {
                      setRecoveryRecord(null);
                      setIssuedToken(null);
                    }}
                  >
                    Done / Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleIssueRecovery}>
                <p className="recovery-notice">
                  ⚠️ This action is logged into the audit trail. Verify the student&apos;s physical identity in person
                  before issuing a recovery token.
                </p>

                <label className="modal-label mandatory">
                  Reason for Issuing Recovery (Mandatory)
                  <textarea
                    required
                    rows={3}
                    maxLength={500}
                    value={recoveryReason}
                    onChange={(e) => setRecoveryReason(e.target.value)}
                    placeholder="e.g. In-person verification with College ID card at treasury desk"
                  />
                </label>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="modal-btn cancel"
                    disabled={recoveryPending}
                    onClick={() => setRecoveryRecord(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="modal-btn confirm-reject"
                    style={{ background: "#261923" }}
                    disabled={recoveryPending || !recoveryReason.trim()}
                  >
                    {recoveryPending ? "Generating Token…" : "Generate Recovery Token"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </PortalDialog>
      )}
    </div>
  );
}
