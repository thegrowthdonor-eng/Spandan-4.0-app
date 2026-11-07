"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { festivalDays, scheduleTime, sortSchedule, type ScheduleEntry } from "@/lib/schedule";
import styles from "./schedule.module.css";

const groups = [
  { key: "opening", label: "Opening ceremony", icon: "✦", caption: "The beginning of something special", className: "opening" },
  { key: "sport", label: "Sports", icon: "↗", caption: "On the field. In the game.", className: "sport" },
  { key: "cultural", label: "Cultural & creative", icon: "✳", caption: "A stage for every kind of talent", className: "cultural" },
  { key: "fixture", label: "Match fixtures", icon: "↔", caption: "Teams, venues and match timings", className: "sport" },
  { key: "evening", label: "After hours", icon: "☾", caption: "Stay a little longer", className: "evening" },
];
const themes = [
  "Sports Qualifiers — Day 1",
  "Sports Qualifiers — Day 2",
  "Opening day",
  "Game on",
  "Colour & competition",
  "Finals & expression",
  "The stage is yours",
  "The grand finale",
];
function fullDate(day: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date(`${day}T12:00:00+05:30`));
}

export function ScheduleExplorer({ entries, unavailable, partial, official }: { entries: ScheduleEntry[]; unavailable: boolean; partial: boolean; official: boolean }) {
  const [day, setDay] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const detail = useRef<HTMLDivElement | null>(null);
  const dayCards = useRef<Array<HTMLButtonElement | null>>([]);
  const lastDay = useRef<number | null>(null);
  useEffect(() => {
    if (day) {
      detail.current?.focus({ preventScroll: true });
      detail.current?.scrollIntoView({ block: "start" });
    } else if (lastDay.current !== null) {
      dayCards.current[lastDay.current]?.focus();
    }
  }, [day]);
  const otherEntries = entries.filter(entry => !festivalDays.includes(entry.day));
  const dayEntries = entries.filter(entry => day === "other" ? !festivalDays.includes(entry.day) : entry.day === day);
  const visible = dayEntries.filter(entry => (filter === "all" || entry.category === filter) && `${entry.title} ${entry.venue ?? ""} ${entry.notes}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const dayIndex = festivalDays.indexOf(day ?? "");
  const highlight = dayEntries.filter(entry => entry.category === "evening").map(entry => entry.title);
  function selectDay(value: string) {
    lastDay.current = Math.max(0, festivalDays.indexOf(value));
    setDay(value); setFilter("all"); setQuery("");
  }
  if (day === null) return <>
    <section className={styles.hero} aria-labelledby="schedule-intro-title">
      <div><p className={styles.eyebrow}>SPANDAN 4.0 / 2026</p><h1 id="schedule-intro-title">Eight days.<br /><em>Make them yours.</em></h1><p className={styles.intro}>Pick a day. Find your event.</p></div>
      <div className={styles.dateStamp}><span>DECEMBER</span><strong>01 <i>—</i> 08</strong><small>ASMC Firozabad</small><span>SPORTS / CULTURE / COMMUNITY</span></div>
    </section>
    <section className={styles.explorer} aria-label="Choose a festival day">
      <div className={styles.topline}><h2>Your eight-day festival</h2><span>Choose a day to explore →</span></div>
      <div className={styles.dayGrid}>
      {festivalDays.map((date, index) => {
        const count = entries.filter(entry => entry.day === date).length;
        return <button key={date} ref={node => { dayCards.current[index] = node; }} type="button" className={styles.dayWidget} onClick={() => selectDay(date)} aria-label={`Open Day ${index + 1}, ${fullDate(date)}`}>
          <span className={styles.widgetTop}><span>DAY 0{index + 1}</span><span aria-hidden="true">↗</span></span>
          <span className={styles.widgetDate}><strong>{date.slice(-2)}</strong><span>December<small>{new Intl.DateTimeFormat("en-IN", { weekday: "long", timeZone: "Asia/Kolkata" }).format(new Date(`${date}T12:00:00+05:30`))}</small></span></span>
          <span className={styles.widgetTitle}>{themes[index]}</span>
          <span className={styles.widgetFooter}><span>{unavailable ? "Updates unavailable" : count ? `${count} events to explore` : "Programme coming soon"}</span><span aria-hidden="true">→</span></span>
        </button>;
      })}
      </div>
      {otherEntries.length > 0 && <button type="button" className={styles.other} onClick={() => selectDay("other")}>Other dates & awaiting schedule ({otherEntries.length}) →</button>}
      {unavailable && <p role="alert" className={styles.alert}>The schedule could not be loaded. Please refresh to try again.</p>}
    </section>
  </>;
  return <section className={styles.explorer} aria-label="Festival schedule">
    <div ref={detail} tabIndex={-1} className={styles.detailNav} aria-label={day === "other" ? "Other dates" : `Day ${dayIndex + 1} programme`}><button type="button" onClick={() => setDay(null)}>← All days</button><span>{day === "other" ? "MORE OF THE FESTIVAL" : `DAY 0${dayIndex + 1} / 08`} · ALL TIMES IST</span></div>
    <div className={styles.tools}>
      <div className={styles.filters} role="group" aria-label="Filter programme"><button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All events <span>{dayEntries.length}</span></button>{groups.filter(group => dayEntries.some(entry => entry.category === group.key)).map(group => <button key={group.key} type="button" aria-pressed={filter === group.key} onClick={() => setFilter(group.key)}>{group.label}</button>)}</div>
      <label className={styles.search}><span className={styles.srOnly}>Search selected day by event or venue</span><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an event or venue" /></label>
    </div>
    {unavailable && <p role="alert" className={styles.alert}>The schedule could not be loaded. Please refresh to try again.</p>}
    {partial && !unavailable && <p role="status" className={styles.alert}>Some updates are temporarily unavailable. The available programme is shown below.</p>}
    <section id="day-programme" aria-labelledby="day-title" className={styles.panel}>
      <div className={styles.dayHeading}><div><p className={styles.eyebrow}>{day === "other" ? "MORE OF THE PROGRAMME" : fullDate(day)}</p><h2 id="day-title">{day === "other" ? "Beyond the eight days" : themes[dayIndex]}</h2></div><span className={styles.count} aria-live="polite">{visible.length} {visible.length === 1 ? "event" : "events"}</span></div>
      {official && <p className={styles.timingNote}>The day-wise programme is confirmed. Exact timings and individual venues will be announced.</p>}
      {highlight.length > 0 && filter === "all" && !query && <div className={styles.highlight}><span aria-hidden="true">☾</span><div><small>THE NIGHT BELONGS TO US</small><strong>{highlight.join(" · ")}</strong></div><span className={styles.nightLabel}>After hours</span></div>}
      {groups.map(group => {
        const items = visible.filter(entry => entry.category === group.key).sort(sortSchedule);
        if (!items.length) return null;
        return <section key={group.key} className={`${styles.group} ${styles[group.className]}`} aria-label={group.label}>
          <div className={styles.groupHeading}><span className={styles.groupIcon} aria-hidden="true">{group.icon}</span><div><h3>{group.label} <span>{items.length}</span></h3><p>{group.caption}</p></div></div>
          <ol className={styles.cards}>{items.map(entry => <li key={entry.id} className={styles.card}>
            <div className={styles.cardTop}><span className={styles.time}>{scheduleTime(entry.starts_at)}{entry.ends_at && ` – ${scheduleTime(entry.ends_at)}`}</span>{entry.state === "cancelled" ? <span className={styles.cancelled}>Cancelled</span> : entry.state === "ongoing" ? <span className={styles.live}>Live</span> : /finale|final|bronze/i.test(entry.title) && <span className={styles.stage}>{/bronze/i.test(entry.title) ? "Bronze match" : "Finale"}</span>}</div>
            <h4>{entry.title}</h4>{entry.notes && <p className={styles.notes}>{entry.notes}</p>}
            <div className={styles.venue}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/></svg><span>{entry.venue ?? "Venue to be announced"}</span></div>
            {entry.reporting_at && <p className={styles.reporting}>Report by {scheduleTime(entry.reporting_at)}</p>}
            {day === "other" && <p className={styles.reporting}>{entry.day === "unscheduled" ? "Date to be announced" : fullDate(entry.day)}</p>}
            {entry.href && <Link href={entry.href} className={styles.eventLink}>View event →</Link>}
          </li>)}</ol>
        </section>;
      })}
      {!visible.length && !unavailable && <div className={styles.empty}><span aria-hidden="true">✦</span><h3>{query || filter !== "all" ? "No matching events" : "This day is taking shape"}</h3><p>{query || filter !== "all" ? "Try another search or explore all events for this day." : "The programme will appear here once organisers publish the schedule."}</p>{(query || filter !== "all") && <button type="button" onClick={() => { setQuery(""); setFilter("all"); }}>Clear filters</button>}</div>}
    </section>
    {dayIndex >= 0 && <div className={styles.dayNavigation}><button type="button" disabled={dayIndex === 0} onClick={() => selectDay(festivalDays[dayIndex - 1])}>← Previous day</button><span>DAY {dayIndex + 1} / 08</span><button type="button" disabled={dayIndex === festivalDays.length - 1} onClick={() => selectDay(festivalDays[dayIndex + 1])}>Next day →</button></div>}
  </section>;
}
