import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ReviewClient, ApplicationRow } from "./review-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
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
  if (wanted && !events.some(event => event.id === wanted)) return <main className="portal-unavailable"><h1>Event unavailable</h1><p>This event is outside your responsibility or has been removed.</p><Link href="/admin">Back to my workspace</Link></main>;
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
        <p className="eyebrow">Participant management</p>
        <h1>Application review</h1>
        <p>
          You can review applications only for events assigned to you. Solo approval adds the student to the final roster. Pairs need mutual invitations; group/team leaders propose members for your final approval.
        </p>
      </section>

      <AdminEventPicker events={events} selectedId={selected.id} basePath="/admin/review" />

      {error ? (
        <p className="review-empty">Applications are temporarily unavailable.</p>
      ) : (
        <ReviewClient key={selected.id} event={selected} applications={queue} />
      )}
    </main>
  );
}
