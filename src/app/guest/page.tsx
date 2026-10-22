import Link from "next/link";
import { SpandanLogo } from "@/components/spandan-branding";
import homeStyles from "../homepage.module.css";
import styles from "./guest.module.css";

export const metadata = {
  title: "Guest Directory — Spandan 4.0 | ASMC Firozabad",
  description: "Public schedules, verified results, standings and campus circulars for Spandan 4.0 guests.",
};

export const dynamic = "force-dynamic";

const destinations = [
  { href: "/schedule", title: "Programme schedule", detail: "Daily timings, venues and reporting calls.", path: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" },
  { href: "/standings", title: "Results & standings", detail: "Verified winners and the batch leaderboard.", path: "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34M18 4H6v7a6 6 0 0 0 12 0V4Z" },
  { href: "/notices", title: "Campus circulars", detail: "Official announcements and venue alerts.", path: "m3 11 18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6" },
  { href: "/events", title: "Event guide", detail: "Explore event categories, rules and venues.", path: "M8 3v3m8-3v3M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" },
  { href: "/gallery", title: "Festival gallery", detail: "Highlights and memories from the campus.", path: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3zM9 13a3 3 0 1 0 6 0 3 3 0 0 0-6 0Z" },
  { href: "/committee", title: "Council & patrons", detail: "Meet the faculty and student organisers.", path: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8m13 18v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" },
];

export default function GuestDirectoryPage() {
  return (
    <main className={homeStyles.page}>
      <header className={homeStyles.header}>
        <SpandanLogo size="medium" variant="light" />
        <nav aria-label="Guest navigation">
          <Link href="/">Entry</Link>
          <span className={styles.publicLabel}>Guest access</span>
          <Link href="/account" className={homeStyles.headerCta}>Student sign in →</Link>
        </nav>
      </header>

      <div className={homeStyles.content}>
        <section className={styles.hero}>
          <p className={styles.eyebrow}><span>Public directory</span> SPANDAN 4.0 · ASMC Firozabad</p>
          <h1>Festival information,<br /><em>open to everyone.</em></h1>
          <p>Browse the official programme, verified results, event guide and campus updates.</p>
        </section>

        <section className={styles.accessNote} aria-label="Guest access details">
          <div><strong>Guest view</strong><span>Read-only public access</span></div>
          <p>Entries, voting, digital Fest Passes and participant tools are available only after student sign in.</p>
          <Link href="/account">Sign in to participate →</Link>
        </section>

        <section className={homeStyles.explore} aria-labelledby="guest-explore-title">
          <div className={homeStyles.sectionHeading}>
            <h2 id="guest-explore-title">Browse the festival</h2>
            <span>Official public information</span>
          </div>
          <div className={homeStyles.grid}>
            {destinations.map((item) => (
              <Link href={item.href} key={item.href} className={homeStyles.card}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.path} /></svg>
                <div className={homeStyles.cardCopy}>
                  <h3>{item.title}</h3>
                  <p>{item.detail}</p>
                </div>
                <span className={homeStyles.arrow} aria-hidden>↗</span>
              </Link>
            ))}
          </div>
        </section>

        <footer className={homeStyles.footer}>
          <div className={homeStyles.footerBrand}><strong>Spandan 4.0 · ASMC Firozabad</strong></div>
          <div className={homeStyles.footerActions}>
            <Link href="/sponsors">Sponsors &amp; partners</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/account">Student portal</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
