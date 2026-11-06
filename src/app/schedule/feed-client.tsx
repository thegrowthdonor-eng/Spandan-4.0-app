"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PodiumCard } from "@/components/podium-card";
import type { FestivalFeedPost } from "@/lib/feed";
import { batchName } from "@/lib/results";
import styles from "./feed.module.css";

function Icon({ name }: { name: "send" | "save" }) {
  const paths = {
    send: "m21 3-7.5 18-3.8-7.7L2 9.5 21 3Zm-11.4 10.3L15 8",
    save: "M6 3h12v18l-6-3.8L6 21V3Z",
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value));
}

function postCopy(post: FestivalFeedPost) {
  if (post.kind === "result") return { title: post.result.event_title, text: post.result.podium_caption ?? "Official festival result" };
  if (post.kind === "moment") return { title: post.moment.event_title, text: post.moment.caption };
  if (post.kind === "notice") return { title: post.notice.title, text: post.notice.body };
  return { title: "Current batch standings", text: "Official championship rankings" };
}

function downloadHref(post: FestivalFeedPost) {
  const id = post.kind === "result" ? post.result.event_id : post.kind === "moment" ? post.moment.id : post.kind === "notice" ? post.notice.id : "current";
  return `/api/feed-download?${new URLSearchParams({ type: post.kind, id })}`;
}

function PostHeader({ kind, at }: { kind: FestivalFeedPost["kind"]; at: string }) {
  const label = kind === "result" ? "Official result" : kind === "standings" ? "Batch standings" : kind === "moment" ? "Campus moment" : "Official notice";
  return <header className={styles.postHeader}>
    <span className={styles.avatar}>SP</span>
    <div className={styles.author}><strong>spandan.official <span aria-label="Official account">✓</span></strong><span>{formatTime(at)} IST</span></div>
    <span className={styles.kind}>{label}</span>
  </header>;
}

function Actions({ post, onMessage }: { post: FestivalFeedPost; onMessage: (message: string) => void }) {
  async function share() {
    const copy = postCopy(post);
    const href = post.kind === "result" ? `/events/${post.result.event_slug}` : post.kind === "moment" ? "/gallery" : post.kind === "notice" ? "/notices" : "/standings";
    const url = new URL(href, window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: copy.title, text: copy.text, url });
      else { await navigator.clipboard.writeText(url); onMessage("Link copied."); }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) onMessage("Sharing is unavailable on this browser.");
    }
  }

  function saveToPhone() {
    const link = document.createElement("a");
    link.href = downloadHref(post);
    link.download = "";
    document.body.appendChild(link);
    link.click();
    link.remove();
    onMessage("Your browser will ask where to save the file.");
  }

  return <div className={styles.actions}>
    <button aria-label="Share update" title="Share update" onClick={() => void share()}><Icon name="send" /></button>
    <button className={styles.saveToPhone} aria-label="Save to phone" title="Save to phone" onClick={saveToPhone}><Icon name="save" /><span>Save to phone</span></button>
  </div>;
}

export function FeedClient({ posts }: { posts: FestivalFeedPost[] }) {
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  return <>
    <div className={styles.toolbar}><span className={styles.edition}>THE CAMPUS EDITION · LATEST FIRST</span></div>
    {message && <p className={styles.status} role="status">{message}</p>}
    <section className={styles.stream} aria-label="Festival updates">
      {posts.map((post) => {
        if (post.kind === "result") return <article className={`${styles.post} ${styles.resultPost}`} key={post.id}><PostHeader kind={post.kind} at={post.at} /><PodiumCard result={post.result} /><div className={styles.body}><Actions post={post} onMessage={setMessage} /></div></article>;
        if (post.kind === "standings") return <article className={styles.post} key={post.id}><PostHeader kind={post.kind} at={post.at} /><div className={styles.update} data-kind="standings"><span className={styles.updateLabel}>Batch championship</span><h2>Current batch standings</h2><ol className={styles.standings}>{post.standings.slice(0, 3).map((standing, index) => <li key={standing.batch_id}><span>#{index + 1}</span><strong>{batchName(standing.label)}</strong><b>{standing.points} pts</b></li>)}</ol><Link className={styles.cardLink} href="/standings">View all standings →</Link></div><div className={styles.body}><Actions post={post} onMessage={setMessage} /></div></article>;
        if (post.kind === "moment") {
          const failed = failedImages.includes(post.id);
          return <article className={styles.post} key={post.id}><PostHeader kind={post.kind} at={post.at} />{failed ? <div className={`${styles.photo} ${styles.photoFallback}`}>Official festival moment</div> : <div className={styles.photo}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={post.moment.imageUrl} alt={post.moment.caption} loading="lazy" decoding="async" onError={() => setFailedImages((ids) => ids.includes(post.id) ? ids : [...ids, post.id])} />
          </div>}<div className={styles.body}><Actions post={post} onMessage={setMessage} /><h2 className={styles.captionTitle}>{post.moment.event_title}</h2><p className={styles.caption}>{post.moment.caption}</p><Link className={styles.details} href={`/events/${post.moment.event_slug}`}>View event <span aria-hidden="true">↗</span></Link></div></article>;
        }
        return <article className={styles.post} key={post.id}><PostHeader kind={post.kind} at={post.at} /><div className={styles.update} data-kind="notice"><span className={styles.updateLabel}>{post.notice.urgency} notice{post.notice.event_title ? ` · ${post.notice.event_title}` : ""}</span><h2>{post.notice.title}</h2><p>{post.notice.body}</p><Link className={styles.cardLink} href="/notices">Open notices →</Link></div><div className={styles.body}><Actions post={post} onMessage={setMessage} /></div></article>;
      })}
      {!posts.length && <div className={styles.empty}><div className={styles.emptyArt}><Image src="/visuals/campus-moments.webp" alt="A collage of track, badminton and stage moments" width={1440} height={960} sizes="(max-width: 600px) calc(100vw - 64px), 520px" /></div><span className={styles.updateLabel}>A CAMPUS WORTH REMEMBERING</span><h2>The moments start here.</h2><p>Official results, notices and gallery moments will appear here as the festival team publishes them.</p><Link href="/events">Explore the line-up <span aria-hidden="true">↗</span></Link></div>}
    </section>
  </>;
}
