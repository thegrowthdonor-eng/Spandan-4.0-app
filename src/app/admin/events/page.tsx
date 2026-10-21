import { redirect } from "next/navigation";
import Link from "next/link";
import { createRequestClient } from "@/server/supabase/server";
import { EventEditor } from "./event-editor";
import "../admin.css";
import "./event-editor.css";

export const dynamic = "force-dynamic";

export default async function EventEditorPage() {
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

  return (
    <main className="admin-home">
      <header className="admin-home-header">
        <Link className="wordmark" href="/">Spandan <span>4.0</span></Link>
        <Link href="/admin">Organiser Hub</Link>
        {isAdmin ? <Link href="/admin/control">Control centre</Link> : null}
      </header>
      <section className="editor-hero">
        <p className="eyebrow">{isAdmin ? "Main Admin · Event editor" : "Coordinator · Event Proposals & Management"}</p>
        <h1>{isAdmin ? "Event editor & catalogue" : "My events & proposals"}</h1>
        <p>
          {isAdmin
            ? "Create and manage events, set the festival-wide registration window, and review/approve proposed coordinator drafts."
            : "Propose new events for Spandan 4.0, write event rules, configure venues, questions, and prepare them for admin approval."}
        </p>
      </section>
      <section className="control-content">
        <EventEditor isAdmin={Boolean(isAdmin)} events={(events ?? []) as never[]} editions={(editions ?? []) as never[]} />
      </section>
    </main>
  );
}
