"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./event-picker.module.css";

type PickableEvent = {
  id: string;
  title: string;
  category?: string;
  format?: string;
  state?: string;
};

export function AdminEventPicker({ events, selectedId, basePath, label = "Managed events" }: { events: PickableEvent[]; selectedId: string; basePath: string; label?: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const categories = useMemo(() => [...new Set(events.map((event) => event.category).filter(Boolean))] as string[], [events]);
  const visible = useMemo(() => {
    const search = query.trim().toLowerCase();
    return events.filter((event) => {
      if (category !== "all" && event.category !== category) return false;
      return !search || `${event.title} ${event.category ?? ""} ${event.format ?? ""} ${event.state ?? ""}`.toLowerCase().includes(search);
    });
  }, [category, events, query]);

  return <section className={styles.picker} aria-label={label}>
    <div className={styles.searchRow}>
      <label><span>Find event</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, format or status" /></label>
      {categories.length > 1 ? <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label> : null}
    </div>
    <label className={styles.eventSelect}><span>Selected event</span><select value={selectedId} onChange={(event) => router.push(`${basePath}?event=${encodeURIComponent(event.target.value)}`)}>{visible.map((event) => <option key={event.id} value={event.id}>{event.title}{event.state ? ` · ${event.state}` : ""}</option>)}</select></label>
    <small>{visible.length} of {events.length} events shown</small>
  </section>;
}
