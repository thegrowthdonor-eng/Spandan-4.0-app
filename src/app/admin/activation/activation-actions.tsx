"use client";

import { useState } from "react";

export function ActivationActions({ editionId, profileId }: { editionId: string; profileId: string }) {
  const [ledgerReference, setLedgerReference] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function update(state: "active" | "rejected") {
    if (pending) return;
    if (state === "active" && !ledgerReference.trim()) { setMessage("Ledger reference is required before activation."); return; }
    setPending(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/activation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editionId, profileId, state, ledgerReference, reason }), cache: "no-store" });
      const result = await response.json() as { ok?: boolean; error?: string };
      setMessage(result.ok ? `Registration ${state}. Refresh the queue to confirm.` : result.error ?? "Unable to update activation.");
    } catch { setMessage("Unable to update activation."); } finally { setPending(false); }
  }
  return <div className="activation-actions"><label>Ledger reference<input value={ledgerReference} disabled={pending} onChange={(event) => setLedgerReference(event.target.value)} maxLength={120} placeholder="Required to activate" /></label><label>Note (optional)<input value={reason} disabled={pending} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Internal reason" /></label><div><button type="button" disabled={pending} onClick={() => update("active")}>{pending ? "Saving…" : "Activate"}</button><button type="button" className="reject" disabled={pending} onClick={() => update("rejected")}>Reject</button></div>{message ? <p role="status">{message}</p> : null}</div>;
}
