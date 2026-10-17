import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { HappeningNowRadar } from "@/components/happening-now-radar";
import { SpandanLogo } from "@/components/spandan-branding";
import { ShareFeedbackButton } from "@/components/share-feedback-modal";
import { hasPublicSupabaseConfiguration, hasSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { createAdminClient } from "@/server/supabase/admin";
import { createRequestClient } from "@/server/supabase/server";
import styles from "../homepage.module.css";
import { getPublishedSponsors } from "@/server/sponsors";
import { groupSponsors, sponsorTier } from "@/lib/sponsors";
import { SponsorStrip } from "@/components/sponsor-strip";

export const metadata = {
  title: "SPANDAN 4.0 | ASMC Firozabad Official Festival Space",
  description: "Official festival portal for ASMC Firozabad. Out of the ordinary. Into the fest.",
};

export const dynamic = "force-dynamic";

type StandingSnapshot = { batch_id: string; label: string; course_label: string | null; points: number };
type NoticeSnapshot = { id: string; title: string; urgency: "normal" | "important" | "urgent"; publish_at: string };

async function getTopBatches(): Promise<StandingSnapshot[]> {
  if (!hasPublicSupabaseConfiguration()) return [];
  try {
    const { data } = await createPublicClient()
      .from("published_batch_standing_board")
      .select("batch_id,label,course_label,points")
      .order("points", { ascending: false })
      .limit(3);
    return (data ?? []) as StandingSnapshot[];
  } catch {
    return [];
  }
}

async function getLatestNotice(): Promise<NoticeSnapshot | null> {
  if (!hasPublicSupabaseConfiguration()) return null;
  try {
    const { data } = await createPublicClient()
      .from("notices")
      .select("id,title,urgency,publish_at")
      .order("publish_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as NoticeSnapshot | null;
  } catch {
    return null;
  }
}

async function getActiveEditionId(): Promise<string> {
  if (!hasPublicSupabaseConfiguration()) return "";
  try {
    const client = createPublicClient();
    const { data } = await client
      .from("editions")
      .select("id")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  } catch {
    // fallback to admin client
  }
  if (hasSupabaseConfiguration()) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("editions")
        .select("id")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data?.id ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

async function getAuthStatus() {
  if (!hasSupabaseConfiguration()) return { loggedIn: false, name: "", isOrganiser: false };
  try {
    const client = await createRequestClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return { loggedIn: false, name: "", isOrganiser: false };
    const [profileResult, activationResult, noticeResult, eventsResult, adminResult] = await Promise.all([
      client.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle(),
      client.rpc("can_manage_access"),
      client.rpc("can_publish_notices"),
      client.rpc("list_managed_events"),
      client.rpc("is_main_admin"),
    ]);
    const profile = profileResult.data;
    const firstName = profile?.full_name?.trim().split(/\s+/)[0] || "Student";
    const isOrganiser = activationResult.data === true || noticeResult.data === true || adminResult.data === true || (eventsResult.data?.length ?? 0) > 0;
    return { loggedIn: true, name: firstName, isOrganiser };
  } catch {
    return { loggedIn: false, name: "", isOrganiser: false };
  }
}

const destinations = [
  { href: "/events", title: "Events", detail: "Browse events and apply to take part.", path: "M8 3v3m8-3v3M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" },
  { href: "/schedule", title: "Schedule", detail: "Times, venues and upcoming fixtures.", path: "M12 8v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/standings", title: "Results & standings", detail: "Event winners and batch positions.", path: "M5 20v-6h4v6m2 0V4h4v16m2 0v-9h4v9M3 20h19" },
  { href: "/notices", title: "Notices", detail: "Announcements and important updates.", path: "M8 5h12v16H4V5h4Zm0 0V3h8v4H8V5Zm0 7h8m-8 4h5" },
  { href: "/merchandise", title: "Merchandise", detail: "The official festival collection.", path: "m5 8-1 13h16L19 8H5Zm3 0V6a4 4 0 0 1 8 0v2" },
  { href: "/gallery", title: "Gallery", detail: "Moments from across the campus.", path: "M3 4h18v16H3V4Zm0 12 5-5 4 4 3-3 6 6M16 8h.01" },
  { href: "/committee", title: "Council", detail: "Meet the organising team.", path: "M16 21v-3a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v3m16 0v-3a4 4 0 0 0-3-4M14 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm3-3a4 4 0 0 1 0 8" },
  { href: "/faqs", title: "Help & Information", detail: "Useful information for your fest experience.", path: "M9 9a3 3 0 1 1 4 3c-1 .5-1 1-1 2m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
];

export default async function HomePage() {
  const [topBatches, authStatus, latestNotice, editionId, sponsors] = await Promise.all([
    getTopBatches(),
    getAuthStatus(),
    getLatestNotice(),
    getActiveEditionId(),
    getPublishedSponsors(),
  ]);

  // If not logged in, redirect to auth gateway
  if (!authStatus.loggedIn) {
    redirect("/?next=/home");
  }

  const stripSponsors = groupSponsors(sponsors).flatMap((group) => group.items)
    .map(({ id, name, tier, logo_url, logo_alt }) => ({ id, name, tier, logo_url, logo_alt }));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <SpandanLogo variant="light" />
        <nav aria-label="Festival navigation">
          <Link href="/events">Events</Link>
          <Link href="/schedule">Schedule</Link>
          <Link href="/notices">Notices</Link>
          {authStatus.isOrganiser && <Link href="/admin" className={styles.headerCta}>Organiser portal →</Link>}
          <Link href="/my-fest" className={styles.headerCta}>
            My Fest ({authStatus.name}) →
          </Link>
        </nav>
      </header>

      <div className={styles.content}>
        <section className={styles.intro} aria-labelledby="festival-title">
          <div>
            <p className={styles.eyebrow}>
              <span className={styles.edition}>EDITION 04</span> ASMC Firozabad
            </p>
            <h1 id="festival-title">
              SPANDAN<span>4.0</span>
            </h1>
            <p className={styles.tagline}>
              Out of the ordinary.<br />
              <em>Into the fest.</em>
            </p>
            <p className={styles.description}>
              The stage. The field. The memories.<br />
              Make this one yours.
            </p>
          </div>
          <div className={styles.festivalPrint}>
            <div className={styles.printHeader}>
              <span>THE CAMPUS EDITION</span>
              <span>04 / ASMC</span>
            </div>
            <div className={styles.festivalArt}>
              <Image src="/visuals/festival-flatlay.webp" alt="Festival objects including a shuttlecock, cricket ball, microphone, paintbrushes and stethoscope" width={1440} height={960} priority sizes="(max-width: 700px) 42vw, 420px" />
            </div>
            <div className={styles.printWords}>
              <span>PLAY.</span>
              <span>PERFORM.</span>
              <span>BELONG.</span>
            </div>
            <div className={styles.printFooter}>SPORTS / CULTURE / LITERARY</div>
          </div>
        </section>

        <SponsorStrip sponsors={stripSponsors.filter((sponsor) => sponsorTier(sponsor.tier) === 0)} variant="title" placement="home-title" />

        <div className={styles.festivalStrip}>
          <span>A little competition.</span>
          <span>A lot of campus spirit.</span>
          <span className={styles.campusEditionNote}>ASMC Firozabad Inter-Batch Festival</span>
        </div>

        {latestNotice && (
          <div className={styles.noticeAlert}>
            <span className={`${styles.noticePill} ${styles[latestNotice.urgency] ?? styles.normal}`}>
              {latestNotice.urgency === "urgent" ? "🚨 Urgent Bulletin" : "📢 Council Notice"}
            </span>
            <span className={styles.noticeText}>{latestNotice.title}</span>
            <Link href="/notices" className={styles.noticeLink}>Read circular →</Link>
          </div>
        )}

        <div className={styles.radar}>
          <HappeningNowRadar />
        </div>

        <section className={styles.explore} aria-labelledby="explore-title">
          <div className={styles.sectionHeading}>
            <h2 id="explore-title">Your fest, at a glance.</h2>
            <span>From first entry to final encore.</span>
          </div>
          <div className={styles.grid}>
            {destinations.map((item) => (
              <Link href={item.href} key={item.href} className={styles.card}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={item.path} />
                </svg>
                <div className={styles.cardCopy}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
                <span className={styles.arrow} aria-hidden>↗</span>
              </Link>
            ))}
          </div>
        </section>

        <SponsorStrip sponsors={stripSponsors.filter((sponsor) => sponsorTier(sponsor.tier) !== 0)} placement="home-partners" />

        {topBatches.length > 0 && (
          <section className={styles.standings} aria-labelledby="standings-title">
            <div className={styles.sectionHeading}>
              <h2 id="standings-title">Batch standings</h2>
              <Link href="/standings">View all <span aria-hidden>→</span></Link>
            </div>
            <ol>
              {topBatches.map((batch, index) => (
                <li key={batch.batch_id}>
                  <span className={styles.rank}>0{index + 1}</span>
                  <strong>{batch.label}</strong>
                  <span>{batch.points} <small>pts</small></span>
                </li>
              ))}
            </ol>
          </section>
        )}

        <footer className={styles.footer}>
          <div className={styles.footerBrand}>
            <strong>Spandan 4.0 · ASMC Firozabad</strong>
          </div>
          <div className={styles.footerActions}>
            <ShareFeedbackButton authStatus={authStatus} editionId={editionId} />
            <Link href="/guest">Guest Directory</Link>
            <Link href="/sponsors">Sponsors &amp; Partners</Link>
            <Link href="/faqs">Help &amp; FAQs</Link>
            {authStatus.isOrganiser && <Link href="/admin">Organiser portal <span aria-hidden>↗</span></Link>}
          </div>
        </footer>
      </div>
    </main>
  );
}
