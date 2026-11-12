"use client";
import { FormEvent, useState } from "react";
import type { AdminNoticeItem } from "@/server/notices";

type Edition = { id: string; name: string };

const istFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatNoticeTime(iso: string) {
  const timestamp = Date.parse(iso);
  return Number.isNaN(timestamp) ? iso : `${istFormatter.format(timestamp)} IST`;
}

export function NoticeForm({
  editions,
  initialNotices = [],
}: {
  editions: Edition[];
  initialNotices?: AdminNoticeItem[];
}) {
  const [editionId, setEditionId] = useState(editions[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [notices, setNotices] = useState<AdminNoticeItem[]>(initialNotices);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !editionId) return;
    setPending(true);
    setStatus(null);
    try {
      const response = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editionId, title, body, urgency, expiresAt: null }),
      });
      const result = (await response.json()) as { error?: string; notices?: AdminNoticeItem[] };
      if (!response.ok) {
        setStatus(result.error ?? "Unable to publish the notice.");
      } else {
        setTitle("");
        setBody("");
        setUrgency("normal");
        if (Array.isArray(result.notices)) setNotices(result.notices);
        setStatus("Published. Students can now see this in Official Notices.");
      }
    } catch {
      setStatus("Unable to publish the notice. Please try again.");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(notice: AdminNoticeItem) {
    if (deletingId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete "${notice.title}"? Students will no longer see this notice.`)
    ) {
      return;
    }

    setDeletingId(notice.id);
    setListStatus(null);
    try {
      const response = await fetch("/api/admin/notices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noticeId: notice.id }),
      });
      const result = (await response.json()) as { error?: string; notices?: AdminNoticeItem[] };
      if (!response.ok) {
        setListStatus({ kind: "error", text: result.error ?? "Unable to delete the notice." });
        return;
      }
      setNotices((current) =>
        Array.isArray(result.notices) ? result.notices : current.filter((item) => item.id !== notice.id),
      );
      setListStatus({ kind: "ok", text: `Deleted "${notice.title}".` });
    } catch {
      setListStatus({ kind: "error", text: "Unable to delete the notice. Please try again." });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="notice-layout">
      {editions.length ? (
        <form className="notice-form" onSubmit={submit}>
          <label>
            Festival edition
            <select value={editionId} onChange={(event) => setEditionId(event.target.value)} disabled={pending}>
              {editions.map((edition) => (
                <option value={edition.id} key={edition.id}>
                  {edition.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Headline
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              required
              disabled={pending}
              placeholder="e.g. Registrations open tomorrow"
            />
          </label>
          <label>
            Update
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={5000}
              required
              disabled={pending}
              placeholder="Write the exact information students need."
            />
          </label>
          <label>
            Priority
            <select value={urgency} onChange={(event) => setUrgency(event.target.value)} disabled={pending}>
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
          <button type="submit" disabled={pending}>
            {pending ? "Publishing…" : "Publish notice"}
          </button>
          {status && <p role="status">{status}</p>}
        </form>
      ) : (
        <div className="notice-empty">
          <h2>No festival edition is available.</h2>
          <p>Create the current festival edition before publishing new notices.</p>
        </div>
      )}

      <section className="notice-board" aria-labelledby="posted-notices-heading">
        <div className="notice-board-head">
          <p className="eyebrow">Manage bulletin</p>
          <h2 id="posted-notices-heading">Posted notices ({notices.length})</h2>
        </div>

        {listStatus && (
          <p
            role="status"
            className={listStatus.kind === "error" ? "notice-status-error" : "notice-status-ok"}
          >
            {listStatus.text}
          </p>
        )}

        {notices.length ? (
          <ol className="notice-admin-list">
            {notices.map((notice) => {
              const isDeleting = deletingId === notice.id;
              return (
                <li className="notice-admin-item" key={notice.id}>
                  <div className="notice-admin-head">
                    <div className="notice-admin-meta">
                      <span className={`notice-badge ${notice.urgency}`}>{notice.urgency}</span>
                      <span>{formatNoticeTime(notice.publishAt)}</span>
                      {notice.eventTitle && <span>· {notice.eventTitle}</span>}
                    </div>
                    <button
                      type="button"
                      className="notice-delete-btn"
                      onClick={() => handleDelete(notice)}
                      disabled={deletingId !== null}
                      aria-label={`Delete notice ${notice.title}`}
                    >
                      {isDeleting ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                  <h3>{notice.title}</h3>
                  <p>{notice.body}</p>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="notice-board-empty">No posted notices yet.</p>
        )}
      </section>
    </div>
  );
}
