import Image from "next/image";
import Link from "next/link";
import { SpandanLogo } from "@/components/spandan-branding";
import "../account/account.css";

export const metadata = {
  title: "Guest Directory — Spandan 4.0 | ASMC Firozabad",
  description: "Public schedules, verified results, standings & campus circulars for Spandan 4.0 guests.",
};

export const dynamic = "force-dynamic";

export default function GuestDirectoryPage() {
  return (
    <main className="account-page">
      {/* Top Header */}
      <header className="account-header">
        <SpandanLogo size="medium" variant="light" />
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link href="/" className="header-back-link">
            ← Options
          </Link>
          <Link
            href="/account"
            className="header-back-link"
            style={{ color: "#a9533e", fontWeight: 700 }}
          >
            Sign In →
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="account-hero">
        <div className="account-brand-pill">
          <Image
            src="/spandan-logo.png"
            alt="Spandan 4.0 Logo"
            width={44}
            height={44}
            className="brand-mini-logo"
            priority
          />
          <span className="brand-pill-text">PUBLIC GUEST DIRECTORY</span>
        </div>
        <h1>
          GUEST <span>HUB</span>
        </h1>
        <p className="hero-sub">
          Public schedules, verified results &amp; circulars freely accessible to all guests.
        </p>
      </section>

      {/* Main Container */}
      <section className="account-content">
        {/* Read-Only Limitation Callout */}
        <div className="guest-restriction-banner">
          <div className="restriction-badge">
            <span aria-hidden>🔒</span>
            <span>LIMITED PUBLIC ACCESS</span>
          </div>
          <p>
            You are browsing as a guest. Event entries, team applications, voting, and official digital Fest Passes are restricted to enrolled ASMC Firozabad MBBS students.
          </p>
          <div className="restriction-actions">
            <Link href="/account" className="restriction-btn-signin">
              Student Sign In →
            </Link>
            <Link href="/account?mode=signup" className="restriction-btn-register">
              Create Profile
            </Link>
          </div>
        </div>

        {/* 6 Public Cards matching Homepage Design System */}
        <div
          className="gateway-cards-grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
        >
          {/* Card 1: Schedule (Warm Mustard Gold) */}
          <Link href="/schedule" className="gateway-card card-gold">
            <div className="card-top">
              <span className="card-icon-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </span>
              <span className="card-arrow" aria-hidden>→</span>
            </div>
            <div className="card-copy">
              <h3>Programme Schedule</h3>
              <p>Daily pitch, court, and auditorium timings and reporting calls.</p>
            </div>
          </Link>

          {/* Card 2: Results & Standings (Sand) */}
          <Link href="/standings" className="gateway-card card-sand">
            <div className="card-top">
              <span className="card-icon-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34M18 4H6v7a6 6 0 0 0 12 0V4Z" />
                </svg>
              </span>
              <span className="card-arrow" aria-hidden>→</span>
            </div>
            <div className="card-copy">
              <h3>Results &amp; Standings</h3>
              <p>Confirmed podium winners, medal tally &amp; batch points leaderboard.</p>
            </div>
          </Link>

          {/* Card 3: Notices (Lavender) */}
          <Link href="/notices" className="gateway-card card-lavender">
            <div className="card-top">
              <span className="card-icon-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 11 18-5v12L3 13v-2zM11.6 16.8a3 3 0 1 1-5.8-1.6" />
                </svg>
              </span>
              <span className="card-arrow" aria-hidden>→</span>
            </div>
            <div className="card-copy">
              <h3>Campus Circulars</h3>
              <p>Official festival circulars, announcements &amp; venue alerts.</p>
            </div>
          </Link>

          {/* Card 4: Event Rules & Guidelines (Light Sage) */}
          <Link href="/events" className="gateway-card card-sage">
            <div className="card-top">
              <span className="card-icon-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 3v3m8-3v3M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z" />
                </svg>
              </span>
              <span className="card-arrow" aria-hidden>→</span>
            </div>
            <div className="card-copy">
              <h3>Event Rules &amp; Guidelines</h3>
              <p>Browse categories, solo &amp; squad rules, and venues (read-only).</p>
            </div>
          </Link>

          {/* Card 5: Gallery (Mint) */}
          <Link href="/gallery" className="gateway-card card-mint">
            <div className="card-top">
              <span className="card-icon-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                  <circle cx="12" cy="13" r="3" />
                </svg>
              </span>
              <span className="card-arrow" aria-hidden>→</span>
            </div>
            <div className="card-copy">
              <h3>Moments &amp; Gallery</h3>
              <p>Festival photography, performance highlights &amp; stage memories.</p>
            </div>
          </Link>

          {/* Card 6: Council (Ice Blue) */}
          <Link href="/committee" className="gateway-card card-ice">
            <div className="card-top">
              <span className="card-icon-badge" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm10 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <span className="card-arrow" aria-hidden>→</span>
            </div>
            <div className="card-copy">
              <h3>Council &amp; Patrons</h3>
              <p>Meet the patron faculty, mentors, and student council.</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Minimal Footer */}
      <footer className="account-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <div className="footer-links">
          <Link href="/">Back to Entry</Link>
          <Link href="/account">Student Portal</Link>
          <Link href="/sponsors">Sponsors &amp; Partners</Link>
        </div>
      </footer>
    </main>
  );
}
