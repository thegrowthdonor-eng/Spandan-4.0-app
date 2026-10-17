import { FeedClient, type FeedPost } from "@/app/schedule/feed-client";
import styles from "@/app/schedule/feed.module.css";
import { FestTopNav } from "@/components/spandan-branding";
import { createPublicClient } from "@/server/supabase/public";
import { hasPublicSupabaseConfiguration } from "@/server/env";

export const dynamic = "force-dynamic";

type Fixture = { id: string; participant_a_label: string; participant_b_label: string; venue: string | null; starts_at: string | null; state: string; events: { title: string; slug: string; score_template: string } | null; score_snapshots: { version: number; status: string; updated_at: string; score_payload: Record<string, unknown> }[] };
type Result = { id: string; published_at: string | null; events: { title: string; slug: string } | null; result_positions: { placing: number; batches: { name: string } | null }[] };
type Media = { id: string; title: string; thumbnail_url: string | null; asset_url: string; alt_text: string; caption: string | null };

function formatTime(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(value)) : "Time to be announced"; }
function score(fixture: Fixture, payload: Record<string, unknown> | null) {
  if (!payload) return "Score update coming soon";
  if (fixture.events?.score_template === "football" && typeof payload.teamAGoals === "number" && typeof payload.teamBGoals === "number") return `${fixture.participant_a_label} ${payload.teamAGoals} – ${payload.teamBGoals} ${fixture.participant_b_label}`;
  if (fixture.events?.score_template === "cricket") { const a = payload.teamA as Record<string, unknown> | undefined; const b = payload.teamB as Record<string, unknown> | undefined; if (a && b && typeof a.runs === "number" && typeof b.runs === "number") return `${fixture.participant_a_label} ${a.runs}/${a.wickets} · ${fixture.participant_b_label} ${b.runs}/${b.wickets}`; }
  return typeof payload.summary === "string" ? payload.summary : "Score update coming soon";
}

export default async function FeedPage() {
  let fixtures: Fixture[] = []; let results: Result[] = []; let media: Media[] = [];
  if (hasPublicSupabaseConfiguration()) {
    try {
      const client = createPublicClient();
      const [fixtureRes, resultRes, mediaRes] = await Promise.all([
        client.from("fixtures").select("id,participant_a_label,participant_b_label,venue,starts_at,state,events(title,slug,score_template),score_snapshots(version,status,updated_at,score_payload)").neq("state", "cancelled").order("starts_at", { ascending: true }).limit(12),
        client.from("result_publications").select("id,published_at,events(title,slug),result_positions(placing,batches(name))").eq("state", "published").order("published_at", { ascending: false }).limit(6),
        client.from("media_items").select("id,title,thumbnail_url,asset_url,alt_text,caption").limit(6),
      ]);
      fixtures = (fixtureRes.data ?? []) as unknown as Fixture[]; results = (resultRes.data ?? []) as unknown as Result[]; media = (mediaRes.data ?? []) as Media[];
    } catch { /* Feed stays empty until official data is available. */ }
  }
  const posts: FeedPost[] = [
    ...fixtures.flatMap((fixture) => { const latest = fixture.score_snapshots.reduce<Fixture["score_snapshots"][number] | null>((current, item) => !current || item.version > current.version ? item : current, null); if (!latest || !["live", "paused"].includes(latest.status)) return []; return [{ id: `live-${fixture.id}`, kind: "live" as const, title: `${fixture.participant_a_label} vs ${fixture.participant_b_label}`, body: `${fixture.events?.title ?? "Festival match"} · ${fixture.venue ?? "Venue TBA"}. ${latest.status === "paused" ? "Match is currently paused." : "Follow the score as it happens."}`, meta: `Updated ${formatTime(latest.updated_at)} IST`, score: score(fixture, latest.score_payload), href: fixture.events?.slug ? `/events/${fixture.events.slug}` : "/live", initials: "SP" }]; }),
    ...results.map((result) => ({ id: `result-${result.id}`, kind: "result" as const, title: `${result.events?.title ?? "Festival event"} results are in`, body: result.result_positions.length ? result.result_positions.sort((a, b) => a.placing - b.placing).slice(0, 3).map((position) => `${position.placing === 1 ? "🥇" : position.placing === 2 ? "🥈" : "🥉"} ${position.batches?.name ?? "Winner"}`).join("  ·  ") : "Official result published by the organising team.", meta: result.published_at ? `Published ${formatTime(result.published_at)} IST` : "Official result", href: result.events?.slug ? `/events/${result.events.slug}` : "/standings", initials: "SP" })),
    ...media.map((item) => ({ id: `moment-${item.id}`, kind: "moment" as const, title: item.title, body: item.caption ?? "An official festival moment from the Spandan media squad.", meta: "Official media squad", imageUrl: item.thumbnail_url ?? item.asset_url, imageAlt: item.alt_text, href: "/gallery", initials: "SM" })),
    ...fixtures.filter((fixture) => ["scheduled", "draft"].includes(fixture.state)).slice(0, 3).map((fixture) => ({ id: `upcoming-${fixture.id}`, kind: "upcoming" as const, title: `${fixture.participant_a_label} vs ${fixture.participant_b_label}`, body: `${fixture.events?.title ?? "Festival fixture"} · ${fixture.venue ?? "Venue to be announced"}`, meta: `Starts ${formatTime(fixture.starts_at)} IST`, href: fixture.events?.slug ? `/events/${fixture.events.slug}` : "/live", initials: "SP" })),
  ];
  return <main className={styles.page}><FestTopNav /><div className={styles.shell}>
    <section className={styles.intro} aria-labelledby="feed-title">
      <div><p className={styles.eyebrow}>SPANDAN 4.0 / ASMC FIROZABAD</p><h1 id="feed-title">Your campus. <span>Your feed.</span></h1><p>The moments, the matches, the memories.</p></div>
      <span className={styles.introMark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M3 16l5-5 5 5 2-2 4 4M18 2l1.2 3.8L23 7l-3.8 1.2L18 12l-1.2-3.8L13 7l3.8-1.2L18 2Z" /></svg></span>
    </section><FeedClient posts={posts} /></div></main>;
}
