"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatLiveScore, type LiveGroundItem, type LiveGroundPayload } from "@/lib/live-ground";
import styles from "./live.module.css";
import { formatMatchClock, matchClockSeconds } from "@/lib/match-clock";

const CACHE_KEY = "spandan_live_ground_v1";

function time(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Time to be announced";
}

function LiveCard({ item, now }: { item: LiveGroundItem; now: number }) {
  return <article className={styles.card} data-status={item.status}>
    <div className={styles.cardTop}><span>{item.status === "live" ? "● LIVE" : item.status.toUpperCase()}</span><small>{item.category}</small></div>
    <h2>{item.title}</h2>
    {item.subtitle && <p className={styles.subtitle}>{item.subtitle}</p>}
    {item.kind === "fixture" && <strong className={styles.score}>{formatLiveScore(item)}</strong>}
    {item.scorePayload && (item.scoreTemplate === "football" || item.scoreTemplate === "basketball") && <p className={styles.clock}><span>{item.scoreTemplate === "basketball" ? "Game clock" : "Match clock"}{item.scorePayload.clock_running !== true ? " · Paused" : ""}</span><strong>{formatMatchClock(matchClockSeconds(item.scorePayload, item.scoreTemplate === "basketball", now))}</strong></p>}
    {item.updateNote && <p>{item.updateNote}</p>}
    <dl>
      <div><dt>Venue</dt><dd>{item.venue ?? "To be confirmed"}</dd></div>
      <div><dt>{item.updatedAt ? "Updated" : "Starts"}</dt><dd>{time(item.updatedAt ?? item.startsAt)}</dd></div>
    </dl>
    <div className={styles.links}>
      {item.scoreProvider === "cricheroes" && item.externalScoreUrl && <a href={item.externalScoreUrl} target="_blank" rel="noopener noreferrer">Official CricHeroes score ↗</a>}
      {item.eventSlug && <Link href={`/events/${item.eventSlug}`}>Event details →</Link>}
    </div>
  </article>;
}

export function LiveGroundClient() {
  const [data, setData] = useState<LiveGroundPayload | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const requestedAt = Date.now();
      const response = await fetch("/api/public/live");
      if (!response.ok) throw new Error();
      const next = await response.json() as LiveGroundPayload;
      setData(next);
      const servedAt = Date.parse(response.headers.get("Date") ?? "");
      if (Number.isFinite(servedAt)) setServerOffset(servedAt + Number(response.headers.get("Age") ?? 0) * 1000 - (requestedAt + Date.now()) / 2);
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      setError("");
    } catch {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) try {
        const saved = JSON.parse(cached) as LiveGroundPayload;
        setData(current => current ?? saved);
      } catch { /* corrupt public cache is safe to ignore */ }
      setError("Live connection is unavailable. Showing the last saved update.");
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await load();
        schedule();
      }, 60_000);
    };
    schedule();
    return () => { clearTimeout(initial); clearTimeout(timer); };
  }, [load]);

  useEffect(() => {
    const tick = () => setNow(Date.now() + serverOffset);
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => { clearTimeout(initial); clearInterval(timer); };
  }, [serverOffset]);

  if (!data) return <div className={styles.state} role="status">{error || "Loading Live Ground…"}</div>;
  return <>
    <div className={styles.toolbar}><span>{data.live.length} live now · Updates every 60 sec</span><button onClick={() => void load()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button></div>
    {error && <p className={styles.offline} role="status">{error}</p>}
    <section className={styles.section}>
      <div className={styles.heading}><p>Live now</p><h1>The ground, as it happens.</h1></div>
      {data.live.length ? <div className={styles.liveGrid}>{data.live.map(item => <LiveCard key={`${item.kind}-${item.id}`} item={item} now={now} />)}</div> : <div className={styles.state}><h2>Ground is on standby.</h2><p>No coordinator has marked an event live. Scheduled items are listed below.</p></div>}
    </section>
    <section className={styles.section}>
      <div className={styles.heading}><p>Up next</p><h2>Festival call sheet</h2></div>
      <div className={styles.compactGrid}>{data.upcoming.map(item => <LiveCard key={`${item.kind}-${item.id}`} item={item} now={now} />)}</div>
    </section>
    {!!data.recent.length && <section className={styles.section}>
      <div className={styles.heading}><p>Recently finished</p><h2>Final whistles &amp; encores</h2></div>
      <div className={styles.compactGrid}>{data.recent.map(item => <LiveCard key={`${item.kind}-${item.id}`} item={item} now={now} />)}</div>
    </section>}
  </>;
}
