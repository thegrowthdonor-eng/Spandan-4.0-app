"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import styles from "./feed.module.css";

export type FeedPost = { id: string; kind: "live" | "result" | "moment" | "upcoming"; title: string; body: string; meta: string; imageUrl?: string | null; imageAlt?: string; score?: string; href?: string; initials: string };
const labels = { live: "Match update", result: "Official result", moment: "Campus moment", upcoming: "Up next" };

function Icon({ name }: { name: "heart" | "send" | "save" }) {
  const paths = {
    heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.9-8.6a5.5 5.5 0 0 0-.1-7.8Z",
    send: "m21 3-7.5 18-3.8-7.7L2 9.5 21 3Zm-11.4 10.3L15 8",
    save: "M6 3h12v18l-6-3.8L6 21V3Z",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

export function FeedClient({ posts }: { posts: FeedPost[] }) {
  const [liked, setLiked] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [view, setView] = useState<"latest" | "saved">("latest");
  const [message, setMessage] = useState("");
  const visible = view === "saved" ? posts.filter(post => saved.includes(post.id)) : posts;

  async function share(post: FeedPost) {
    const url = new URL(post.href ?? "/feed", window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: post.title, text: post.body, url });
      else { await navigator.clipboard.writeText(url); setMessage("Link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setMessage("Sharing is unavailable. Open details to share this update.");
    }
  }

  return <>
    <div className={styles.toolbar}>
      <div className={styles.tabs} aria-label="Feed view">
        <button aria-pressed={view === "latest"} onClick={() => setView("latest")}>Latest</button>
        <button aria-pressed={view === "saved"} onClick={() => setView("saved")}>Saved</button>
      </div>
      <span className={styles.edition}>THE CAMPUS EDITION</span>
    </div>
    {message && <p className={styles.status} role="status">{message}</p>}
    <section className={styles.stream} aria-label={view === "latest" ? "Festival updates" : "Saved updates"}>
      {visible.map(post => {
        const isLiked = liked.includes(post.id);
        const isSaved = saved.includes(post.id);
        const hasImage = Boolean(post.imageUrl && !failedImages.includes(post.id));
        return <article className={styles.post} key={post.id}>
          <header className={styles.postHeader}>
            <span className={styles.avatar}>{post.initials}</span>
            <div className={styles.author}><strong>spandan.official <span aria-label="Official account">✓</span></strong><span>{post.meta}</span></div>
            <span className={styles.kind}>{labels[post.kind]}</span>
          </header>
          {hasImage ? <div className={styles.photo}>
            {/* Official media URLs may come from different publishing hosts. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.imageUrl ?? ""} alt={post.imageAlt ?? post.title} loading="lazy" decoding="async" onError={() => setFailedImages(ids => ids.includes(post.id) ? ids : [...ids, post.id])} />
          </div> : <div className={styles.update} data-kind={post.kind}>
            <span className={styles.updateLabel}>{labels[post.kind]}</span>
            <h2>{post.title}</h2>
            {post.score && <p className={styles.score}>{post.score}</p>}
            <span className={styles.updateFoot}>SPANDAN 4.0 <span>ASMC FIROZABAD</span></span>
          </div>}
          <div className={styles.body}>
            <div className={styles.actions}>
              <button className={isLiked ? styles.liked : ""} aria-label={isLiked ? "Unlike update" : "Like update"} aria-pressed={isLiked} onClick={() => setLiked(ids => isLiked ? ids.filter(id => id !== post.id) : [...ids, post.id])}><Icon name="heart" /></button>
              <button aria-label="Share update" onClick={() => share(post)}><Icon name="send" /></button>
              <button className={isSaved ? styles.saved : ""} aria-label={isSaved ? "Unsave update" : "Save update"} aria-pressed={isSaved} onClick={() => { setSaved(ids => isSaved ? ids.filter(id => id !== post.id) : [...ids, post.id]); setMessage(isSaved ? "Removed from saved." : "Saved for this visit."); }}><Icon name="save" /></button>
            </div>
            {hasImage && <h2 className={styles.captionTitle}>{post.title}</h2>}
            <p className={styles.caption}>{post.body}</p>
            {post.href && <Link className={styles.details} href={post.href}>View {post.kind === "result" ? "results" : post.kind === "moment" ? "gallery" : "event"} <span aria-hidden="true">↗</span></Link>}
          </div>
        </article>;
      })}
      {!visible.length && <div className={styles.empty}>
        <div className={styles.emptyArt}><Image src="/visuals/campus-moments.webp" alt="A collage of track, badminton and stage moments" width={1440} height={960} sizes="(max-width: 600px) calc(100vw - 64px), 520px" /></div>
        <span className={styles.updateLabel}>{view === "saved" ? "YOUR COLLECTION" : "A CAMPUS WORTH REMEMBERING"}</span>
        <h2>{view === "saved" ? "Keep the good ones." : "The moments start here."}</h2>
        <p>{view === "saved" ? "Tap the bookmark on an update to keep it here during this visit." : "Photos from the field. Wins from the stage. Your campus, all in one feed. Updates appear as the team publishes them."}</p>
        <Link href="/events">Explore the line-up <span aria-hidden="true">↗</span></Link>
      </div>}
    </section>
  </>;
}
