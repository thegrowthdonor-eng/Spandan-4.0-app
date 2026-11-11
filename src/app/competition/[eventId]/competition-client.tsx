"use client";

import Link from "next/link";
import { useCallback,useEffect,useState } from "react";
import { readCompetition,voteCompetition,type PublicCompetition } from "@/lib/public-competition";
import type { CompetitionWorkspace } from "@/lib/competition";
import { toISTInput } from "@/lib/match-clock";
import { CompetitionEntryForm } from "@/components/competition-entry-form";
import styles from "@/components/admin/competition-workspace.module.css";

export function PublicCompetitionClient({eventId}:{eventId:string}) {
  const [data,setData] = useState<PublicCompetition|null>(null);
  const [workspace,setWorkspace] = useState<CompetitionWorkspace|null>(null);
  const [message,setMessage] = useState("Loading competition…");
  const [busy,setBusy] = useState(false);
  const [receipts,setReceipts] = useState<Record<string,string>>({});
  const [now,setNow] = useState(0);
  const load = useCallback(async(force=false) => {
    try { const result = await readCompetition(eventId,force); setData(result); setNow(Date.now());setMessage(result ? "" : "This competition is not published."); }
    catch { setMessage("Unable to refresh. The last successful view is retained; check your connection."); }
  },[eventId]);
  useEffect(() => { const initial=setTimeout(()=>void load(),0);const visible = () => { if (!document.hidden) void load(); }; document.addEventListener("visibilitychange",visible);return () => {clearTimeout(initial);document.removeEventListener("visibilitychange",visible);} },[load]);
  useEffect(()=>{const timer=setInterval(()=>{if(!document.hidden)setNow(Date.now());},15_000);return()=>clearInterval(timer);},[]);
  async function openEntry() {
    setBusy(true);
    try { const response = await fetch(`/api/competition?event=${eventId}`,{cache:"no-store"});const body = await response.json();if (!response.ok) throw new Error(body.error);setWorkspace(body.workspace); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Sign in to submit an entry."); }
    finally { setBusy(false); }
  }
  async function vote(pollId:string,optionId:string) {
    if (busy || !window.confirm("Register your one final vote for this entry? Votes cannot be changed.")) return;
    setBusy(true);setMessage("");
    try { const receipt = await voteCompetition(pollId,optionId);setReceipts(values=>({...values,[pollId]:receipt.optionId}));setMessage("Vote registered. Your original receipt is retained on repeated taps."); }
    catch(error) { setMessage(error instanceof Error ? error.message : "Unable to vote. Retry safely."); }
    finally { setBusy(false); }
  }
  return <main className={styles.workspace} style={{maxWidth:1100,margin:"0 auto",padding:"clamp(1rem,4vw,3rem)"}}><header className={styles.banner}><div><Link href="/events">← Events</Link><h1>{data?.title ?? "Competition"}</h1><p>Schedule, approved work and official updates.</p></div><button type="button" disabled={busy} onClick={()=>void load(true)}>Refresh</button></header>{message && <p role="status" className={styles.message}>{message}</p>}
    {data?.settings?.result_mode === "public_vote" && <section className={styles.card}><h2>Your final entry</h2><p>Submission deadline: {toISTInput(data.settings.submission_closes_at).replace("T"," ")} IST. Replacement before the deadline returns the work to review.</p><button type="button" disabled={busy} onClick={()=>void openEntry()}>Submit / manage entry</button>{workspace && <CompetitionEntryForm workspace={workspace} onSaved={openEntry} />}</section>}
    {!!data?.entries.length && <section className={styles.grid}>{data.entries.map(entry => <article className={styles.card} key={entry.id}><p>Entry {entry.entry_number}</p><h2>{entry.title}</h2>{entry.image_url && <a href={entry.image_url} target="_blank" rel="noopener noreferrer" aria-label={`View ${entry.title} in full resolution`}><picture>{entry.thumbnail_url && <source media="(max-width: 720px)" srcSet={entry.thumbnail_url} />}<img src={entry.image_url} alt={entry.title} loading="lazy" style={{width:"100%",height:"auto",borderRadius:12}} /></picture></a>}{entry.description && (data.entryFormat==="text" ? <details className={styles.writtenWork}><summary>Read written work</summary><div>{entry.description}</div></details> : <p className={styles.writtenWork}>{entry.description}</p>)}{data.rounds.map(round => { const option = round.options.find(o=>o.entry_id === entry.id);if (!option) return null;const open = now >= Date.parse(round.opens_at) && now < Date.parse(round.closes_at);return <div key={round.id}><p>Round {round.round} · {toISTInput(round.opens_at)} → {toISTInput(round.closes_at)} IST</p>{option.votes !== null ? <p>{option.votes} votes · Voting closed</p> : <button type="button" disabled={busy || !open || !!receipts[round.id]} onClick={()=>void vote(round.id,option.id)}>{receipts[round.id] === option.id ? "✓ Vote registered" : receipts[round.id] ? "Vote already registered" : open ? `Vote for Entry ${entry.entry_number}` : "Voting not open"}</button>}</div>;})}</article>)}</section>}
    {data?.settings?.verified && <p>Voting ranking verified. Official winners and batch points appear in <Link href="/standings">Results & standings</Link> after publication.</p>}
    <p className={styles.note}>Public votes determine configured competition rankings. One immutable vote per active account per round. Totals stay hidden until close; podium ties require a separately scheduled runoff.</p>
  </main>;
}
