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
  const [{ data: isAdmin }, { data: events }, { data: editions }] = await Promise.all([
    client.rpc("is_main_admin"),
    client.rpc("list_admin_event_editor_data"),
    client.rpc("list_admin_editions"),
  ]);
  if (isAdmin !== true) redirect("/admin");

  return (
    <main className="admin-home">
      <header className="admin-home-header">
        <Link className="wordmark" href="/">Spandan <span>4.0</span></Link>
        <Link href="/admin/control">Control centre</Link>
      </header>
      <section className="editor-hero">
        <p className="eyebrow">Main Admin · Event editor</p>
        <h1>Event editor</h1>
        <p>Create and manage events, set the one festival-wide registration window, and frame only the questions each event genuinely needs.</p>
      </section>
      <section className="control-content">
        <EventEditor events={(events ?? []) as never[]} editions={(editions ?? []) as never[]} />
      </section>
    </main>
  );
}
