"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./live-desk.module.css";

export type ProgrammeEntry = {
  id: string; day: string; title: string; category: string; venue: string | null;
  starts_at: string | null; ends_at: string | null; status: "scheduled" | "live" | "paused" | "completed" | "cancelled";
  update_note: string | null; version: number; updated_at: string | null;
};

type EntryEdit = { venue: string; starts: string; ends: string; note: string };

function local(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function entryEdit(entry: ProgrammeEntry): EntryEdit {
  return { venue: entry.venue ?? "", starts: local(entry.starts_at), ends: local(entry.ends_at), note: entry.update_note ?? "" };
}

export function LiveDesk({ entries, diagnostics }: { entries: ProgrammeEntry[]; diagnostics: Record<string, number> }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState("");
  const [message, setMessage] = useState("");
  const [edits, setEdits] = useState<Record<string, EntryEdit>>({});
  const visible = entries.filter(entry => `${entry.title} ${entry.category}`.toLowerCase().includes(query.toLowerCase()));
  const missing = entries.filter(entry => !entry.starts_at || !entry.venue).length;

  async function save(entry: ProgrammeEntry, status = entry.status) {
    const edit = edits[entry.id] ?? entryEdit(entry);
    setPending(entry.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        entryId: entry.id, status, updateNote: edit.note,
        startsAt: edit.starts ? new Date(edit.starts).toISOString() : null,
        endsAt: edit.ends ? new Date(edit.ends).toISOString() : null,
        venue: edit.venue,
      }) });
      const body = await response.json() as { error?: string };
      setMessage(response.ok ? `${entry.title} updated.` : body.error ?? "Update failed.");
      if (response.ok) router.refresh();
    } catch { setMessage("Network unavailable. Programme status was not changed."); }
    finally { setPending(""); }
  }

  function edit(entry: ProgrammeEntry, key: keyof EntryEdit, value: string) {
    const current = edits[entry.id] ?? entryEdit(entry);
    setEdits({ ...edits, [entry.id]: { ...current, [key]: value } });
  }

  return <>
    <section className={styles.metrics}>
      <div><strong>{entries.length}</strong><span>published calls</span></div>
      <div data-alert={missing > 0}><strong>{missing}</strong><span>missing time or venue</span></div>
      <div><strong>{diagnostics.scoreSnapshots ?? 0}</strong><span>score snapshots · {Math.ceil((diagnostics.scorePayloadBytes ?? 0) / 1024)} KB</span></div>
      <div><strong>{diagnostics.activeLeases ?? 0}</strong><span>active scorer devices</span></div>
      <div data-alert={(diagnostics.syncFailures ?? 0) > 0}><strong>{diagnostics.syncFailures ?? 0}</strong><span>sync failures · last 7 days</span></div>
      <a href="/api/admin/live/export">Download full JSON backup</a>
    </section>
    <div className={styles.tools}><input type="search" placeholder="Search programme" value={query} onChange={event => setQuery(event.target.value)} /><span aria-live="polite">{message}</span></div>
    <section className={styles.list}>{visible.map(entry => {
      const current = edits[entry.id] ?? entryEdit(entry);
      return <article key={entry.id} className={styles.card} data-status={entry.status}>
        <header><div><small>{entry.day} · {entry.category}</small><h2>{entry.title}</h2></div><b>{entry.status}</b></header>
        <div className={styles.fields}>
          <label>Venue<input value={current.venue} onChange={event => edit(entry, "venue", event.target.value)} /></label>
          <label>Starts<input type="datetime-local" value={current.starts} onChange={event => edit(entry, "starts", event.target.value)} /></label>
          <label>Ends<input type="datetime-local" value={current.ends} onChange={event => edit(entry, "ends", event.target.value)} /></label>
          <label>Public update<input maxLength={500} value={current.note} onChange={event => edit(entry, "note", event.target.value)} /></label>
        </div>
        <div className={styles.actions}>
          <button disabled={pending === entry.id} onClick={() => void save(entry)}>Save details</button>
          <button disabled={pending === entry.id || !current.venue || !current.starts} onClick={() => void save(entry, "live")}>Go live</button>
          <button disabled={pending === entry.id} onClick={() => void save(entry, "paused")}>Pause</button>
          <button disabled={pending === entry.id} onClick={() => void save(entry, "completed")}>Complete</button>
          <button disabled={pending === entry.id} onClick={() => void save(entry, "cancelled")}>Cancel</button>
        </div>
      </article>;
    })}</section>
  </>;
}
