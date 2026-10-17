import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { NoticeForm } from "./notice-form";
import "./notices.css";
export const dynamic = "force-dynamic";
type Edition = { edition_id: string; edition_name: string };
export default async function AdminNoticesPage() {
  if (!hasPublicSupabaseConfiguration()) return <main className="admin-notices"><p>Notice publishing is not connected.</p></main>;
  const client = await createRequestClient(); if (!(await client.auth.getUser()).data.user) redirect("/account");
  const [{ data: allowed }, { data }] = await Promise.all([client.rpc("can_publish_notices"), client.rpc("list_notice_editions")]);
  if (allowed !== true) return <main className="admin-notices"><section className="notice-denied"><p className="eyebrow">Organiser workspace</p><h1>Notice publishing is restricted.</h1><p>Only a current Main Admin or Notice Publisher assignment may send a public festival update.</p><Link href="/admin">Return to workspace →</Link></section></main>;
  const editions = ((data ?? []) as Edition[]).map((edition) => ({ id: edition.edition_id, name: edition.edition_name }));
  return <main className="admin-notices"><header><Link className="wordmark" href="/">Spandan <span>4.0</span></Link><Link href="/admin">Organiser workspace</Link></header><section className="notice-hero"><p className="eyebrow">Official bulletin</p><h1>Official notices</h1><p>Publishing is immediate and appears on the public notice board. Keep every update short, factual and actionable.</p></section><section className="notice-content">{editions.length ? <NoticeForm editions={editions} /> : <div className="notice-empty"><h2>No festival edition is available.</h2><p>Create the current festival edition before publishing its notices.</p></div>}</section></main>;
}
