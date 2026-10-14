import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ActivationActions } from "./activation-actions";
import "./activation.css";

export const dynamic = "force-dynamic";
type ActivationRow = { edition_id: string; profile_id: string; access_state: string; requested_at: string; full_name: string; batch_label: string; course_label: string | null; roll_canonical: string; fest_id: string };
export default async function ActivationPage() {
  if (!hasPublicSupabaseConfiguration()) return <main className="activation-page"><section className="admin-denied"><p className="eyebrow">Organiser workspace</p><h1>Activation setup is not connected.</h1><p>No student information is available until the protected service is configured.</p></section></main>;
  const client = await createRequestClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/account");
  const { data: allowed } = await client.rpc("can_manage_access");
  if (allowed !== true) return <main className="activation-page"><section className="admin-denied"><p className="eyebrow">Organiser workspace</p><h1>This area is restricted.</h1><p>Only current treasurer or main-admin assignments can review activation records.</p><Link href="/my-fest">Return to My Fest →</Link></section></main>;
  const { data, error } = await client.rpc("list_activation_queue");
  const queue = (data ?? []) as ActivationRow[];
  const pending = queue.filter((row) => row.access_state === "pending");
  return <main className="activation-page"><header className="activation-header"><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/my-fest">My Fest</Link></header><section className="activation-intro"><p className="eyebrow">Treasury / main admin</p><h1>Verify before<br />you <em>activate.</em></h1><p>Check the authorised college roster and offline contribution record before activation. This action is audited; a ledger reference is mandatory.</p></section>{error ? <p className="admin-empty">The activation queue is temporarily unavailable. No records are shown.</p> : pending.length ? <section className="activation-queue" aria-label="Pending activation queue">{pending.map((row) => <article className="activation-row" key={row.profile_id}><div><p className="activation-state">Pending · {row.fest_id}</p><h2>{row.full_name}</h2><p>{row.batch_label}{row.course_label ? ` · ${row.course_label}` : ""} · Roll {row.roll_canonical}</p></div><div><p>Requested {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(row.requested_at))}</p><p>Verify college identity and offline contribution outside this app.</p></div><ActivationActions editionId={row.edition_id} profileId={row.profile_id} /></article>)}</section> : <p className="admin-empty">No pending registrations are waiting for activation.</p>}</main>;
}
