"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatLiveScore, type LiveGroundPayload } from "@/lib/live-ground";

function formatIST(iso: string | null) {
  if (!iso) return "Time to be announced";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "numeric", hour12: true, timeZone: "Asia/Kolkata" }).format(new Date(iso));
}

export function HappeningNowRadar() {
  const [data, setData] = useState<LiveGroundPayload | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const load = async () => {
      try { const response = await fetch("/api/public/live"); if (response.ok) { setData(await response.json() as LiveGroundPayload); setNow(Date.now()); } } catch { /* retain the last successful update */ }
    };
    void load();
    const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const current = data?.live[0];
  const upcomingCandidate = data?.upcoming[0];

  // A match is only "Up next" on the live radar if it starts within 12 hours (today)
  const isImminentToday = (iso: string | null | undefined): boolean => {
    if (!iso) return false;
    const time = new Date(iso).getTime();
    const diffHours = (time - now) / (1000 * 3600);
    return diffHours >= 0 && diffHours <= 12;
  };

  const upcoming = (upcomingCandidate?.startsAt && isImminentToday(upcomingCandidate.startsAt))
    ? upcomingCandidate
    : null;

  return <section className="radar-strip live" aria-labelledby="live-ground-title">
    <div className="radar-strip-content">
      <span className="radar-live-badge"><span className={`radar-pulse-dot ${current ? "active" : ""}`} aria-hidden />{current ? `${data?.live.length ?? 0} LIVE NOW` : "LIVE GROUND"}</span>
      <div className="radar-chip-text">
        <strong id="live-ground-title">{current?.title ?? upcoming?.title ?? "Ground desk is on standby"}</strong>
        <span>{current ? `${formatLiveScore(current)}${current.venue ? ` · ${current.venue}` : ""}` : upcoming ? `Up next ${formatIST(upcoming.startsAt)}${upcoming.venue ? ` · ${upcoming.venue}` : ""}` : "Scores and current programmes appear here when coordinators go live."}</span>
      </div>
    </div>
    <Link className="radar-chip-link" href="/live">Open Live Ground →</Link>
  </section>;
}
