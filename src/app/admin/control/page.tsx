import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { CommitteeControl } from "./committee-control";
import { SeniorInvites } from "./senior-invites";
import "../admin.css";

export const dynamic = "force-dynamic";

type Candidate = { profile_id: string; full_name: string; fest_id: string; batch_label: string };
type CommitteeMember = { assignment_id: string; profile_id: string; full_name: string; fest_id: string; batch_label: string; role: "main_admin" | "treasurer" | "event_head" | "notice_publisher"; event_id: string | null; event_title: string | null; granted_at: string };
type EventRow = { event_id: string; title: string; category: string; state: string };
type Edition = { edition_id: string; name: string; starts_on: string | null; ends_on: string | null; status: string };

export default async function AdminControlPage() {
  if (!hasPublicSupabaseConfiguration()) return <main className="admin-empty"><p>Control centre is not connected.</p></main>;
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");
  const [{ data: isAdmin }, candidatesResult, membersResult, eventsResult, editionsResult] = await Promise.all([
    client.rpc("is_main_admin"), client.rpc("list_committee_candidates"), client.rpc("list_committee_members"), client.rpc("list_all_events_for_admin"), client.rpc("list_admin_editions"),
  ]);
  if (isAdmin !== true) redirect("/admin");
  return <main className="admin-home control-page">
    <header className="admin-home-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin">Organiser workspace</Link></header>
    <section className="control-hero"><p className="eyebrow">Main Admin · Control centre</p><h1>Control centre</h1><p>Assign only the responsibility a committee member needs. There is no role selector on sign-in; access is decided here and enforced by the database.</p></section>
    <section className="control-content"><SeniorInvites editions={(editionsResult.data ?? []) as Edition[]} /><CommitteeControl candidates={(candidatesResult.data ?? []) as Candidate[]} members={(membersResult.data ?? []) as CommitteeMember[]} events={(eventsResult.data ?? []) as EventRow[]} /></section>
  </main>;
}
