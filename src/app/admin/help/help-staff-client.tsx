"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export type HelpThreadStaff = {
  thread_id: string;
  subject: string;
  state: "open" | "in_progress" | "resolved" | "closed";
  owner_name: string;
  event_title: string | null;
  assigned_to_name: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
};

type HelpMessage = {
  message_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export function HelpStaffClient({ threads }: { threads: HelpThreadStaff[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");

  // Thread action modal
  const [activeThread, setActiveThread] = useState<HelpThreadStaff | null>(null);
  const [actionType, setActionType] = useState<"assign_self" | "resolve" | "close">("assign_self");
  const [replyMessage, setReplyMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const filtered = useMemo(() => {
    return threads.filter((t) => {
      if (stateFilter !== "all" && t.state !== stateFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchesSub = t.subject.toLowerCase().includes(q);
        const matchesOwner = t.owner_name.toLowerCase().includes(q);
        const matchesEvent = (t.event_title ?? "").toLowerCase().includes(q);
        if (!matchesSub && !matchesOwner && !matchesEvent) return false;
      }
      return true;
    });
  }, [threads, stateFilter, search]);

  async function handleActionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeThread || pending) return;
    setPending(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/admin/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: activeThread.thread_id,
          action: actionType,
          reply: replyMessage.trim() || undefined,
        }),
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setStatusMessage({ text: `Thread updated (${actionType.replace("_", " ")}).` });
        setActiveThread(null);
        setReplyMessage("");
        setMessages([]);
        router.refresh();
      } else {
        setStatusMessage({ text: data.error ?? "Failed to update thread.", isError: true });
      }
    } catch {
      setStatusMessage({ text: "Network error updating thread.", isError: true });
    } finally {
      setPending(false);
    }
  }

  async function openThread(thread: HelpThreadStaff) {
    setActiveThread(thread);
    setActionType(thread.assigned_to_name ? "resolve" : "assign_self");
    setReplyMessage("");
    setMessages([]);
    setMessagesLoading(true);
    try {
      const response = await fetch(`/api/admin/help?threadId=${thread.thread_id}`, { cache: "no-store" });
      const data = (await response.json()) as { messages?: HelpMessage[]; error?: string };
      if (!response.ok) setStatusMessage({ text: data.error ?? "Unable to load this conversation.", isError: true });
      else setMessages(data.messages ?? []);
    } catch {
      setStatusMessage({ text: "Network error loading this conversation.", isError: true });
    } finally {
      setMessagesLoading(false);
    }
  }

  return (
    <div className="help-staff-workspace">
      <div className="review-top-bar">
        <div className="review-links">
          <Link className="workspace-sublink" href="/admin">
            ← Organiser Hub
          </Link>
          <Link className="workspace-sublink" href="/admin/activation">
            Activation Queue →
          </Link>
        </div>
      </div>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.isError ? "error" : "success"}`} role="status">
          {statusMessage.text}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="review-controls-card">
        <div className="search-box">
          <input
            type="search"
            placeholder="Search help requests by subject, student name, or event…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search help requests"
          />
        </div>

        <div className="filter-chips" role="group" aria-label="Thread status filter">
          {[
            { id: "all", label: `All (${threads.length})` },
            { id: "open", label: `Open (${threads.filter((t) => t.state === "open").length})` },
            { id: "in_progress", label: `In Progress (${threads.filter((t) => t.state === "in_progress").length})` },
            { id: "resolved", label: `Resolved (${threads.filter((t) => t.state === "resolved").length})` },
            { id: "closed", label: `Closed (${threads.filter((t) => t.state === "closed").length})` },
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

      {/* Threads List */}
      <div className="threads-list">
        {filtered.length === 0 ? (
          <div className="review-empty-state">
            <h3>No help requests found</h3>
            <p>
              {search || stateFilter !== "all"
                ? "No threads match your current filter."
                : "No student help requests have been submitted yet."}
            </p>
          </div>
        ) : (
          filtered.map((t) => (
            <article key={t.thread_id} className={`thread-card state-${t.state}`}>
              <div className="thread-main-col">
                <div className="thread-meta-row">
                  <span className={`status-badge state-${t.state}`}>{t.state.toUpperCase().replace("_", " ")}</span>
                  {t.event_title && <span className="event-tag">{t.event_title}</span>}
                  <span className="msg-count-tag">{t.message_count} message{t.message_count === 1 ? "" : "s"}</span>
                  <span className="timestamp-badge">
                    Updated:{" "}
                    {new Intl.DateTimeFormat("en-IN", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Kolkata",
                    }).format(new Date(t.updated_at))}
                  </span>
                </div>

                <h2 className="thread-subject">{t.subject}</h2>
                <p className="thread-byline">
                  From: <strong>{t.owner_name}</strong> · Assigned:{" "}
                  <strong>{t.assigned_to_name ?? "Unassigned"}</strong>
                </p>
              </div>

              <div className="thread-actions-col">
                <button
                  type="button"
                  className="btn-action primary"
                  onClick={() => void openThread(t)}
                >
                  Manage Request
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Action Modal */}
      {activeThread && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="help-action-title">
          <div className="modal-card wide">
            <h2 id="help-action-title">Manage Help Request</h2>
            <p>
              Subject: <strong>{activeThread.subject}</strong> · Student: <strong>{activeThread.owner_name}</strong>
            </p>

            <section className="help-conversation" aria-label="Help request conversation">
              <h3>Conversation</h3>
              {messagesLoading ? <p>Loading messages…</p> : messages.length ? <div className="help-message-list">{messages.map((message) => (
                <article key={message.message_id} className="help-message">
                  <header><strong>{message.author_name}</strong><time dateTime={message.created_at}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(message.created_at))}</time></header>
                  <p>{message.body}</p>
                </article>
              ))}</div> : <p>No messages were found for this thread.</p>}
            </section>

            <form onSubmit={handleActionSubmit}>
              <label className="modal-label">
                Select Staff Action
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value as "assign_self" | "resolve" | "close")}
                  className="score-select"
                >
                  <option value="assign_self">Assign to Myself (Mark In Progress)</option>
                  <option value="resolve">Resolve Request</option>
                  <option value="close">Close Request</option>
                </select>
              </label>

              <label className="modal-label" style={{ marginTop: 12 }}>
                Staff Response / Resolution Note (Optional)
                <textarea
                  rows={4}
                  maxLength={5000}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Type an official response or resolution note to the student…"
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-btn cancel"
                  disabled={pending}
                  onClick={() => {
                    setActiveThread(null);
                    setReplyMessage("");
                    setMessages([]);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-btn confirm-reject"
                  style={{ background: "#261923" }}
                  disabled={pending}
                >
                  {pending ? "Saving…" : "Confirm Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
