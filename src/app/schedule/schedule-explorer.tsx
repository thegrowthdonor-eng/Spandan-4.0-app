"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { defaultScheduleDay, festivalDays, scheduleCategories, scheduleDay, scheduleStatus, scheduleTime, sortSchedule, type ScheduleEntry } from "@/lib/schedule";
import styles from "./schedule.module.css";

function fullDate(day: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date(`${day}T12:00:00+05:30`));
}

export function ScheduleExplorer({ entries, unavailable, partial, serverNow }: { entries: ScheduleEntry[]; unavailable: boolean; partial: boolean; serverNow: string }) {
  const params = useSearchParams();
  const dates = [...new Set([...festivalDays, ...entries.map(e => e.day).filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day))])].sort();
  const requestedDay = params.get("day");
  const day = requestedDay === "unscheduled" || dates.includes(requestedDay ?? "") ? requestedDay! : defaultScheduleDay(entries, serverNow);
  const today = scheduleDay(serverNow);
  const query = params.get("q") ?? "";
  const filter = params.get("category") ?? "all";
  const selectedDate = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { selectedDate.current?.scrollIntoView({ block: "nearest", inline: "center" }); }, [day]);
  const dayEntries = entries.filter(e => e.day === day);
  const categories = [...new Set(dayEntries.map(e => e.category))];
  const category = categories.includes(filter) ? filter : "all";
  const visible = dayEntries.filter(e => (category === "all" || e.category === category) && `${e.title} ${e.venue ?? ""} ${e.notes}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort(sortSchedule);
  const timed = visible.filter(e => e.starts_at);
  const untimed = visible.filter(e => !e.starts_at);

  function change(values: Record<string, string | null>, replace = false) {
    const next = new URLSearchParams(params.toString()); next.set("day", day);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    window.history[replace ? "replaceState" : "pushState"](null, "", `?${next}`);
  }
  function agenda(items: ScheduleEntry[]) {
    return <ol className={styles.agenda}>{items.map(entry => {
      const status = scheduleStatus(entry.state);
      return <li key={entry.id} className={`${styles.card} ${status === "Cancelled" ? styles.cancelledCard : ""}`}>
        <div className={styles.timeColumn}><span>{scheduleTime(entry.starts_at)}</span>{entry.ends_at && <small>until {scheduleTime(entry.ends_at)}</small>}</div>
        <div className={styles.cardBody}>
          <div className={styles.cardTop}><span className={styles.category}>{scheduleCategories[entry.category] ?? "Programme"}</span><span className={styles.status} data-state={status}>{status}</span></div>
          <h3>{entry.title}</h3>{entry.notes && <p className={styles.notes}>{entry.notes}</p>}
          <p className={styles.venue}><span aria-hidden="true">⌖</span>{entry.venue?.trim() || "Venue to be announced"}</p>
          {entry.reporting_at && <p className={styles.reporting}>Report by <strong>{scheduleTime(entry.reporting_at)}</strong></p>}
          {entry.href && <Link prefetch={false} href={entry.href} className={styles.eventLink}>View event <span aria-hidden="true">↗</span></Link>}
        </div>
      </li>;
    })}</ol>;
  }
  return <section className={styles.explorer} aria-label="Festival schedule">
    <header className={styles.hero}><div><p className={styles.eyebrow}>SPANDAN 4.0 · 1–8 DECEMBER 2026</p><h1>Your festival, day by day.</h1><p>Find your event. Know when and where to be.</p></div><span className={styles.location}>ASMC Firozabad<br/><small>All times in IST</small></span></header>
    <nav className={styles.dates} aria-label="Choose a festival date">{dates.map(date => <button key={date} ref={date === day ? selectedDate : undefined} type="button" aria-pressed={date === day} onClick={() => change({ day: date, category: null })}><small>{date === today ? "TODAY" : new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${date}T12:00:00+05:30`))}</small><strong>{date.slice(-2)}</strong><span>{new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "Asia/Kolkata" }).format(new Date(`${date}T12:00:00+05:30`))}</span></button>)}{entries.some(e => e.day === "unscheduled") && <button type="button" aria-pressed={day === "unscheduled"} onClick={() => change({ day: "unscheduled", category: null })}>Date to be<br/>announced</button>}</nav>
    <div className={styles.toolbar}><label className={styles.search}><span aria-hidden="true">⌕</span><span className={styles.srOnly}>Search events, teams or venues</span><input type="search" value={query} onChange={e => change({ q: e.target.value || null }, true)} placeholder="Search events, teams or venues" /></label><div className={styles.filters} role="group" aria-label="Filter programme"><button type="button" aria-pressed={category === "all"} onClick={() => change({ category: null })}>All events</button>{categories.map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => change({ category: key })}>{scheduleCategories[key] ?? "Programme"}</button>)}</div></div>
    <div className={styles.dayHeading}><div><p className={styles.eyebrow}>{day === today ? "TODAY’S PROGRAMME" : "THE PROGRAMME"}</p><h2>{day === "unscheduled" ? "Date to be announced" : fullDate(day)}</h2></div><span aria-live="polite">{visible.length} {visible.length === 1 ? "item" : "items"}</span></div>
    {unavailable && <p role="alert" className={styles.alert}>The schedule is temporarily unavailable. Please refresh to try again.</p>}
    {partial && !unavailable && <p role="status" className={styles.alert}>Some updates could not be loaded. The available programme is shown below.</p>}
    {timed.length > 0 && agenda(timed)}
    {untimed.length > 0 && <section className={styles.untimed} aria-label="Time to be announced"><h2>Time to be announced</h2><p>{day === "unscheduled" ? "The date and exact timings will be shared when confirmed." : "The date is planned. Exact timings will be shared here when confirmed."}</p>{agenda(untimed)}</section>}
    {!visible.length && !unavailable && <div className={styles.empty}><h3>{query || category !== "all" ? "No matching events" : "Programme coming soon"}</h3><p>{query || category !== "all" ? "Try a different event, team or venue, or clear your filters." : "There are no published items for this date yet. Choose another date to explore."}</p>{(query || category !== "all") && <button type="button" onClick={() => change({ q: null, category: null })}>Clear filters</button>}</div>}
    <p className={styles.footerNote}>All times IST. Plans can change. Check here before heading to your event. <Link prefetch={false} href="/notices">Latest notices ↗</Link></p>
  </section>;
}
