import type { Metadata } from "next";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached } from "@/server/public-cache";
import { programmeCacheTag } from "@/server/supabase/programme-fetch";
import { createPublicClient } from "@/server/supabase/public";
import { FestTopNav } from "@/components/spandan-branding";
import { EventCatalogue, EventsLandingHero, type EventCard } from "./event-catalogue";
import "./events.css";

export const revalidate = 30;
export const metadata: Metadata = {
  title: "Events | SPANDAN 4.0",
  description: "Browse all Spandan 4.0 events. Find competitions, cultural shows, literary events, and sports. Apply once your account is active.",
};

async function loadPublicEvents(): Promise<EventCard[]> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("events")
    .select("id,title,slug,category,format,registration_enabled,summary,state,starts_at,application_opens_at,application_closes_at,application_capacity,poster_url,eligibility,group_min_size,group_max_size")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("title");

  if (!error) return (data ?? []) as EventCard[];

  // Fallback query if poster_url column not yet applied.
  const fallback = await client
    .from("events")
    .select("id,title,slug,category,format,registration_enabled,summary,state,starts_at,application_opens_at,application_closes_at,application_capacity,eligibility,group_min_size,group_max_size")
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("title");
  if (fallback.error) throw new Error(fallback.error.message);
  return (fallback.data ?? []).map((event) => ({ ...event, poster_url: null })) as EventCard[];
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string | string[] }>;
}) {
  const categoryParam = (await searchParams).category;
  const initialCategory = typeof categoryParam === "string" ? categoryParam : null;
  let events: EventCard[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();

  if (!unavailable) {
    try {
      events = await coalesceCached("public-events-catalogue", [programmeCacheTag], 30, loadPublicEvents);
    } catch {
      unavailable = true;
    }
  }

  return (
    <main className="events-page">
      <FestTopNav activePage="events" showBack backFallbackHref="/home" />
      {unavailable ? (
        <>
          <EventsLandingHero eventCount={events.length} />
          <section className="events-empty">
            <p className="eyebrow">Programme connection pending</p>
            <h2>The line-up will appear here.</h2>
            <p>The public programme service has not been configured. No unverified event information is shown.</p>
          </section>
        </>
      ) : events.length === 0 ? (
        <>
          <EventsLandingHero eventCount={events.length} />
          <section className="events-empty">
            <p className="eyebrow">No published events yet</p>
            <h2>The line-up will appear here.</h2>
            <p>The committee has not published an event yet. Check back once the programme is confirmed.</p>
          </section>
        </>
      ) : (
        <EventCatalogue events={events} initialCategory={initialCategory} />
      )}
    </main>
  );
}
