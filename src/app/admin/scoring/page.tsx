import { redirect } from "next/navigation";
import { createRequestClient } from "@/server/supabase/server";
import { fromISTInput, istDate } from "@/lib/match-clock";
import type { ScoringMatch } from "@/lib/match-scoring";
import { MatchScoringClient } from "./scoring-client";

export const dynamic = "force-dynamic";

export default async function MatchScoringPage({ searchParams }: { searchParams: Promise<{event?:string}> }) {
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account?next=/admin/scoring");
  const { data, error } = await client.rpc("list_managed_events");
  if (error) return <p role="alert">Your scoring assignments could not be loaded. Refresh to retry.</p>;
  const assigned = (data ?? []) as Array<{ id: string; title: string; state: string }>;
  const {event:wanted}=await searchParams;
  const {data:policies,error:policyError}=assigned.length ? await client.from("events").select("id,operating_method").in("id",assigned.map(e=>e.id)) : {data:[],error:null};
  if(policyError)return <p role="alert">Scoring assignments could not be verified. Refresh to retry.</p>;
  const events=assigned.filter(e=>policies?.some(p=>p.id===e.id&&p.operating_method==="live_matches")&&(!wanted||e.id===wanted));
  // Request-time display snapshot; starts are checked again authoritatively in Postgres.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const { data: fixtures, error: fixtureError } = events.length ? await client.from("fixtures")
    .select("id,event_id,stage,participant_a_label,participant_b_label,venue,starts_at,state,actual_started_at")
    .in("event_id", events.map(event => event.id)).neq("state", "cancelled")
    .or(`state.eq.ongoing,starts_at.gte.${fromISTInput(`${istDate(now)}T00:00`)}`)
    .order("starts_at", { ascending: true }) : { data: [], error: null };
  if (fixtureError) return <p role="alert">Matches could not be loaded. Refresh to retry.</p>;
  const matches: ScoringMatch[] = (fixtures ?? []).map(fixture => {
    const event = events.find(event => event.id === fixture.event_id)!;
    return { ...fixture, event_title: event.title, event_state: event.state };
  });
  return <MatchScoringClient matches={matches} serverNow={now} />;
}
