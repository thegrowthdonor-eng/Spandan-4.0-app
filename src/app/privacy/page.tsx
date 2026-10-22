import type { Metadata } from "next";
import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import styles from "./privacy.module.css";

export const metadata: Metadata = {
  title: "Privacy & Data Policy — Spandan 4.0 | ASMC Firozabad",
  description:
    "Official privacy policy and student data governance protocols for Spandan 4.0, Atal Bihari Vajpayee Government Medical College (ASMC), Firozabad.",
};

const POLICY_SECTIONS = [
  {
    icon: "🎓",
    eyebrow: "Student Identity & Enrollment",
    title: "1. Official MBBS Cohort Verification",
    content: (
      <>
        <p>
          Spandan 4.0 is the official inter-batch festival of Atal Bihari Vajpayee Government Medical College (ASMC),
          Firozabad. Access to event registration, squad selection, and interactive voting is strictly restricted to
          enrolled MBBS students (Batches 2019 through 2024, including interns and faculty).
        </p>
        <ul className={styles.policyList}>
          <li>
            <strong>Roll Number &amp; Batch:</strong> Your official college roll number and batch assignment are used
            solely to verify your identity against the institutional roster.
          </li>
          <li>
            <strong>Zero Marketing or Spam:</strong> We never sell, rent, or trade student details. Your information is
            used exclusively for festival scheduling, match updates, and council notices.
          </li>
          <li>
            <strong>Synthetic Internal Identifiers:</strong> To ensure privacy across public databases, student accounts
            generate domain-isolated email identities (e.g. <code>roll.batch@student.asmcfzd.local</code>) rather than
            exposing personal emails.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🔐",
    eyebrow: "Account Security & Credentials",
    title: "2. Password Hashing & Salted Recovery",
    content: (
      <>
        <p>
          We employ state-of-the-art cryptographic safeguards to ensure that student authentication remains completely
          confidential:
        </p>
        <ul className={styles.policyList}>
          <li>
            <strong>One-Way Password Hashes:</strong> Student passwords are encrypted using one-way cryptographic hashing
            (bcrypt/Argon2). Plaintext passwords are never logged, stored, or visible to any committee member or database
            administrator.
          </li>
          <li>
            <strong>High-Entropy Recovery Tokens:</strong> Account recoveries and password resets are handled strictly via
            in-person physical verification at the Treasury/Registration desk with single-use, high-entropy salted
            tokens. This prevents remote account hijacking.
          </li>
          <li>
            <strong>Brute-Force Shielding:</strong> Sensitive endpoints (login, recovery, activation) are protected by
            distributed IP rate limiters with cryptographically blinded keys.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "🏆",
    eyebrow: "Competition Rosters & Standings",
    title: "3. Squad Registrations & Public Match Records",
    content: (
      <>
        <p>
          Participation in Spandan 4.0 athletic, cultural, and literary fixtures involves public competition records:
        </p>
        <ul className={styles.policyList}>
          <li>
            <strong>Public Information:</strong> Participant names, batch representations (e.g. Batch 2022 Spartans),
            competition event names, match scores, and official podium standings are published publicly on the live
            schedule, radar, and leaderboard.
          </li>
          <li>
            <strong>Restricted Information:</strong> Personal contact numbers, private application notes, and treasury
            receipt references remain private and are only accessible by the designated Event Head and Student Council
            Administrators.
          </li>
          <li>
            <strong>Roster Integrity:</strong> Once a fixture roster locks, entries cannot be silently modified, ensuring
            fairness across all collegiate batches.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "📸",
    eyebrow: "Campus Feed & Visual Media",
    title: "4. Live Moments, Photos & Media Rights",
    content: (
      <>
        <p>
          Spandan 4.0 celebrates campus spirit through photography and live feeds managed by the official student media
          squad:
        </p>
        <ul className={styles.policyList}>
          <li>
            <strong>Official Media Coverage:</strong> Photos and video reels captured during open-campus sports, stage
            performances, and literary fixtures are displayed in the Spandan Gallery and Live Feed.
          </li>
          <li>
            <strong>Right to Privacy &amp; Removal:</strong> If you appear prominently in any photo or video published on
            the app and wish to have it removed or blurred, you can request immediate removal by contacting the Media
            Coordinator or submitting a quick ticket from My Fest.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "💾",
    eyebrow: "Browser Storage & Cookies",
    title: "5. Local Storage & Functional Cookies",
    content: (
      <>
        <p>
          The Spandan 4.0 application is built as an offline-capable Progressive Web App (PWA). We store minimal data on
          your personal device:
        </p>
        <ul className={styles.policyList}>
          <li>
            <strong>Local Storage:</strong> Stored locally in your browser are PWA cache assets, fixture cache, your visit
            count (to trigger festival feedback prompts), and dismissal timestamps. This data remains on your physical
            device.
          </li>
          <li>
            <strong>Functional Cookies Only:</strong> We use strictly essential HTTP cookies to maintain authenticated
            student sessions with our Supabase backend. We do not use third-party advertising cookies, trackers, or
            behavioral analytics pixels.
          </li>
        </ul>
      </>
    ),
  },
  {
    icon: "📣",
    eyebrow: "Feedback & Grievances",
    title: "6. Honest Feedback Confidentiality",
    content: (
      <>
        <p>
          Student ratings and suggestions submitted via the Council Desk feedback form are analyzed solely to improve
          festival logistics, venue acoustics, lighting, refereeing, and scheduling.
        </p>
        <p>
          Grievances regarding scores or fixture decisions are processed under strict oversight from the Festival Main
          Admin and Faculty Advisors.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className={styles.privacyPage}>
      <FestTopNav />

      <header className={styles.hero}>
        <span className={styles.heroBadge}>🛡️ Data Protection &amp; Governance</span>
        <h1>
          Student Privacy &amp; <em>Data Policy</em>
        </h1>
        <p className={styles.heroSubtitle}>
          How ASMC Firozabad safeguards student records, authentication credentials, tournament fixtures, and campus
          media for Spandan 4.0.
        </p>
        <div className={styles.heroMeta}>
          <span>Edition 04 · Academic Year 2026</span>
          <span className={styles.heroMetaDot}>•</span>
          <span>ASMC Firozabad Student Council</span>
          <span className={styles.heroMetaDot}>•</span>
          <span>Effective throughout the festival</span>
        </div>
      </header>

      <div className={styles.shell}>
        <div className={styles.summaryBanner}>
          <h2>Principles in Brief</h2>
          <p>
            Your data belongs to you. We collect only what is required to verify collegiate MBBS eligibility, organize
            tournament squads, compute batch standings, and communicate urgent fixtures. We never display student phone
            numbers publicly, never serve external advertisements, and respect every student&apos;s right to privacy.
          </p>
        </div>

        <div className={styles.sectionsGrid}>
          {POLICY_SECTIONS.map((section) => (
            <article key={section.title} className={styles.policyCard}>
              <div className={styles.cardHeader}>
                <span className={styles.cardIcon} aria-hidden="true">
                  {section.icon}
                </span>
                <div className={styles.cardTitleWrap}>
                  <div className={styles.cardEyebrow}>{section.eyebrow}</div>
                  <h3>{section.title}</h3>
                </div>
              </div>
              <div>{section.content}</div>
            </article>
          ))}
        </div>

        <section className={styles.contactBox}>
          <h3>Questions or Data Assistance?</h3>
          <p>
            For any queries regarding your account records, data privacy, or to request media removals, contact the
            Spandan Festival IT Desk or the Student Welfare Committee in person at the College Council Room or reach out
            via My Fest support.
          </p>
          <div className={styles.contactActionRow}>
            <Link href="/my-fest" className={styles.contactBtn}>
              Open My Fest Support Desk →
            </Link>
            <Link href="/faqs" className={styles.secondaryBtn}>
              View Help &amp; FAQs
            </Link>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div>
          <strong>Spandan 4.0 · ASMC Firozabad</strong>
          <span style={{ marginLeft: "8px", opacity: 0.8 }}>Official Collegiate Festival</span>
        </div>
        <nav className={styles.footerNav} aria-label="Privacy footer navigation">
          <Link href="/home">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/sponsors">Sponsors</Link>
          <Link href="/faqs">FAQs</Link>
        </nav>
      </footer>
    </main>
  );
}
