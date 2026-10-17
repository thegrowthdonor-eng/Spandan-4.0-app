import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ReviewClient, ApplicationRow } from "./review-client";
import "./review.css";

export const dynamic = "force-dynamic";

type ManagedEvent = {
  id: string;
  title: string;
  category: string;
  format: "solo" | "pair" | "group" | "sport";
  state: string;
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="review-page">
        <section className="review-empty">Organiser review setup is not connected.</section>
      </main>
    );
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const { data: eventData } = await client.rpc("list_managed_events");
  const events = (eventData ?? []) as ManagedEvent[];

  if (!events.length) {
    return (
      <main className="review-page">
        <header className="review-header">
          <Link className="wordmark" href="/">
            Spandan <span>4.0</span>
          </Link>
          <div className="header-nav-links">
            <Link href="/admin">Organiser Hub</Link>
          </div>
        </header>
        <section className="review-empty-state">
          <p className="eyebrow">Roster & Applications</p>
          <h3>No Assigned Events</h3>
          <p>No event-head or organiser assignment is currently active for this account. Once assigned, registration applications will be displayed here for verification.</p>
          <div className="empty-actions">
            <Link href="/admin" className="empty-action-primary">← Return to Organiser Hub</Link>
            <Link href="/admin/events" className="empty-action-secondary">Event Catalogue & Rules →</Link>
          </div>
        </section>
      </main>
    );
  }

  const wanted = (await searchParams).event;
  const selected = events.find((event) => event.id === wanted) ?? events[0];

  const { data: queueData, error } = await client.rpc("list_event_review_queue", { p_event_id: selected.id });
  const queue = (queueData ?? []) as ApplicationRow[];

  return (
    <main className="review-page">
      <header className="review-header">
        <Link className="wordmark" href="/">
          Spandan <span>4.0</span>
        </Link>
        <div className="header-nav-links">
          <Link href="/admin">Organiser Hub</Link>
          <Link href="/my-fest">My Fest</Link>
        </div>
      </header>

      <section className="review-intro">
        <p className="eyebrow">Event-head workspace</p>
        <h1>Application review</h1>
        <p>
          You can review applications only for events assigned to you. Approval and final participant selection
          remain separate decisions. Audited exports and bulk decisions are available below.
        </p>
      </section>

      <nav className="event-picker" aria-label="Managed events">
        {events.map((event) => (
          <Link
            aria-current={event.id === selected.id ? "page" : undefined}
            key={event.id}
            href={`/admin/review?event=${event.id}`}
          >
            {event.title}
          </Link>
        ))}
      </nav>

      {error ? (
        <p className="review-empty">Applications are temporarily unavailable.</p>
      ) : (
        <ReviewClient event={selected} applications={queue} />
      )}
    </main>
  );
}
