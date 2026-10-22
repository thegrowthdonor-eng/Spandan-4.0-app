import Link from "next/link";
import { createPublicClient } from "@/server/supabase/public";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { FestTopNav } from "@/components/spandan-branding";
import { LiveRefresh } from "./refresh";
import "../public-info.css";

export const dynamic = "force-dynamic";

type Match = {
  id: string; participant_a_label: string; participant_b_label: string;
  venue: string | null; score_status: string; score_updated_at: string | null;
  score_payload: Record<string, unknown> | null;
  events: { title: string; slug: string; score_template: string } | null;
};

function score(match: Match): string {
  const p = match.score_payload;
  if (!p) return "Score update pending";
  if (match.events?.score_template === "football" && (typeof p.teamA_goals === "string" || typeof p.teamA_goals === "number") && (typeof p.teamB_goals === "string" || typeof p.teamB_goals === "number")) return `${p.teamA_goals} – ${p.teamB_goals}`;
  if (match.events?.score_template === "cricket" && typeof p.teamA_runs === "string" && typeof p.teamA_wickets === "string" && typeof p.teamA_overs === "string" && typeof p.teamB_runs === "string" && typeof p.teamB_wickets === "string" && typeof p.teamB_overs === "string") return `${p.teamA_runs}/${p.teamA_wickets} (${p.teamA_overs} ov) · ${p.teamB_runs}/${p.teamB_wickets} (${p.teamB_overs} ov)`;
  if (match.events?.score_template === "badminton" && typeof p.set1 === "string") return [p.set1, p.set2, p.set3].filter((set): set is string => typeof set === "string" && Boolean(set)).join(" · ");
  if (match.events?.score_template === "football" && typeof p.teamAGoals === "number" && typeof p.teamBGoals === "number") return `${p.teamAGoals} – ${p.teamBGoals}`;
  if (match.events?.score_template === "cricket") {
    const a = p.teamA as Record<string, unknown> | undefined;
    const b = p.teamB as Record<string, unknown> | undefined;
    if (a && b && typeof a.runs === "number" && typeof b.runs === "number") return `${a.runs}/${a.wickets} (${a.completedOvers}.${a.legalBalls} ov) · ${b.runs}/${b.wickets} (${b.completedOvers}.${b.legalBalls} ov)`;
  }
  if (match.events?.score_template === "badminton" && Array.isArray(p.games)) {
    return p.games.map((game: { teamA?: number; teamB?: number }) => `${game.teamA ?? "–"}–${game.teamB ?? "–"}`).join(" · ");
  }
  return typeof p.summary === "string" ? p.summary : "Score update pending";
}

export default async function LivePage() {
  let matches: Match[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();
  if (!unavailable) {
    const result = await createPublicClient().from("fixtures")
      .select("id,participant_a_label,participant_b_label,venue,events(title,slug,score_template),score_snapshots(version,status,updated_at,score_payload)")
      .neq("state", "cancelled").order("starts_at", { ascending: true });
    unavailable = Boolean(result.error);
    type Row = Omit<Match, "score_status" | "score_updated_at" | "score_payload"> & {
      score_snapshots: { version: number; status: string; updated_at: string; score_payload: Record<string, unknown> }[];
    };
    matches = ((result.data ?? []) as unknown as Row[]).flatMap(row => {
      const latest = row.score_snapshots.reduce<Row["score_snapshots"][number] | null>((current, item) => !current || item.version > current.version ? item : current, null);
      if (!latest || !["live", "paused"].includes(latest.status)) return [];
      return [{ ...row, score_status: latest.status, score_updated_at: latest.updated_at, score_payload: latest.score_payload }];
    });
  }
  return <main className="public-page">
    <FestTopNav />
    <section className="public-hero"><h1>Live matches</h1><p>Score updates from event organisers. Paused matches are labelled below.</p><LiveRefresh /></section>
    <section className="public-content">
      {unavailable ? <div className="empty-public"><h2>Matches couldn’t be loaded.</h2><p>Please refresh to try again.</p><Link href="/live">Try again →</Link></div>
      : matches.length ? <ol className="notice-list">{matches.map(match => <li className="notice-row" key={match.id}>
        <div className="notice-tag"><span>{match.score_status === "paused" ? "Paused" : "Live"}</span><p>{match.venue ?? "Venue to be confirmed"}</p></div>
        <div><h2>{match.participant_a_label} vs {match.participant_b_label}</h2><p>{score(match)}</p>
          {match.score_updated_at ? <p>Score updated <time dateTime={match.score_updated_at}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(match.score_updated_at))} IST</time></p> : <p>Awaiting the first score update.</p>}
          {match.events?.slug && <Link href={`/events/${match.events.slug}`}>{match.events.title} →</Link>}
        </div>
      </li>)}</ol> : <div className="empty-public"><h2>No matches live right now.</h2><p>Matches appear here when an organiser starts live scoring.</p><Link href="/schedule">See upcoming fixtures →</Link></div>}
    </section>
  </main>;
}
