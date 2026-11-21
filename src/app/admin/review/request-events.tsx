"use client";

import Link from "next/link";
import { useState } from "react";
import { filterPickableEvents, pickableCategories } from "@/lib/admin-event-picker";
import { eventCategoryLabel } from "@/lib/event-categories";
import type { WorkspaceEvent } from "@/lib/management";

export function RequestEvents({ events }: { events: WorkspaceEvent[] }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [pendingOnly, setPendingOnly] = useState(true);
  const pendingEvents = events.filter(event => (event.pending ?? 0) > 0);
  const visible = filterPickableEvents(pendingOnly ? pendingEvents : events, query, category)
    .sort((a, b) => (b.pending ?? 0) - (a.pending ?? 0) || a.title.localeCompare(b.title));

  return <>
    <div className="review-controls-card request-event-filters">
      <label>Search events<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>Category<select value={category} onChange={event => setCategory(event.target.value)}>
        <option value="all">All categories</option>
        {pickableCategories(events).map(item => <option key={item} value={item}>{eventCategoryLabel(item)}</option>)}
      </select></label>
      <label>Requests<select value={pendingOnly ? "pending" : "all"} onChange={event => setPendingOnly(event.target.value === "pending")}>
        <option value="pending">Pending only</option>
        <option value="all">All events</option>
      </select></label>
    </div>
    {visible.length > 0 ? <ul className="request-event-list" aria-label="Events and pending request counts">
      {visible.map(event => <li key={event.id}>
        <Link href={`/admin/review?event=${event.id}`}><strong>{event.title}</strong><span>{event.pending ?? 0} pending</span></Link>
      </li>)}
    </ul> : <p className="review-empty" role="status">
      {pendingOnly && !pendingEvents.length ? "No pending participant requests. Choose All events to review past applications." : "No events match your filters."}
    </p>}
  </>;
}
