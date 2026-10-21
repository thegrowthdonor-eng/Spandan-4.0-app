import type { Metadata } from "next";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { FestTopNav } from "@/components/spandan-branding";
import { EventCatalogue, type EventCard } from "./event-catalogue";
import "./events.css";

export const revalidate = 30;
export const metadata: Metadata = {
  title: "Events | SPANDAN 4.0",
  description: "Browse all Spandan 4.0 events. Find competitions, cultural shows, literary events, and sports. Apply once your account is active.",
};

export default async function EventsPage() {
  let events: EventCard[] = [];
  let unavailable = !hasPublicSupabaseConfiguration();

  if (!unavailable) {
    const client = createPublicClient();
    const { data, error } = await client
      .from("events")
      .select("id,title,slug,category,format,summary,state,starts_at,application_opens_at,application_closes_at,application_capacity,poster_url,eligibility,group_min_size,group_max_size")
      .order("starts_at", { ascending: true, nullsFirst: false })
      .order("title");

    if (error) {
      // Fallback query if poster_url column not yet applied
      const fallback = await client
        .from("events")
        .select("id,title,slug,category,format,summary,state,starts_at,application_opens_at,application_closes_at,application_capacity,eligibility,group_min_size,group_max_size")
        .order("starts_at", { ascending: true, nullsFirst: false })
        .order("title");
      unavailable = Boolean(fallback.error);
      events = (fallback.data ?? []).map((e) => ({ ...e, poster_url: null })) as EventCard[];
    } else {
      events = (data ?? []) as EventCard[];
    }
  }

  return (
    <main className="events-page">
      <FestTopNav activePage="events" showBack backFallbackHref="/home" />
      <section className="events-hero">
        <div className="events-hero-content">
          <div className="hero-eyebrow-row">
            <span className="college-affil-pill">🏛️ SPANDAN 4.0 · ASMC FIROZABAD</span>
            <span className="hero-status-pill">● REGISTRATIONS LIVE</span>
          </div>
          <h1>
            Find your <span className="gold-accent">festival arena</span>
          </h1>
          <p>From the field to the stage, discover every official Spandan event in one place.</p>
          <div className="hero-stats-row">
            <span className="hero-stat-badge">✦ <b>{events.length}</b> Official Events</span>
            <span className="hero-stat-badge">◎ Sports · Culture · Arts</span>
            <span className="hero-stat-badge">⌁ Easy category navigation</span>
          </div>
        </div>
      </section>
      {unavailable ? (
        <section className="events-empty">
          <p className="eyebrow">Programme connection pending</p>
          <h2>The line-up will appear here.</h2>
          <p>The public programme service has not been configured. No unverified event information is shown.</p>
        </section>
      ) : events.length === 0 ? (
        <section className="events-empty">
          <p className="eyebrow">No published events yet</p>
          <h2>The line-up will appear here.</h2>
          <p>The committee has not published an event yet. Check back once the programme is confirmed.</p>
        </section>
      ) : (
        <EventCatalogue events={events} />
      )}
    </main>
  );
}
