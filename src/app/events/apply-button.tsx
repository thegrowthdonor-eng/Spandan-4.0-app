"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";

type Question = {
  key: string;
  label: string;
  type: "text" | "select";
  required: boolean;
  options?: string[];
};

export function ApplyButton({
  eventId,
  questions = [],
}: {
  eventId: string;
  questions?: Question[];
}) {
  const idempotencyKey = useRef(crypto.randomUUID());
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [applied, setApplied] = useState(false);

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || applied) return;
    // Validate required questions
    for (const q of questions) {
      if (q.required && !answers[q.key]?.trim()) {
        setMessage(`"${q.label}" is required.`);
        return;
      }
    }
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, idempotencyKey: idempotencyKey.current, answers }),
        cache: "no-store",
      });
      const result = await response.json() as { ok?: boolean; reviewState?: string; error?: string };
      if (!response.ok) {
        setMessage(result.error ?? "Unable to submit this application.");
        return;
      }
      setApplied(true);
      setMessage(
        result.reviewState === "waitlisted"
          ? "Your application was added to the waitlist. Check My Fest for updates."
          : "Application submitted. Check My Fest for review updates."
      );
    } catch {
      setMessage("Unable to submit this application. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (applied) {
    return (
      <div className="event-application">
        <p role="status" className="apply-success">{message}</p>
        <Link href="/my-fest">View in My Fest →</Link>
      </div>
    );
  }

  return (
    <form className="event-application" onSubmit={apply}>
      {questions.length > 0 && (
        <fieldset className="event-questions">
          <legend>Registration questions</legend>
          {questions.map((q) => (
            <div key={q.key} className="question-field">
              <label htmlFor={`q-${q.key}`}>
                {q.label}
                {q.required && <span className="question-required" aria-label="required">✦</span>}
              </label>
              {q.type === "select" && q.options ? (
                <select
                  id={`q-${q.key}`}
                  value={answers[q.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  required={q.required}
                  disabled={pending}
                >
                  <option value="">Select an option</option>
                  {q.options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`q-${q.key}`}
                  type="text"
                  value={answers[q.key] ?? ""}
                  onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  required={q.required}
                  maxLength={500}
                  disabled={pending}
                />
              )}
            </div>
          ))}
        </fieldset>
      )}
      <div className="event-actions-row">
        <button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Apply to this event"}
        </button>
        <Link href="/account?next=/my-fest">My Fest / Pass</Link>
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function WithdrawButton({ applicationId }: { applicationId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [withdrawn, setWithdrawn] = useState(false);

  async function withdraw() {
    if (pending || withdrawn) return;
    if (!confirm("Withdraw your application? This cannot be undone unless the organiser re-opens applications.")) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch("/api/applications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId }),
        cache: "no-store",
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) {
        setMessage(result.error ?? "Unable to withdraw application.");
        return;
      }
      setWithdrawn(true);
      setMessage("Application withdrawn. Contact the organiser if you change your mind after the roster lock.");
    } catch {
      setMessage("Unable to withdraw. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (withdrawn) return <p className="apply-success" role="status">{message}</p>;

  return (
    <div className="withdrawal-section">
      <p>You have already applied. If you need to withdraw before the roster lock, you can do so here. After the roster lock, contact the organiser directly.</p>
      <button type="button" onClick={withdraw} disabled={pending} className="revoke-button">
        {pending ? "Withdrawing…" : "Withdraw my application"}
      </button>
      {message && <p role="status" style={{ marginTop: 10, color: "#8f3029" }}>{message}</p>}
    </div>
  );
}
