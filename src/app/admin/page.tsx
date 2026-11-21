import Link from "next/link";
import { getManagementSummary } from "@/server/management";
import { managementLinks } from "@/lib/management";
import { ManagementEvents } from "@/components/admin/management-events";
import { createRequestClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const summary = await getManagementSummary();
  if (!summary) return <p className="portal-unavailable">Workspace temporarily unavailable. Refresh to try again.</p>;
  const pendingEvents = summary.events.filter(event => (event.pending ?? 0) > 0);
  const pending = pendingEvents.reduce((total, event) => total + (event.pending ?? 0), 0);
  const drafts = summary.editableEvents.filter(e => e.state === "draft");
  const tools = managementLinks(summary).filter(link => link.href !== "/admin");
  const seniorCount = summary.isAdmin || summary.events.length > 0
    ? await (await createRequestClient()).from("senior_event_registrations").select("id", { count: "exact", head: true }).gte("created_at", new Date(new Date().getTime() - 86400000).toISOString())
    : null;
  return <main className="portal-dashboard">
    <section className="portal-heading"><div><p className="portal-eyebrow">Your organiser workspace</p><h1>Ready for the next task.</h1><p>Choose an action or open an event below.</p></div>
      {summary.canCreate && <Link className="portal-primary" href="/admin/events?create=1">+ Create event</Link>}
    </section>
    <section className="portal-stats" aria-label="Work awaiting attention">
      {(summary.isAdmin || summary.events.length > 0) && <Link href="/admin/senior-entries"><strong>{seniorCount?.error ? "—" : seniorCount?.count ?? 0}</strong><span>New PG / JR / FMG / Faculty entries (24h) →</span></Link>}
      {summary.canVerify && <Link href="/admin/activation"><strong>{summary.pendingVerification ?? 0}</strong><span>Students awaiting verification →</span></Link>}
      {summary.events.length > 0 && <article className="portal-request-stat" aria-label="Participant requests">
        <strong>{pending}</strong><span>Participant requests</span>
        {pendingEvents.length > 0 ? <ul>
          {pendingEvents.map(event => <li key={event.id}>
            <Link href={`/admin/review?event=${event.id}`}>{event.title} · {event.pending} pending</Link>
          </li>)}
        </ul> : <>
          <span>No pending participant requests</span>
          <Link href="/admin/review">Open application review</Link>
        </>}
      </article>}
      {summary.canCreate && <Link href="/admin/events?state=draft"><strong>{drafts.length}</strong><span>Event drafts →</span></Link>}
    </section>
    <section className="portal-section"><h2>Quick actions</h2><div className="portal-tools">{tools.map(tool =>
      <Link key={tool.href} href={tool.href}><strong>{tool.label}</strong><span>Open workspace →</span></Link>
    )}</div></section>
    {summary.events.length > 0 && <section className="portal-section"><h2>My managed events</h2><p>Open an assigned event to manage its participants and competition.</p><ManagementEvents events={summary.events} editableIds={summary.editableEvents.map(e=>e.id)}/></section>}
    {summary.canCreate && !summary.isAdmin && <section className="portal-section"><h2>My editable events</h2><ManagementEvents events={summary.editableEvents} editing/></section>}
  </main>;
}
