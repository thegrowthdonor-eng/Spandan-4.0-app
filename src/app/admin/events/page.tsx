import { redirect } from "next/navigation";
import Link from "next/link";
import { createRequestClient } from "@/server/supabase/server";
import { EventEditor, type EventData, type EditionData } from "./event-editor";
import "../admin.css";


export const dynamic = "force-dynamic";

export default async function EventEditorPage({ searchParams }: { searchParams: Promise<{event?:string; create?:string; state?:string}> }) {
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");
  const [{ data: isAdmin }, { data: canCreateEvents }, { data: events }, { data: editions }] = await Promise.all([
    client.rpc("is_main_admin"),
    client.rpc("can_create_events"),
    client.rpc("list_admin_event_editor_data"),
    client.rpc("list_admin_editions"),
  ]);
  const hasAccess = isAdmin === true || canCreateEvents === true;
  if (!hasAccess) redirect("/admin");
  const wanted = await searchParams;
  if (wanted.event && !(events ?? []).some((event: EventData) => event.event_id === wanted.event)) {
    return <main className="portal-unavailable"><h1>Event unavailable</h1><p>This event may have been removed or is outside your responsibility.</p><Link href="/admin/events">All editable events</Link></main>;
  }

  return (
    <main>
      <header className="admin-home-header">
        <Link className="wordmark" href="/">Spandan <span>4.0</span></Link>
        <Link href="/admin">Organiser Hub</Link>
        {isAdmin ? <Link href="/admin/control">Control centre</Link> : null}
      </header>

      <section>
        <EventEditor key={wanted.event ?? wanted.create ?? "list"} isAdmin={Boolean(isAdmin)} events={(events ?? []) as EventData[]} editions={(editions ?? []) as EditionData[]} selectedId={wanted.event} creating={wanted.create === "1"} initialFilter={wanted.state} />
      </section>
    </main>
  );
}
