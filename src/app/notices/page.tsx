import Link from "next/link";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

export const dynamic = "force-dynamic";

type Notice = { id: string; title: string; body: string; urgency: "normal" | "important" | "urgent"; publish_at: string; events: { title: string } | null };
function date(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)); }

export default async function NoticesPage() {
  let notices: Notice[] = []; let unavailable = !hasPublicSupabaseConfiguration();
  if (!unavailable) { const { data, error } = await createPublicClient().from("notices").select("id,title,body,urgency,publish_at,events(title)").order("publish_at", { ascending: false }); unavailable = Boolean(error); notices = (data ?? []) as unknown as Notice[]; }
  return <main className="public-page">
    <FestTopNav activePage="notices" />
    <section className="public-hero">
      <span className="fest-hero-badge">📢 Official Bulletins</span>
      <h1>Fest Notices &amp; <em>Circulars</em></h1>
      <p>Direct updates, venue shifts, and committee advisories.</p>
    </section><section className="public-content"><div className="public-section-heading"><h2>Latest notices</h2><p>Official circulars and urgent alerts.</p></div>{notices.length ? <ol className="notice-list">{notices.map((notice) => <li className="notice-row" key={notice.id}><div className={`notice-tag ${notice.urgency}`}><span>{notice.urgency}</span><br />{date(notice.publish_at)}{notice.events && <><br />{notice.events.title}</>}</div><div><h2>{notice.title}</h2><p>{notice.body}</p></div></li>)}</ol> : <div className="empty-public"><p className="eyebrow">{unavailable ? "Connection pending" : "Nothing published yet"}</p><h2>The bulletin is clear for now.</h2><p>{unavailable ? "The public notices service is not configured, so no unverified updates are displayed." : "There are no active public notices. Organiser updates will appear here as soon as they are published."}</p></div>}</section><footer className="public-footer"><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/my-fest">Go to My Fest →</Link></footer></main>;
}
