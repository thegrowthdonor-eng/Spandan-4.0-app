import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { getManagementSummary } from "@/server/management";
import { createRequestClient } from "@/server/supabase/server";
import { ReviewClient, ApplicationRow } from "./review-client";
import { AdminEventPicker } from "@/components/admin/event-picker";
import { RequestEvents } from "./request-events";
import "./review.css";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ event?: string; status?: string }> }) {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="review-page">
        <section className="review-empty">Organiser review setup is not connected.</section>
      </main>
    );
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const summary = await getManagementSummary();
  if (!summary) return <main className="review-page"><p className="review-empty">Applications are temporarily unavailable.</p></main>;

  const { events } = summary;
  const { event: wanted, status } = await searchParams;
  const requestedEvent = events.find(event => event.id === wanted);
  if (wanted && !requestedEvent) return <main className="portal-unavailable"><h1>Event unavailable</h1><p>This event is outside your responsibility or has been removed.</p><Link href="/admin">Back to my workspace</Link></main>;

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

  const queue = requestedEvent
    ? await client.rpc("list_event_review_queue", { p_event_id: requestedEvent.id })
    : null;

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
        <h1>{requestedEvent ? `Application review · ${requestedEvent.title}` : "Participant requests"}</h1>
        {requestedEvent && <>
          <p>Solo approval adds the student to the final roster. Pairs need mutual invitations. Group and team leaders propose members for your final approval.</p>
          <div className="portal-event-actions"><Link href="/admin/review">← Back to participant requests</Link></div>
        </>}
      </section>

      {requestedEvent ? <>
        <AdminEventPicker events={events} selectedId={requestedEvent.id} basePath="/admin/review" />
        {queue?.error ? <p className="review-empty">Applications are temporarily unavailable.</p> : (
          <ReviewClient key={`${requestedEvent.id}:${status === "approved"}`} event={requestedEvent} applications={(queue?.data ?? []) as ApplicationRow[]} showApproved={status === "approved"} />
        )}
      </> : <RequestEvents events={events} />}
    </main>
  );
}
