"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

export type EventEligibility = {
  division?: "boys" | "girls" | "open" | string;
  sub_category?: "field" | "racket" | "athletics" | "indoor" | "strength" | string;
  match_format?: string;
  squad_details?: string;
};

export type EventCard = {
  id: string;
  title: string;
  slug: string;
  category: string;
  format: string;
  summary: string;
  state: string;
  starts_at: string | null;
  application_opens_at: string | null;
  application_closes_at: string | null;
  application_capacity: number | null;
  poster_url?: string | null;
  eligibility?: EventEligibility | null;
  group_min_size?: number | null;
  group_max_size?: number | null;
};

type EventIconName = "spark" | "person" | "users" | "field" | "racket" | "athletics" | "indoor" | "strength" | "bolt" | "shield" | "search" | "culture" | "literary" | "creative" | "other" | "arrow";

function EventGlyph({ name }: { name: EventIconName }) {
  const paths: Record<EventIconName, string> = {
    spark: "M12 2l1.7 6.3L20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2Z",
    person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
    users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 10a6 6 0 0 1 12 0m2-11a3 3 0 1 0 0-6m-1 11a5 5 0 0 1 5 5",
    field: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 5 3-2 3 2-1 4h-4L9 8Zm1 4-3 3m7-3 3 3m-7 3h4",
    racket: "M15.5 3.5c3 3 2.2 8.6-1.8 12.6-3.2 3.2-7.4 4.1-10.2 1.3-2.8-2.8-1.9-7 1.3-10.2 4-4 9.6-4.8 12.6-1.8M13 14l8 7m-6-5 2-2",
    athletics: "M5 19h14M7 15c4-1 5-4 6-8m-4 3 5 2 3 4M14 5a2 2 0 1 0 0-4",
    indoor: "M7 4h10l-2 4 2 4-3 3v3h4v3H6v-3h4v-3l-3-3 2-4-2-4Z",
    strength: "M3 9v6m3-8v10m3-6h6m0-4v10m3-8v6M6 12h3m6 0h3",
    bolt: "m13 2-8 12h7l-1 8 8-12h-7l1-8Z",
    shield: "M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z",
    search: "m20 20-4.5-4.5M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z",
    culture: "M9 18V5l10-2v13M9 8l10-2M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm10-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
    literary: "M5 4.5A3.5 3.5 0 0 1 8.5 1H20v17H8.5A3.5 3.5 0 0 0 5 21.5m0-17v17M8.5 18H20",
    creative: "m14 4 6 6M4 20l3.5-.7L19 7.8a2.1 2.1 0 0 0-3-3L4.7 16.3 4 20Z",
    other: "M12 2.5 14.2 8l5.8.4-4.5 3.7 1.4 5.7-4.9-3-4.9 3 1.4-5.7L4 8.4 9.8 8 12 2.5Z",
    arrow: "M5 12h13m-5-5 5 5-5 5",
  };
  return <svg className="event-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const EVENT_CATEGORIES = [
  { key: "sport", label: "Sports", eyebrow: "Play with purpose", description: "Matches, races, courts and inter-batch glory.", icon: "field", tone: "sport" },
  { key: "cultural", label: "Cultural", eyebrow: "Take the stage", description: "Dance, music, theatre and every kind of performance.", icon: "culture", tone: "cultural" },
  { key: "literary", label: "Literary", eyebrow: "Ideas in motion", description: "Words, wit, debates and speaking that stays with you.", icon: "literary", tone: "literary" },
  { key: "creative", label: "Arts & Creative", eyebrow: "Make it memorable", description: "Art, design, photography and hands-on expression.", icon: "creative", tone: "creative" },
  { key: "other", label: "More at Spandan", eyebrow: "Discover more", description: "Festival experiences that do not fit in one arena.", icon: "other", tone: "other" },
] as const;
type EventCategoryKey = typeof EVENT_CATEGORIES[number]["key"];

function normaliseCategory(category: string): EventCategoryKey {
  const value = category.toLowerCase().trim();
  if (value === "sport" || value === "sports") return "sport";
  if (value === "cultural" || value === "culture") return "cultural";
  if (value === "literary" || value === "literature") return "literary";
  if (value === "creative" || value === "art" || value === "arts") return "creative";
  return "other";
}

const DIVISIONS = [
  { key: "all", label: "All", icon: "spark" },
  { key: "boys", label: "Boys", icon: "person" },
  { key: "girls", label: "Girls", icon: "person" },
  { key: "open", label: "Open", icon: "users" },
] as const;
type DivisionKey = typeof DIVISIONS[number]["key"];

const DISCIPLINES = [
  { key: "all", label: "All Disciplines", icon: "spark" },
  { key: "field", label: "Field & Ball", icon: "field" },
  { key: "racket", label: "Racket & Net", icon: "racket" },
  { key: "athletics", label: "Athletics", icon: "athletics" },
  { key: "indoor", label: "Indoor & Mind", icon: "indoor" },
  { key: "strength", label: "Strength & Tug", icon: "strength" },
] as const;
type DisciplineKey = typeof DISCIPLINES[number]["key"];

const SECTIONS = [
  {
    key: "field",
    icon: "field",
    title: "Field, Turf & Ball Showdowns",
    tagline: "High-octane inter-batch clashes on the pitch and court.",
  },
  {
    key: "racket",
    icon: "racket",
    title: "Racket & Net Battles",
    tagline: "Fast smashes, swift drop shots and lightning reflexes on court.",
  },
  {
    key: "athletics",
    icon: "athletics",
    title: "Track & Field Athletics",
    tagline: "Speed, explosive power and batch baton chemistry across 100m and 400m.",
  },
  {
    key: "indoor",
    icon: "indoor",
    title: "Mind, Strategy & Indoor Arena",
    tagline: "Rapid tactical calculations, Swiss-system chess and carrom precision.",
  },
  {
    key: "strength",
    icon: "strength",
    title: "Strength & Tug of War",
    tagline: "8-member batch squads digging in across the line for batch supremacy.",
  },
] as const;

const FORMAT_FILTERS = [
  { key: "all", label: "All formats" },
  { key: "solo", label: "Solo / Individual" },
  { key: "pair", label: "Pairs (2v2)" },
  { key: "team", label: "Squads & Teams" },
] as const;
type FormatKey = typeof FORMAT_FILTERS[number]["key"];


function getDivision(event: EventCard): "boys" | "girls" | "open" {
  const d = event.eligibility?.division?.toLowerCase();
  if (d === "boys" || d === "girls" || d === "open") return d;
  const title = event.title.toLowerCase();
  if (title.includes("boys") || title.includes("men")) return "boys";
  if (title.includes("girls") || title.includes("women")) return "girls";
  return "open";
}

function getSubCategory(event: EventCard): string | null {
  return event.eligibility?.sub_category || null;
}

function subCategoryLabel(subKey: string | null): string | null {
  switch (subKey) {
    case "field": return "Field & Ball";
    case "racket": return "Racket & Net";
    case "athletics": return "Athletics";
    case "indoor": return "Indoor & Mind";
    case "strength": return "Strength & Tug";
    default: return null;
  }
}

function categoryLabel(category: string): string {
  return EVENT_CATEGORIES.find((item) => item.key === normaliseCategory(category))?.label ?? "Festival event";
}

function getFormatBadge(event: EventCard): { icon: EventIconName; text: string } {
  if (event.slug === "football-boys-7v7") {
    return { icon: "field", text: "7v7 Matches · 10–11 Squad" };
  }
  if (event.eligibility?.match_format) {
    return { icon: "bolt", text: event.eligibility.match_format };
  }
  if (event.format === "solo") {
    return { icon: "person", text: "Solo" };
  }
  if (event.format === "pair") {
    return { icon: "users", text: "Pair (2v2)" };
  }
  if (event.group_min_size && event.group_max_size) {
    const range = event.group_min_size === event.group_max_size
      ? `${event.group_min_size}`
      : `${event.group_min_size}–${event.group_max_size}`;
    return { icon: "shield", text: `Squad: ${range}` };
  }
  return { icon: "spark", text: event.format.toUpperCase() };
}

function disciplineIcon(value: string | null): EventIconName {
  return value === "field" || value === "racket" || value === "athletics" || value === "indoor" || value === "strength" ? value : "spark";
}

function eventVisualIcon(event: EventCard): EventIconName {
  if (normaliseCategory(event.category) === "sport") return disciplineIcon(getSubCategory(event));
  const category = EVENT_CATEGORIES.find((item) => item.key === normaliseCategory(event.category));
  return category?.icon ?? "other";
}

function stateLabel(state: string, now: Date, event: EventCard): string {
  if (state === "open") {
    if (event.application_closes_at && now >= new Date(event.application_closes_at)) return "Registration closed";
    if (event.application_opens_at && now < new Date(event.application_opens_at)) return "Opening soon";
    return "Applications open";
  }
  if (state === "published") {
    if (event.application_opens_at && now < new Date(event.application_opens_at)) return "Opening soon";
    return "Programme confirmed";
  }
  if (state === "closed") return "Registration closed";
  if (state === "ongoing") return "In progress";
  if (state === "completed") return "Completed";
  if (state === "cancelled") return "Cancelled";
  return "Programme";
}

function stateClass(state: string, now?: Date, event?: EventCard): string {
  if (state === "open" && event?.application_closes_at && now && now >= new Date(event.application_closes_at)) return "state-closed";
  switch (state) {
    case "open": return "state-open";
    case "published": return "state-published";
    case "closed": return "state-closed";
    case "ongoing": return "state-ongoing";
    case "completed": return "state-completed";
    case "cancelled": return "state-cancelled";
    default: return "";
  }
}

function dateLabel(value: string | null): string {
  if (!value) return "Date to be announced";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(value));
}


// Single Event Card Component
function EventCardItem({ event, now }: { event: EventCard; now: Date }) {
  const div = getDivision(event);
  const subLabel = subCategoryLabel(getSubCategory(event));
  const categoryName = categoryLabel(event.category);
  const formatBadge = getFormatBadge(event);
  const stateCls = stateClass(event.state, now, event);
  const visualKey = eventVisualIcon(event);

  return (
    <Link className={`event-card ${stateCls}`} href={`/events/${event.slug}`}>
      <div className="event-card-content">
        {event.poster_url ? (
          <div className="event-card-poster-thumb">
            <span className="event-poster-fallback" aria-hidden="true"><EventGlyph name={visualKey} /><span>{subLabel ?? categoryName}</span></span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={event.poster_url} alt="" loading="lazy" decoding="async" onError={(error) => { error.currentTarget.style.display = "none"; }} />
          </div>
        ) : (
          <div className={`event-card-poster-thumb event-card-poster-placeholder discipline-${visualKey}`} aria-hidden="true">
            <EventGlyph name={visualKey} />
            <span>{subLabel ?? categoryName}</span>
          </div>
        )}

        {/* Top Badges Row */}
        <div className="event-badge-strip">
          <span className={`division-pill division-pill-${div}`}>
            <EventGlyph name={div === "open" ? "users" : "person"} /> {div === "boys" ? "Boys" : div === "girls" ? "Girls" : "Mixed / Open"}
          </span>

          <span className="subcat-pill">{subLabel ?? categoryName}</span>

          <span className="format-spec-pill" title={event.eligibility?.squad_details || formatBadge.text}>
            <EventGlyph name={formatBadge.icon} /> {formatBadge.text}
          </span>
        </div>

        <h3 className="event-card-title">{event.title}</h3>
        <p className="event-summary-text">{event.summary || "Official competition guidelines and rules published."}</p>
      </div>

      <div className="event-meta-bottom">
        <span className={`event-state-label ${stateCls}`}>
          <span className="state-dot" /> {stateLabel(event.state, now, event)}
        </span>
        <span className="event-date">{dateLabel(event.starts_at)}</span>
      </div>
    </Link>
  );
}

export function EventCatalogue({ events }: { events: EventCard[] }) {
  const [selectedCategory, setSelectedCategory] = useState<EventCategoryKey | null>(() => {
    if (typeof window === "undefined") return null;
    const category = new URLSearchParams(window.location.search).get("category");
    return EVENT_CATEGORIES.some((item) => item.key === category) ? category as EventCategoryKey : null;
  });
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState<DivisionKey>("all");
  const [discipline, setDiscipline] = useState<DisciplineKey>("all");
  const [format, setFormat] = useState<FormatKey>("all");
  const [showRefine, setShowRefine] = useState(false);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    function syncCategoryFromHistory() {
      const category = new URLSearchParams(window.location.search).get("category");
      setSelectedCategory(EVENT_CATEGORIES.some((item) => item.key === category) ? category as EventCategoryKey : null);
    }
    window.addEventListener("popstate", syncCategoryFromHistory);
    return () => window.removeEventListener("popstate", syncCategoryFromHistory);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<EventCategoryKey, number> = { sport: 0, cultural: 0, literary: 0, creative: 0, other: 0 };
    events.forEach((event) => { counts[normaliseCategory(event.category)]++; });
    return counts;
  }, [events]);

  // Compute live counts per division
  const divisionCounts = useMemo(() => {
    const counts = { all: events.length, boys: 0, girls: 0, open: 0 };
    for (const e of events) {
      const d = getDivision(e);
      if (d === "boys") counts.boys++;
      else if (d === "girls") counts.girls++;
      else counts.open++;
    }
    return counts;
  }, [events]);

  // Compute live counts per discipline
  const disciplineCounts = useMemo(() => {
    const counts: Record<string, number> = { all: events.length, field: 0, racket: 0, athletics: 0, indoor: 0, strength: 0 };
    for (const e of events) {
      const sub = getSubCategory(e);
      if (sub && counts[sub] !== undefined) counts[sub]++;
    }
    return counts;
  }, [events]);

  // Is any format refinement active?
  const hasRefinements = format !== "all";
  const isSearchOrFilterActive = query.trim() !== "" || discipline !== "all" || hasRefinements;

  // Filtered list
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (selectedCategory && normaliseCategory(e.category) !== selectedCategory) return false;
      // Division
      if (division !== "all") {
        if (getDivision(e) !== division) return false;
      }

      // Discipline
      if (discipline !== "all") {
        if (getSubCategory(e) !== discipline) return false;
      }

      // Format
      if (format !== "all") {
        if (format === "solo" && e.format !== "solo") return false;
        if (format === "pair" && e.format !== "pair") return false;
        if (format === "team" && e.format !== "group" && e.format !== "sport") return false;
      }

      // Query
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const titleMatch = e.title.toLowerCase().includes(q);
        const summaryMatch = (e.summary || "").toLowerCase().includes(q);
        const divMatch = (e.eligibility?.division || "").toLowerCase().includes(q);
        const matchFmt = (e.eligibility?.match_format || "").toLowerCase().includes(q);
        const subMatch = (e.eligibility?.sub_category || "").toLowerCase().includes(q);
        if (!titleMatch && !summaryMatch && !divMatch && !matchFmt && !subMatch) {
          return false;
        }
      }

      return true;
    });
  }, [events, selectedCategory, division, discipline, format, query]);

  function resetAll() {
    setQuery("");
    setDivision("all");
    setDiscipline("all");
    setFormat("all");
    setShowRefine(false);
  }

  function openCategory(category: EventCategoryKey) {
    window.history.pushState({ category }, "", `${window.location.pathname}?category=${category}`);
    setSelectedCategory(category);
    resetAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!selectedCategory) {
    return (
      <section className="category-gateway" aria-label="Festival event categories">
        <div className="category-card-grid">
          {EVENT_CATEGORIES.map((category) => {
            const count = categoryCounts[category.key];
            return (
              <button key={category.key} type="button" className={`category-card category-card-${category.tone}`} onClick={() => openCategory(category.key)}>
                <span className="category-card-icon"><EventGlyph name={category.icon} /></span>
                <span className="category-card-topline"><span>{category.eyebrow}</span><span>{count} {count === 1 ? "event" : "events"}</span></span>
                <strong>{category.label}</strong>
                <span className="category-card-copy">{category.description}</span>
                <span className="category-card-action">Explore {category.label} <EventGlyph name="arrow" /></span>
              </button>
            );
          })}
        </div>
      </section>
    );
  }

  const activeCategory = EVENT_CATEGORIES.find((category) => category.key === selectedCategory)!;
  const isSportsCategory = selectedCategory === "sport";

  return (
    <div className="discovery-portal">
      <section className="category-context-bar" aria-label="Event category navigation">
        <span className={`category-context-icon category-card-${activeCategory.tone}`}><EventGlyph name={activeCategory.icon} /></span>
        <div><p>{activeCategory.eyebrow}</p><h2>{activeCategory.label} events</h2></div>
        <span className="category-context-count">{categoryCounts[selectedCategory]} {categoryCounts[selectedCategory] === 1 ? "event" : "events"}</span>
      </section>
      {/* 1. TOP BRANDED CONTROL BAR */}
      <section className="discovery-header-bar" aria-label="Event search and division control">
        <div className="discovery-bar-content">
          {/* Search bar */}
          <div className="discovery-search-wrapper">
            <span className="search-icon" aria-hidden="true"><EventGlyph name="search" /></span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isSportsCategory ? "Search by event, sport or format (e.g. Cricket, 100m sprint)…" : `Search ${activeCategory.label.toLowerCase()} events or formats…`}
              className="discovery-search-input"
              aria-label="Search events"
            />
            {query && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Division Segmented Control (All / Boys / Girls / Open) */}
          <div className="discovery-division-control" role="tablist" aria-label="Filter by gender division">
            {DIVISIONS.map((d) => {
              const active = division === d.key;
              return (
                <button
                  key={d.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`division-tab ${active ? "active" : ""} tab-${d.key}`}
                  onClick={() => setDivision(d.key)}
                >
                  <span className="tab-icon"><EventGlyph name={d.icon} /></span>
                  <span className="tab-title">{d.label}</span>
                  <span className="tab-count">{divisionCounts[d.key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Horizontal Discipline Scroll Ribbon */}
        {isSportsCategory && <div className="discovery-ribbon-bar">
          <div className="discovery-ribbon" role="tablist" aria-label="Filter by sports discipline">
            {DISCIPLINES.map((disc) => {
              const active = discipline === disc.key;
              const count = disciplineCounts[disc.key];
              return (
                <button
                  key={disc.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`ribbon-chip ${active ? "active" : ""}`}
                  onClick={() => setDiscipline(disc.key)}
                >
                  <span className="chip-icon"><EventGlyph name={disc.icon} /></span>
                  <span>{disc.label}</span>
                  {disc.key !== "all" && <span className="chip-badge">{count}</span>}
                </button>
              );
            })}
          </div>

          {/* Format filter toggle */}
          <button
            type="button"
            className={`refine-toggle-btn ${hasRefinements ? "active" : ""} ${showRefine ? "open" : ""}`}
            onClick={() => setShowRefine(!showRefine)}
            aria-expanded={showRefine}
          >
            <span><EventGlyph name="bolt" /> Format</span>
            {hasRefinements && <span className="refine-indicator-dot" />}
          </button>
        </div>}

        {/* Collapsible Format Drawer */}
        {isSportsCategory && showRefine && (
          <div className="discovery-refine-drawer" role="region" aria-label="Format filter">
            <div className="refine-row">
              <span className="refine-label">Squad Format:</span>
              <div className="refine-pills">
                {FORMAT_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    className={`refine-pill ${format === f.key ? "active" : ""}`}
                    onClick={() => setFormat(f.key)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {hasRefinements && (
                <button
                  type="button"
                  className="refine-reset-link"
                  onClick={() => setFormat("all")}
                >
                  Clear Format
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 2. BODY CONTENT: EITHER CURATED HOME SECTIONS OR FOCUSED FILTER RESULTS */}

      {isSearchOrFilterActive ? (
        /* FOCUSED SEARCH / DISCIPLINE RESULTS MODE */
        <section className="discovery-results-section">
          <div className="results-header-strip">
            <div>
              <p className="results-eyebrow">
                {query ? `Search results for "${query}"` : discipline !== "all" ? subCategoryLabel(discipline) : "Filtered Events"}
              </p>
              <h2 className="results-heading">
                {filtered.length} {filtered.length === 1 ? "Event Found" : "Events Found"}
                {division !== "all" && <span className="division-scope-text"> · {division === "boys" ? "Boys Division" : division === "girls" ? "Girls Division" : "Mixed Division"}</span>}
              </h2>
            </div>

            <button type="button" className="clear-filters-btn" onClick={resetAll}>
              ✕ Reset All Filters
            </button>
          </div>

          {filtered.length > 0 ? (
            <div className="event-grid">
              {filtered.map((event) => (
                <EventCardItem key={event.id} event={event} now={now} />
              ))}
            </div>
          ) : (
            <div className="events-empty">
              <p className="eyebrow">No events found</p>
              <h2>No competitions match your current selection.</h2>
              <p>Try switching division or clearing your search term.</p>
              <button type="button" className="filter-reset" onClick={resetAll}>
                Browse All 22 Events
              </button>
            </div>
          )}
        </section>
      ) : isSportsCategory ? (
        /* CURATED DISCOVERY DISCIPLINE SECTIONS (Each event listed once under its discipline) */
        <div className="discovery-curated-home">
          {SECTIONS.map((sec) => {
            const sectionEvents = events.filter((e) => {
              if (getSubCategory(e) !== sec.key) return false;
              if (division !== "all" && getDivision(e) !== division) return false;
              return true;
            });

            if (sectionEvents.length === 0) return null;

            return (
              <section key={sec.key} className="discovery-category-section">
                <div className="section-title-wrap">
                  <div className="section-header-row">
                    <span className="section-icon"><EventGlyph name={sec.icon} /></span>
                    <div>
                      <h2>{sec.title}</h2>
                      <p>{sec.tagline}</p>
                    </div>
                    <span className="section-count-pill">{sectionEvents.length} events</span>
                  </div>
                </div>

                <div className="event-grid">
                  {sectionEvents.map((event) => (
                    <EventCardItem key={event.id} event={event} now={now} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="discovery-results-section category-event-list">
          <div className="results-header-strip">
            <div><p className="results-eyebrow">{activeCategory.eyebrow}</p><h2 className="results-heading">All {activeCategory.label} events</h2></div>
            <span className="category-list-count">{filtered.length} to explore</span>
          </div>
          <div className="event-grid">
            {filtered.map((event) => <EventCardItem key={event.id} event={event} now={now} />)}
          </div>
        </section>
      )}
    </div>
  );
}
