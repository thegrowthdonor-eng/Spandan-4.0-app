"use client";
import Link from "next/link";
import { useState } from "react";
import type { CompetitionWorkspace } from "@/lib/competition";
import styles from "@/components/admin/competition-workspace.module.css";

export function CompetitionEntryForm({ workspace: w, onSaved }: { workspace: CompetitionWorkspace; onSaved: () => Promise<void> }) {
  const [entrant, setEntrant] = useState(w.candidates[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [now] = useState(() => Date.now());
  const written = w.event.entry_format === "text";
  const candidate = w.candidates.find(c => c.key === entrant);
  const entry = w.entries.find(e => e.application_id === candidate?.application_id && e.group_id === candidate?.group_id);
  const closed = !w.settings?.submission_closes_at || Date.parse(w.settings.submission_closes_at) <= now || !!w.rounds.length;
  if (!candidate) return <p>Submission is available after your registration or final team/pair is approved. <Link href="/my-fest">View My Fest</Link></p>;
  return <form className={styles.card} key={entry?.id ?? entrant} onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      let mediaId = form.get("removeImage") ? null : entry?.media_id ?? null;
      const file = form.get("file");
      if (file instanceof File && file.size) {
        const response = await fetch("/api/competition/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: w.event.id, mime: file.type, size: file.size }) });
        const auth = await response.json(); if (!response.ok) throw new Error(auth.error);
        const uploaded = await fetch(auth.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file, credentials: "omit" });
        if (!uploaded.ok) throw new Error("Upload failed. Check your connection and retry.");
        const finalised = await fetch("/api/competition/media", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalise", mediaId: auth.mediaId }) });
        const ready = await finalised.json(); if (!finalised.ok) throw new Error(ready.error); mediaId = ready.mediaId;
      }
      const response = await fetch("/api/competition", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: w.event.id, action: "entry", data: { application_id: candidate.application_id, group_id: candidate.group_id, version: entry?.version ?? 0, title: form.get("title"), description: form.get("description"), media_id: mediaId, submit: true } }) });
      const saved = await response.json(); if (!response.ok) throw new Error(saved.error);
      await onSaved(); setMessage("Submitted for approval. Replacing your work before the deadline requires approval again.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connect to submit your work. Please retry."); }
    finally { setBusy(false); }
  }}>
    {closed && <p role="status">Submissions are closed or the deadline has not been announced.</p>}
    <fieldset disabled={busy || closed || entry?.state === "disqualified"} className={styles.fieldset}>
      <label>Participant / team<select aria-label="Participant / team" value={entrant} onChange={e => setEntrant(e.target.value)}>{w.candidates.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      <p>{entry ? `Entry ${entry.entry_number} · ${entry.state}${entry.note ? ` · ${entry.note}` : ""}` : "One final entry per approved participant, pair or team."}</p>
      <label>Work title<input name="title" required maxLength={160} defaultValue={entry?.title ?? ""} /></label>
      <label>{written ? "Your written work" : "Description (optional)"}<textarea name="description" required={written} rows={written ? 12 : 3} maxLength={10000} defaultValue={entry?.description ?? ""} /><small>{written ? "Up to 10,000 characters. Paragraphs and line breaks are preserved." : "Describe your work briefly."}</small></label>
      <label>{written ? "Image (optional)" : entry?.media_id ? "Replace image (optional)" : "Image · JPEG, PNG or WebP · max 5 MB"}<input name="file" type="file" accept="image/jpeg,image/png,image/webp" required={!written && !entry?.media_id} /></label>
      {entry?.media_id && <><Link href={`/api/media/${entry.media_id}`} target="_blank" rel="noopener noreferrer">Preview saved image ↗</Link>{written && <label className={styles.check}><input type="checkbox" name="removeImage" />Remove the existing optional image</label>}</>}
      <button className="portal-primary">{busy ? "Submitting…" : "Submit work for approval"}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </form>;
}
