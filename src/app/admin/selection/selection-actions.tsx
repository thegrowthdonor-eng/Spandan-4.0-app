"use client";

import { useState } from "react";
export function SelectionActions({ applicationId }: { applicationId: string }) {
  const [message, setMessage] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function select(state: "selected" | "reserve" | "not_selected") { if (pending) return; setPending(true); setMessage(null); try { const response = await fetch("/api/admin/applications/selection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationId, state }), cache: "no-store" }); const result = await response.json() as { ok?: boolean; error?: string }; setMessage(result.ok ? `Participant marked ${state}. Refresh the queue to confirm.` : result.error ?? "Unable to save selection."); } catch { setMessage("Unable to save selection."); } finally { setPending(false); } }
  return <div className="review-actions"><div><button type="button" disabled={pending} onClick={() => select("selected")}>Select</button><button type="button" disabled={pending} onClick={() => select("reserve")}>Reserve</button><button type="button" className="reject" disabled={pending} onClick={() => select("not_selected")}>Not selected</button></div>{message ? <p role="status">{message}</p> : null}</div>;
}
