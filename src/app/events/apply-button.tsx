"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export function ApplyButton({ eventId }: { eventId: string }) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function apply() {
    if (pending) return;
    setPending(true); setMessage(null);
    try {
      const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId, idempotencyKey: idempotencyKey.current, answers: {} }), cache: "no-store" });
      const result = await response.json() as { ok?: boolean; reviewState?: string; error?: string };
      if (!response.ok) { setMessage(result.error ?? "Unable to submit this application."); return; }
      setMessage(result.reviewState === "waitlisted" ? "Your application was added to the waitlist." : "Application submitted. Check My Fest for review updates.");
    } catch { setMessage("Unable to submit this application. Please try again."); } finally { setPending(false); }
  }
  return <div className="event-application"><button type="button" onClick={apply} disabled={pending}>{pending ? "Submitting…" : "Apply to this event"}</button><Link href="/account">Sign in / My Fest</Link>{message ? <p role="status">{message}</p> : null}</div>;
}
