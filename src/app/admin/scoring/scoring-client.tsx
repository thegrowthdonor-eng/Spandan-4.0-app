"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isTodayOrLive, type ScoringMatch } from "@/lib/match-scoring";
import { istDate } from "@/lib/match-clock";
import { MatchScoreAction } from "@/components/admin/match-score-action";
import styles from "./scoring.module.css";

export type RunSession={id:string;event_id:string;event_title:string;title:string;venue:string;starts_at:string;state:string;version:number;actual_started_at:string|null};
export type RunVoting={event_id:string;event_title:string;pending:number;verified:boolean};
export function MatchScoringClient({ matches, serverNow,sessions,voting }: { matches: ScoringMatch[]; serverNow: number;sessions:RunSession[];voting:RunVoting[] }) {
  const router = useRouter();
  const [now, setNow] = useState(serverNow);
  const [tab, setTab] = useState("today");
  const [query, setQuery] = useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(timer); }, []);
  const today = matches.filter(match => isTodayOrLive(match, now));
  const upcoming = matches.filter(match => !match.actual_started_at && match.starts_at && istDate(match.starts_at) > istDate(now));
  const visible = (tab === "today" ? today : upcoming).filter(match => `${match.event_title} ${match.participant_a_label} ${match.participant_b_label} ${match.venue ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const sessionToday=(s:RunSession)=>["live","paused"].includes(s.state) || istDate(s.starts_at) === istDate(now);
  const visibleSessions=sessions.filter(s=>(tab === "today" ? sessionToday(s) : !s.actual_started_at && istDate(s.starts_at)>istDate(now)) && `${s.event_title} ${s.title} ${s.venue}`.toLowerCase().includes(query.toLowerCase()));
  async function run(s:RunSession) {
    if (busy) return;setBusy(s.id);setMessage("");
    try {
      if (!s.actual_started_at) {const response=await fetch("/api/competition",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({eventId:s.event_id,action:"session_state",data:{session_id:s.id,version:s.version,state:"live"}})});const body=await response.json();if (!response.ok) throw new Error(body.error);}
      router.push(`/admin/fixtures?event=${s.event_id}#session-${s.id}`);
    }catch(error){setMessage(error instanceof Error ? error.message : "Connect to start this session.");}finally{setBusy(null);}
  }
  return <main className={styles.page}>
    <header className={styles.header}><div><p>Festival operations · IST</p><h1>Run events</h1><span>Your assigned matches, sessions and voting. Start once, operate straight away.</span></div><button type="button" className="portal-secondary" onClick={() => router.refresh()}>Refresh assignments</button></header>
    <div className={styles.controls}><div className={styles.tabs}><button type="button" aria-pressed={tab === "today"} onClick={() => setTab("today")}>Today & live ({today.length})</button><button type="button" aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming ({upcoming.length})</button></div><input type="search" aria-label="Search scoring matches" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find event, team or venue" /></div>
    <div className={styles.matches}>{visible.map(match => <article key={match.id} className={styles.match}>
      <div className={styles.top}><span>{match.event_title} · {match.stage}</span><b>{match.state === "completed" ? "Finished" : match.actual_started_at ? "Started" : "Scheduled"}</b></div>
      <h2>{match.participant_a_label}<span>vs</span>{match.participant_b_label}</h2><p>{match.starts_at ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(match.starts_at)) : "Time to be announced"} · {match.venue ?? "Venue to be confirmed"}</p>
      <MatchScoreAction match={match} now={now} /><Link className={styles.details} href={`/admin/fixtures?event=${match.event_id}`}>Schedule & match details ↗</Link>
    </article>)}</div>
    {message && <p role="alert">{message}</p>}
    <div className={styles.matches}>{visibleSessions.map(s=><article className={styles.match} key={s.id}><div className={styles.top}><span>{s.event_title}</span><b>{s.state}</b></div><h2>{s.title}</h2><p>{s.venue} · {new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"}).format(new Date(s.starts_at))}</p><button type="button" className="portal-primary" disabled={!!busy || (!s.actual_started_at && istDate(s.starts_at)!==istDate(now))} onClick={()=>void run(s)}>{busy === s.id ? "Starting…" : s.actual_started_at ? "Enter results / run session →" : "Start → Enter results"}</button></article>)}</div>
    {voting.filter(v=>v.event_title.toLowerCase().includes(query.toLowerCase())).map(v=><article className={styles.match} key={v.event_id}><div className={styles.top}><span>{v.event_title}</span><b>{v.verified ? "Verified" : "Public voting"}</b></div><p>{v.pending} entries awaiting review</p><Link className="portal-primary" href={`/admin/fixtures?event=${v.event_id}`}>Review entries & manage voting →</Link></article>)}
    {!visible.length && !visibleSessions.length && <section className={styles.empty}><h2>{query ? "No matching scheduled items" : tab === "today" ? "No scheduled items today" : "No upcoming items"}</h2><p>Published assignments appear here. Prepared match scoring remains available offline.</p><Link className="portal-secondary" href="/scorer">Open prepared scorer</Link></section>}
    <p className={styles.note}>Need to change the schedule? <Link href="/admin/fixtures">Manage fixtures</Link>. First-time match start needs a connection; prepared scoring works offline.</p>
  </main>;
}
