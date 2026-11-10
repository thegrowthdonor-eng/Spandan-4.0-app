"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isTodayOrLive, type ScoringMatch } from "@/lib/match-scoring";
import { istDate } from "@/lib/match-clock";
import { MatchScoreAction } from "@/components/admin/match-score-action";
import styles from "./scoring.module.css";

export function MatchScoringClient({ matches, serverNow }: { matches: ScoringMatch[]; serverNow: number }) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  const [tab, setTab] = useState("today");
  const [query, setQuery] = useState("");
  useEffect(() => { const timer = setInterval(() => setNow(value => value + 15_000), 15_000); return () => clearInterval(timer); }, []);
  const today = matches.filter(match => isTodayOrLive(match, now));
  const upcoming = matches.filter(match => !match.actual_started_at && match.starts_at && istDate(match.starts_at) > istDate(now));
  const visible = (tab === "today" ? today : upcoming).filter(match => `${match.event_title} ${match.participant_a_label} ${match.participant_b_label} ${match.venue ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <main className={styles.page}>
    <header className={styles.header}><div><p>Ground operations · IST</p><h1>Score matches</h1><span>Your assigned matches. Start once, score straight away.</span></div><button type="button" className="portal-secondary" onClick={() => router.refresh()}>Refresh matches</button></header>
    <div className={styles.controls}><div className={styles.tabs}><button type="button" aria-pressed={tab === "today"} onClick={() => setTab("today")}>Today & live ({today.length})</button><button type="button" aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming ({upcoming.length})</button></div><input type="search" aria-label="Search scoring matches" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find event, team or venue" /></div>
    <div className={styles.matches}>{visible.map(match => <article key={match.id} className={styles.match}>
      <div className={styles.top}><span>{match.event_title} · {match.stage}</span><b>{match.state === "completed" ? "Finished" : match.actual_started_at ? "Started" : "Scheduled"}</b></div>
      <h2>{match.participant_a_label}<span>vs</span>{match.participant_b_label}</h2><p>{match.starts_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(match.starts_at)) : "Time to be announced"} · {match.venue ?? "Venue to be confirmed"}</p>
      <MatchScoreAction match={match} now={now} /><Link className={styles.details} href={`/admin/fixtures?event=${match.event_id}`}>Schedule & match details ↗</Link>
    </article>)}</div>
    {!visible.length && <section className={styles.empty}><h2>{query ? "No matching matches" : tab === "today" ? "No matches to score today" : "No upcoming matches"}</h2><p>{query ? "Try a different event or team name." : "Scheduled matches appear here automatically. You can also reopen a prepared match in the offline scorer."}</p><Link className="portal-secondary" href="/scorer">Open prepared scorer</Link></section>}
    <p className={styles.note}>Need to change the schedule? <Link href="/admin/fixtures">Manage fixtures</Link>. First-time match start needs a connection; prepared scoring works offline.</p>
  </main>;
}
