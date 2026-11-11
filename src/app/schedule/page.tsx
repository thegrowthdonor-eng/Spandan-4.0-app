import Link from "next/link";
import { Suspense } from "react";
import { SpandanLogo } from "@/components/spandan-branding";
import { FestivalNotificationBell } from "@/components/festival-notification-bell";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { scheduleDay, type ScheduleEntry } from "@/lib/schedule";
import { ScheduleExplorer } from "./schedule-explorer";
import home from "../homepage.module.css";

export const revalidate = 30;
export const metadata = { title: "Schedule | SPANDAN 4.0", description: "Explore Spandan 4.0 day by day, 1–8 December 2026. Sports qualifiers, cultural programmes and festival nights at ASMC Firozabad." };

export default async function SchedulePage() {
  let entries: ScheduleEntry[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();
  let partial = false;
  let official = false;
  if (!unavailable) {
    const db = createPublicClient();
    const [programme, fixtures, events,sessions] = await Promise.all([
      db.from("schedule_entries").select("id,edition_id,day,title,category,venue,starts_at,ends_at,notes,sort_order,programme_live_states(status)").eq("published", true).gte("day", "2026-12-01").lte("day", "2026-12-08").order("sort_order"),
      db.from("fixtures").select("id,stage,participant_a_label,participant_b_label,venue,reporting_at,starts_at,state,events!inner(title,slug,edition_id,operating_method)").in("events.operating_method",["live_matches","fixtures_only"]).order("starts_at"),
      db.from("events").select("id,title,slug,category,venue,reporting_at,starts_at,ends_at,state").neq("state", "draft").order("starts_at"),
      db.rpc("public_competition_schedule"),
    ]);
    official = Boolean(programme.data?.length);
    unavailable = Boolean(programme.error && fixtures.error && events.error && !sessions.data?.length);
    const programmeFailure = programme.error && !["42P01", "PGRST205"].includes(programme.error.code);
    partial = Boolean(programmeFailure || fixtures.error || events.error || sessions.error);
    const fixtureRows = (fixtures.data ?? []) as unknown as Array<{ id: string; stage: string; participant_a_label: string; participant_b_label: string; venue: string | null; reporting_at: string | null; starts_at: string | null; state: string; events: { title: string; slug: string; edition_id: string } | null }>;
    const officialEditions = new Set(programme.data?.map(row => row.edition_id));
    const sessionRows=(sessions.data ?? []) as Array<{id:string;event_id:string;event_title:string;edition_id:string;title:string;venue:string;starts_at:string;reporting_at:string|null;ends_at:string|null;state:string;schedule_entry_id:string|null}>;
    const linked=new Set(sessionRows.map(row=>row.schedule_entry_id).filter(Boolean));
    entries = (programme.data ?? []).filter(row=>!linked.has(row.id)).map(row => ({ ...row,state:(Array.isArray(row.programme_live_states)?row.programme_live_states[0]:row.programme_live_states)?.status??"scheduled" }));
    entries.push(...sessionRows.filter(row=>!official || officialEditions.has(row.edition_id)).map((row,index)=>({id:row.id,day:scheduleDay(row.starts_at),title:row.title,category:"competition",venue:row.venue,starts_at:row.starts_at,reporting_at:row.reporting_at,ends_at:row.ends_at,state:row.state,notes:row.event_title,sort_order:index,href:`/competition/${row.event_id}`})));
    entries.push(...fixtureRows.filter(row => !official || (row.events && officialEditions.has(row.events.edition_id))).map((row, index) => ({
      id: row.id, day: scheduleDay(row.starts_at), title: `${row.participant_a_label} vs ${row.participant_b_label}`,
      category: "fixture", venue: row.venue, starts_at: row.starts_at, reporting_at: row.reporting_at,
      notes: [row.events?.title, row.stage].filter(Boolean).join(" · "), sort_order: index, state: row.state,
      href: row.events?.slug ? `/events/${row.events.slug}` : undefined,
    })));
    {
      const fixtureSlugs = new Set(fixtureRows.map(row => row.events?.slug));
      entries.push(...(events.data ?? []).filter(row => !fixtureSlugs.has(row.slug) && !sessionRows.some(session=>session.event_id === row.id)).map((row, index) => ({
        ...row, day: scheduleDay(row.starts_at), category: row.category,
        notes: "", sort_order: index, href: `/events/${row.slug}`,
      })));
    }
  }
  return <main className={home.page}>
    <header className={home.header}>
      <SpandanLogo variant="light" />
      <div className={home.headerRight}><nav aria-label="Festival navigation"><Link prefetch={false} href="/home">Home</Link><Link prefetch={false} href="/events">Events</Link><Link prefetch={false} href="/schedule" aria-current="page">Schedule</Link><Link prefetch={false} href="/my-fest" className={home.headerCta}>My Fest →</Link></nav><FestivalNotificationBell /></div>
    </header>
    <div className={home.content}>
      <Suspense fallback={<p>Loading the festival programme…</p>}><ScheduleExplorer entries={entries} unavailable={unavailable} partial={partial} serverNow={new Date().toISOString()} /></Suspense>
      <footer className={home.footer}><span>ASMC Firozabad · SPANDAN 4.0</span><div className={home.footerActions}><Link prefetch={false} href="/notices">Latest notices ↗</Link><Link prefetch={false} href="/my-fest">My Fest →</Link></div></footer>
    </div>
  </main>;
}
