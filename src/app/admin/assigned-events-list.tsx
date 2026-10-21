"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./dashboard.module.css";

type ManagedEvent = { id: string; title: string; category: string; state: string };

export function AssignedEventsList({ events }: { events: ManagedEvent[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => [...new Set(events.map((event) => event.category))], [events]);
  const visible = useMemo(() => events.filter((event) => {
    if (category !== "all" && event.category !== category) return false;
    const search = query.trim().toLowerCase();
    return !search || `${event.title} ${event.state}`.toLowerCase().includes(search);
  }), [category, events, query]);

  return <>
    <div className={styles.eventFilters}><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assigned events" aria-label="Search assigned events" /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category"><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></div>
    <div className={styles.eventGrid}>{visible.map((event) => <Link key={event.id} href={`/admin/review?event=${encodeURIComponent(event.id)}`} className={styles.eventCard}><div className={styles.eventCardTop}><span className={styles.eventCategory}>{event.category.replaceAll("_", " ")}</span><span className={styles.status} data-state={event.state}>{event.state.replaceAll("_", " ")}</span></div><h3 className={styles.eventTitle}>{event.title}</h3><div className={styles.eventActionRow}><span>Review Applications</span><span className={styles.eventActionArrow} aria-hidden>→</span></div></Link>)}</div>
    {!visible.length ? <p className={styles.panelEmpty}>No assigned event matches this filter.</p> : null}
  </>;
}
