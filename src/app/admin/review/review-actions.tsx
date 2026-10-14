"use client";

import { useState } from "react";
export function ReviewActions({ applicationId }: { applicationId: string }) {
  const [reason, setReason] = useState(""); const [message, setMessage] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function submit(state: "approved" | "waitlisted" | "rejected") {
    if (pending) return; if (state === "rejected" && !reason.trim()) { setMessage("A reason is required when rejecting an application."); return; }
    setPending(true); setMessage(null);
    try { const response = await fetch("/api/admin/applications/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId, state, reason }), cache: "no-store" }); const result = await response.json() as { ok?: boolean; error?: string }; setMessage(result.ok ? `Application ${state}. Refresh the queue to confirm.` : result.error ?? "Unable to save review."); } catch { setMessage("Unable to save review."); } finally { setPending(false); }
  }
  return <div className="review-actions"><label>Reason / note<input value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Required for rejection" /></label><div><button type="button" disabled={pending} onClick={() => submit("approved")}>Approve</button><button type="button" disabled={pending} onClick={() => submit("waitlisted")}>Waitlist</button><button type="button" className="reject" disabled={pending} onClick={() => submit("rejected")}>Reject</button></div>{message ? <p role="status">{message}</p> : null}</div>;
}
