"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export type HelpMessage = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles: { full_name: string } | null;
};

export type HelpThread = {
  id: string;
  subject: string;
  state: "open" | "in_progress" | "resolved" | "closed";
  created_at: string;
  updated_at: string;
  help_messages: HelpMessage[];
};

export function HelpDesk({ editionId, initialThreads }: { editionId: string | null | undefined; initialThreads: HelpThread[] }) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [replyByThread, setReplyByThread] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(payload: Record<string, string>) {
    const response = await fetch("/api/help", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), cache: "no-store" });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? "Unable to send your request.");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editionId || pending) return;
    setPending(true); setStatus(null);
    try {
      await send({ editionId, subject, message });
      setSubject(""); setMessage(""); setStatus("Your request has reached the fest help desk."); router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to send your request. Please try again.");
    } finally { setPending(false); }
  }

  async function reply(event: FormEvent<HTMLFormElement>, threadId: string) {
    event.preventDefault();
    const replyMessage = replyByThread[threadId]?.trim();
    if (!replyMessage || pending) return;
    setPending(true); setStatus(null);
    try {
      await send({ threadId, message: replyMessage });
      setReplyByThread((current) => ({ ...current, [threadId]: "" }));
      setStatus("Reply sent."); router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to send your reply. Please try again.");
    } finally { setPending(false); }
  }

  return <div className="support-center">
    {initialThreads.length ? <div className="support-thread-list">{initialThreads.map((thread) => <article key={thread.id} className="support-thread">
      <header><h3>{thread.subject}</h3><span className={`support-state ${thread.state}`}>{thread.state.replaceAll("_", " ")}</span></header>
      <div className="support-messages">{thread.help_messages.map((entry) => <div key={entry.id} className="support-message"><strong>{entry.profiles?.full_name ?? "Festival desk"}</strong><p>{entry.body}</p></div>)}</div>
      {thread.state !== "closed" ? <form onSubmit={(event) => void reply(event, thread.id)} className="support-reply"><textarea value={replyByThread[thread.id] ?? ""} onChange={(event) => setReplyByThread((current) => ({ ...current, [thread.id]: event.target.value }))} maxLength={5000} required disabled={pending} placeholder="Reply to this conversation" /><button type="submit" disabled={pending || !(replyByThread[thread.id] ?? "").trim()}>{pending ? "Sending…" : "Reply"}</button></form> : null}
    </article>)}</div> : <p className="section-empty-note">No help requests yet. Send a message below and the festival desk will reply here.</p>}
    <form className="support-form" onSubmit={(event) => void submit(event)}><h3>Contact the festival desk</h3><label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} required disabled={!editionId || pending} /></label><label>How can we help?<textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={5000} required disabled={!editionId || pending} /></label><button type="submit" disabled={!editionId || pending}>{pending ? "Sending…" : "Send request"}</button></form>
    {status && <p role="status" className="support-status">{status}</p>}
  </div>;
}

export function FeedbackForm({ editionId, active }: { editionId: string | null | undefined; active: boolean }) {
  const [rating, setRating] = useState("5"); const [comment, setComment] = useState(""); const [status, setStatus] = useState<string | null>(null); const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editionId || !active || pending) return; setPending(true); setStatus(null); try { const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ editionId, rating: Number(rating), comment }) }); const result = await response.json() as { error?: string }; setStatus(response.ok ? "Thank you—your feedback has been saved." : result.error ?? "Unable to save feedback."); } catch { setStatus("Unable to save feedback. Please try again."); } finally { setPending(false); } }
  return <form className="support-form feedback-form" onSubmit={submit}><label>Festival experience<select value={rating} onChange={(event) => setRating(event.target.value)} disabled={!editionId || !active || pending}><option value="5">5 — Excellent</option><option value="4">4 — Good</option><option value="3">3 — Okay</option><option value="2">2 — Needs work</option><option value="1">1 — Poor</option></select></label><label>Anything we should know? <span>(optional)</span><textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} disabled={!editionId || !active || pending} /></label><button type="submit" disabled={!editionId || !active || pending}>{pending ? "Saving…" : "Share feedback"}</button>{!active && <p>Feedback unlocks once your fest access is active.</p>}{status && <p role="status">{status}</p>}</form>;
}
