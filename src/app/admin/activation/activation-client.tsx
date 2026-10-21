"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
};

export function ActivationClient({ queue, canRemoveProfiles }: { queue: ActivationRecord[]; canRemoveProfiles: boolean }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("pending");

  // Single activation state
  const [ledgerMap, setLedgerMap] = useState<Record<string, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ id?: string; text: string; isError?: boolean } | null>(null);

  // Recovery modal state
  const [recoveryRecord, setRecoveryRecord] = useState<ActivationRecord | null>(null);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ token: string; expiresAt: string } | null>(null);

  const filtered = useMemo(() => {
    return queue.filter((item) => {
      if (stateFilter !== "all" && item.access_state !== stateFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesName = item.full_name.toLowerCase().includes(q);
        const matchesRoll = item.roll_canonical.toLowerCase().includes(q);
        const matchesFest = item.fest_id.toLowerCase().includes(q);
        const matchesBatch = item.batch_label.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll && !matchesFest && !matchesBatch) return false;
      }
      return true;
    });
  }, [queue, stateFilter, search]);

  async function handleUpdateAccess(record: ActivationRecord, state: "active" | "rejected" | "suspended") {
    const ledger = ledgerMap[record.profile_id]?.trim() || "";
    const reason = reasonMap[record.profile_id]?.trim() || "";

    if (state === "active" && !ledger) {
      setStatusMessage({ id: record.profile_id, text: "A ledger reference is required before activating.", isError: true });
      return;
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
          ledgerReference: ledger || undefined,
          reason: reason || undefined,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ id: record.profile_id, text: `Registration marked as ${state}.` });
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

  async function removeProfile(record: ActivationRecord) {
    if (!window.confirm(`Permanently remove ${record.full_name}'s profile and login? This is only allowed when no event records depend on it.`)) return;
    setPendingId(record.profile_id);
    setStatusMessage(null);
    try {
      const response = await fetch("/api/admin/activation", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: record.profile_id }),
        cache: "no-store",
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok) return setStatusMessage({ id: record.profile_id, text: result.error ?? "Unable to remove this profile.", isError: true });
      setStatusMessage({ text: `${record.full_name}'s profile was removed.` });
      router.refresh();
    } catch {
      setStatusMessage({ id: record.profile_id, text: "Unable to remove this profile.", isError: true });
    } finally {
      setPendingId(null);
    }
  }

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

  return (
    <div className="activation-workspace">
      <div className="review-top-bar">
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

      {/* Filter and Search Bar */}
      <div className="review-controls-card">
        <div className="search-box">
          <input
            type="search"
            placeholder="Search registrations by student name, roll number, or Fest ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search registrations"
          />
        </div>

        <div className="filter-chips" role="group" aria-label="Access state filter">
          {[
            { id: "pending", label: `Pending (${queue.filter((q) => q.access_state === "pending").length})` },
            { id: "active", label: `Active (${queue.filter((q) => q.access_state === "active").length})` },
            { id: "rejected", label: `Rejected (${queue.filter((q) => q.access_state === "rejected").length})` },
            { id: "suspended", label: `Suspended (${queue.filter((q) => q.access_state === "suspended").length})` },
            { id: "all", label: `All (${queue.length})` },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`filter-chip ${stateFilter === chip.id ? "active" : ""}`}
              onClick={() => setStateFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Registrations List */}
      <div className="activation-list">
        {filtered.length === 0 ? (
          <div className="review-empty-state">
            <h3>No registrations found</h3>
            <p>
              {search || stateFilter !== "all"
                ? "No registration records match your filter."
                : "No student registrations are waiting in this queue."}
            </p>
          </div>
        ) : (
          filtered.map((row) => {
            const isPending = pendingId === row.profile_id;
            const rowMessage = statusMessage?.id === row.profile_id ? statusMessage : null;

            return (
              <article key={row.profile_id} className={`activation-card state-${row.access_state}`}>
                <div className="card-info-col">
                  <div className="badge-row">
                    <span className={`status-badge access-${row.access_state}`}>
                      {row.access_state.toUpperCase()}
                    </span>
                    <span className="fest-id-badge">ID: {row.fest_id}</span>
                    <span className="timestamp-badge">
                      Requested:{" "}
                      {new Intl.DateTimeFormat("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                        timeZone: "Asia/Kolkata",
                      }).format(new Date(row.requested_at))}
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

                  <div className="sub-actions-row">
                    <button
                      type="button"
                      className="recovery-link-btn"
                      onClick={() => {
                        setRecoveryRecord(row);
                        setIssuedToken(null);
                        setRecoveryReason("");
                      }}
                    >
                      🔑 Issue Recovery Token
                    </button>
                  </div>
                </div>

                <div className="card-actions-section">
                  {rowMessage && (
                    <p className={`row-status ${rowMessage.isError ? "error" : "success"}`} role="status">
                      {rowMessage.text}
                    </p>
                  )}

                  <div className="activation-action-controls">
                    <div className="reason-input-group">
                      <label htmlFor={`ledger-${row.profile_id}`}>
                        Offline Ledger Reference {row.access_state === "pending" && "(Required)"}
                      </label>
                      <input
                        id={`ledger-${row.profile_id}`}
                        value={ledgerMap[row.profile_id] ?? ""}
                        disabled={isPending}
                        onChange={(e) =>
                          setLedgerMap({ ...ledgerMap, [row.profile_id]: e.target.value })
                        }
                        maxLength={120}
                        placeholder="e.g. Receipt #4081 / Cash Book Pg 12"
                      />
                    </div>

                    <div className="reason-input-group">
                      <label htmlFor={`reason-${row.profile_id}`}>Internal Note</label>
                      <input
                        id={`reason-${row.profile_id}`}
                        value={reasonMap[row.profile_id] ?? ""}
                        disabled={isPending}
                        onChange={(e) =>
                          setReasonMap({ ...reasonMap, [row.profile_id]: e.target.value })
                        }
                        maxLength={500}
                        placeholder="Optional internal remark"
                      />
                    </div>

                    <div className="button-group">
                      {row.access_state !== "active" && (
                        <button
                          type="button"
                          className="btn-approve"
                          disabled={isPending}
                          onClick={() => handleUpdateAccess(row, "active")}
                        >
                          {isPending ? "Saving…" : "Activate"}
                        </button>
                      )}
                      {row.access_state !== "rejected" && (
                        <button
                          type="button"
                          className="btn-reject"
                          disabled={isPending}
                          onClick={() => handleUpdateAccess(row, "rejected")}
                        >
                          Reject
                        </button>
                      )}
                      {row.access_state === "active" && (
                        <button
                          type="button"
                          className="btn-waitlist"
                          disabled={isPending}
                          onClick={() => handleUpdateAccess(row, "suspended")}
                        >
                          Suspend
                        </button>
                      )}
                      {canRemoveProfiles && (
                        <button type="button" className="btn-remove-profile" disabled={isPending} onClick={() => void removeProfile(row)}>
                          Remove profile
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {/* Recovery Token Modal */}
      {recoveryRecord && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="recovery-modal-title">
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
        </div>
      )}
    </div>
  );
}
