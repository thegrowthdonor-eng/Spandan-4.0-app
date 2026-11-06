"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImageFile, formatFileSize } from "@/lib/image-compressor";
import { maxGalleryImageBytes } from "@/lib/gallery";
import styles from "./gallery-admin.module.css";

type EventOption = { event_id: string; event_title: string; starts_at: string | null };
type Moment = { id: string; event_id: string; event_title: string; caption: string; occurred_at: string; is_owner: boolean; imageUrl: string };

function istInput(value = new Date().toISOString()) {
  return new Date(new Date(value).valueOf() + 330 * 60_000).toISOString().slice(0, 16);
}

function toIso(value: string) {
  return new Date(`${value}:00+05:30`).toISOString();
}

export function GalleryManager({ events, initialMoments }: { events: EventOption[]; initialMoments: Moment[] }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [eventId, setEventId] = useState(events[0]?.event_id ?? "");
  const [caption, setCaption] = useState("");
  const [occurredAt, setOccurredAt] = useState(istInput());
  const [moments, setMoments] = useState(initialMoments);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function choose(raw: File | undefined) {
    if (!raw) return;
    setBusy(true); setMessage("Optimising photo and removing device metadata…");
    try {
      const result = await compressImageFile(raw, { maxWidth: 1280, maxHeight: 1280, quality: 0.7, mimeType: "image/webp", alwaysReencode: true });
      if (result.file.type !== "image/webp") throw new Error("This browser cannot prepare a WebP photo. Try a current Chrome, Edge or Safari version.");
      if (result.compressedSize > maxGalleryImageBytes) throw new Error("This photo is still too detailed after compression. Choose a simpler photo or crop it first.");
      if (preview) URL.revokeObjectURL(preview);
      setPhoto(result.file);
      setPreview(URL.createObjectURL(result.file));
      setMessage(`Ready · ${formatFileSize(result.compressedSize)}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Photo could not be prepared."); }
    finally { setBusy(false); if (cameraRef.current) cameraRef.current.value = ""; if (pickerRef.current) pickerRef.current.value = ""; }
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (!photo) { setMessage("Take or choose a photo first."); return; }
    setBusy(true); setMessage("Publishing moment…");
    const form = new FormData();
    form.append("file", photo); form.append("eventId", eventId); form.append("caption", caption); form.append("occurredAt", toIso(occurredAt));
    const response = await fetch("/api/admin/gallery-moments", { method: "POST", body: form });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setMessage(result.error ?? "Moment could not be published."); setBusy(false); return; }
    router.push("/gallery");
    router.refresh();
  }

  async function save(moment: Moment, form: FormData) {
    setBusy(true); setMessage("Saving changes…");
    const nextEventId = String(form.get("eventId"));
    const nextCaption = String(form.get("caption"));
    const nextOccurredAt = toIso(String(form.get("occurredAt")));
    const response = await fetch("/api/admin/gallery-moments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      momentId: moment.id,
      eventId: nextEventId,
      caption: nextCaption,
      occurredAt: nextOccurredAt,
    }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setMessage(result.error ?? "Moment could not be updated.");
    else {
      setMoments(current => current.map(item => item.id === moment.id ? { ...item, event_id: nextEventId, event_title: events.find(event => event.event_id === nextEventId)?.event_title ?? item.event_title, caption: nextCaption.trim(), occurred_at: nextOccurredAt } : item));
      setMessage("Moment updated."); setEditing(null); router.refresh();
    }
    setBusy(false);
  }

  async function remove(moment: Moment) {
    if (!window.confirm("Delete this published moment? The photo cannot be recovered.")) return;
    setBusy(true); setMessage("Deleting moment…");
    const response = await fetch("/api/admin/gallery-moments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ momentId: moment.id }) });
    const result = await response.json() as { error?: string; cleanupPending?: boolean };
    if (!response.ok) setMessage(result.error ?? "Moment could not be deleted.");
    else { setMoments(current => current.filter(item => item.id !== moment.id)); setMessage(result.cleanupPending ? "Moment removed; storage cleanup will need a retry." : "Moment deleted."); }
    setBusy(false);
  }

  return <div className={styles.content}>
    <section className={styles.composer} aria-labelledby="add-moment-title">
      <div className={styles.sectionHeading}><p className={styles.eyebrow}>New post</p><h2 id="add-moment-title">Add a festival moment</h2><p>Camera and photo-library access is requested only after you choose a source below.</p></div>
      {events.length ? <form onSubmit={publish} className={styles.form}>
        <input ref={cameraRef} className={styles.fileInput} type="file" accept="image/*" capture="environment" onChange={event => void choose(event.target.files?.[0])} />
        <input ref={pickerRef} className={styles.fileInput} type="file" accept="image/*" onChange={event => void choose(event.target.files?.[0])} />
        <div className={styles.sourceButtons}>
          <button type="button" onClick={() => cameraRef.current?.click()} disabled={busy}>Take photo</button>
          <button type="button" onClick={() => pickerRef.current?.click()} disabled={busy}>Choose from device</button>
        </div>
        {preview ? <div className={styles.preview}>
          {/* Blob previews cannot be handled by next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Selected moment preview" />
        </div> : <div className={styles.placeholder}>Your selected photo will appear here.</div>}
        <label>Event<select value={eventId} onChange={event => setEventId(event.target.value)} required>{events.map(item => <option key={item.event_id} value={item.event_id}>{item.event_title}</option>)}</select></label>
        <label>Caption<textarea value={caption} onChange={event => setCaption(event.target.value)} maxLength={1000} rows={4} required placeholder="What is happening in this moment?" /><small>{caption.length}/1000</small></label>
        <label>Moment date and time (IST)<input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} required /></label>
        <button className={styles.publish} type="submit" disabled={busy || !photo}>{busy ? "Please wait…" : "Publish moment"}</button>
      </form> : <p className={styles.empty}>No published event is available for a gallery moment.</p>}
      {message ? <p className={styles.status} role="status" aria-live="polite">{message}</p> : null}
    </section>

    <section className={styles.library} aria-labelledby="manage-moments-title">
      <div className={styles.sectionHeading}><p className={styles.eyebrow}>Published</p><h2 id="manage-moments-title">Manage moments</h2><p>You can edit your posts. Main Admins can manage every published moment.</p></div>
      <div className={styles.momentList}>{moments.map(moment => <article className={styles.moment} key={moment.id}>
        {/* Public Storage URLs are already compressed and CDN-backed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={moment.imageUrl} alt={moment.caption} loading="lazy" />
        {editing === moment.id ? <form action={form => void save(moment, form)} className={styles.editForm}>
          <label>Event<select name="eventId" defaultValue={moment.event_id}>{events.map(item => <option key={item.event_id} value={item.event_id}>{item.event_title}</option>)}</select></label>
          <label>Caption<textarea name="caption" defaultValue={moment.caption} maxLength={1000} rows={3} required /></label>
          <label>Moment date and time (IST)<input name="occurredAt" type="datetime-local" defaultValue={istInput(moment.occurred_at)} required /></label>
          <div className={styles.actions}><button type="submit" disabled={busy}>Save</button><button type="button" onClick={() => setEditing(null)}>Cancel</button></div>
        </form> : <div className={styles.momentCopy}><strong>{moment.event_title}</strong><p>{moment.caption}</p><time>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(moment.occurred_at))} IST</time><div className={styles.actions}><button type="button" onClick={() => setEditing(moment.id)}>Edit</button><button type="button" className={styles.delete} onClick={() => void remove(moment)} disabled={busy}>Delete</button></div></div>}
      </article>)}</div>
      {!moments.length ? <p className={styles.empty}>No manageable moments have been published yet.</p> : null}
    </section>
  </div>;
}
