"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { maxGalleryImageBytes } from "@/lib/gallery";
import { compressImageFile } from "@/lib/image-compressor";
import styles from "./gallery.module.css";

export function PostComposer() {
  const router = useRouter();
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const preview = photo?.preview;

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choose(file: File | undefined) {
    setPhoto(null);
    setMessage("");
    if (!file) return;
    setBusy(true);
    try {
      const { file: compressed } = await compressImageFile(file, {
        maxWidth: 1280, maxHeight: 1280, quality: 0.7, mimeType: "image/webp", alwaysReencode: true,
      });
      if (compressed.type !== "image/webp" || compressed.size > maxGalleryImageBytes) {
        setMessage("This photo could not be compressed to 600 KB. Choose another photo.");
        return;
      }
      setPhoto({ file: compressed, preview: URL.createObjectURL(compressed) });
    } catch {
      setMessage("Unable to prepare this photo. Try a smaller JPEG, PNG or WebP photo.");
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photo || busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("file", photo.file);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/gallery/posts", { method: "POST", body: data });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Unable to publish your post. Please try again.");
      }
      form.reset();
      setPhoto(null);
      setMessage("Post published.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to publish your post. Please try again.");
    } finally { setBusy(false); }
  }

  return <details className={styles.composer}>
    <summary className={styles.add}>+ Add post</summary>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <label htmlFor="gallery-photo">Photo</label>
        <input id="gallery-photo" type="file" accept="image/*" required onChange={event => void choose(event.currentTarget.files?.[0])} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo && <img src={photo.preview} alt="Selected photo preview" />}
        <label htmlFor="gallery-caption">Caption</label>
        <textarea id="gallery-caption" name="caption" rows={3} maxLength={1000} required />
        <button type="submit" disabled={!photo || busy}>{busy ? "Please wait…" : "Publish post"}</button>
      </fieldset>
      <p role="status">{message}</p>
    </form>
  </details>;
}
