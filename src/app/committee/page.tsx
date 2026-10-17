import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

// Names, roles and contact details must be supplied or approved by the organising committee.
const committeeApproved = false;

export const metadata = {
  title: "Organising Committee & Leadership — Spandan 4.0 | ASMC Firozabad",
  description: "Meet the institutional patrons, faculty advisors, student council leaders, and event heads of Spandan 4.0 at ASMC Firozabad.",
};

const PATRONS = [
  {
    initials: "DP",
    badge: "Chief Patron",
    name: "Dr. S. K. Singh",
    role: "Director & Principal",
    dept: "Autonomous State Medical College & Hospital, Firozabad",
    desc: "Guiding institutional excellence and academic-cultural balance for Spandan 4.0.",
  },
  {
    initials: "CMS",
    badge: "Patron",
    name: "Dr. R. K. Sharma",
    role: "Chief Medical Superintendent",
    dept: "District Combined Hospital & Medical College Campus",
    desc: "Overseeing campus health infrastructure, safety protocols, and festival medical emergency readiness.",
  },
  {
    initials: "FA",
    badge: "Faculty Advisor",
    name: "Dr. Ananya Verma",
    role: "Chairperson, Cultural & Sports Affairs",
    dept: "Department of Community Medicine, ASMC Firozabad",
    desc: "Faculty advisory on event fairness, student welfare, inter-batch unity, and disciplinary standards.",
  },
];

const CORE_LEADERS = [
  {
    initials: "HS",
    badge: "Fest Convener",
    name: "Himanshu Sharma",
    role: "General Secretary & Lead Coordinator",
    dept: "MBBS Batch of 2021",
    desc: "Overseeing core execution, digital operating system delivery, schedule harmonisation, and inter-batch liaisons.",
    contact: "fest.spandan@asmcfirozabad.edu.in",
  },
  {
    initials: "AT",
    badge: "Treasury Head",
    name: "Ayush Tiwari",
    role: "Finance & Accounts In-Charge",
    dept: "MBBS Batch of 2021",
    desc: "Managing external ledger reconciliations, student verification at registration desk, and event budget accounts.",
    contact: "treasury.spandan@asmcfirozabad.edu.in",
  },
  {
    initials: "SG",
    badge: "Operations Head",
    name: "Shreya Gupta",
    role: "Ground Operations & Protocol",
    dept: "MBBS Batch of 2022",
    desc: "Coordinating venue allocation, stage management, guest welcoming, and timing compliance across venues.",
    contact: "operations.spandan@asmcfirozabad.edu.in",
  },
];

const CATEGORY_HEADS = [
  {
    initials: "VK",
    badge: "Sports Secretary",
    name: "Vikram Kumar",
    role: "Lead, Athletics & Team Sports",
    dept: "Cricket, Football, Badminton, Table Tennis, Volleyball",
    desc: "Ground schedule management, referee/umpire rosters, and match live score operator assignments.",
  },
  {
    initials: "MD",
    badge: "Cultural Secretary",
    name: "Meera Deshmukh",
    role: "Lead, Stage & Performing Arts",
    dept: "Dance, Music, Band Night, Fashion & Dramatics",
    desc: "Auditorium stage lighting, sound engineering coordination, and solo/squad performance line-ups.",
  },
  {
    initials: "RA",
    badge: "Literary Lead",
    name: "Rohan Agrawal",
    role: "Lead, Literary & Fine Arts",
    dept: "Debate, Med-Quiz, Creative Writing, Sketching & Rangoli",
    desc: "Academic hall scheduling, jury coordination, and prompt topic announcements.",
  },
  {
    initials: "NM",
    badge: "Media Lead",
    name: "Nikhil Mishra",
    role: "Media, Documentation & Creative Assets",
    dept: "Photo/Video Coverage, Teasers, Campus Anthem & Press",
    desc: "Archiving festival moments, stage reveal announcements, and official notices broadcast.",
  },
];

export default function CommitteePage() {
  if (!committeeApproved) {
    return <main className="public-page"><FestTopNav activePage="committee" /><section className="public-hero"><span className="fest-hero-badge">🏛️ Organising Committee</span><h1>Committee details <em>coming soon</em></h1><p>Verified committee information will be published here by the festival organisers.</p></section><section className="public-content"><div className="empty-public"><p className="eyebrow">Awaiting confirmation</p><h2>No committee directory is published yet.</h2><p>For now, use official notices or the signed-in help desk for festival queries.</p></div></section><footer className="public-footer"><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/notices">Official notices →</Link></footer></main>;
  }
  return (
    <main className="public-page">
      <FestTopNav activePage="committee" />

      <section className="public-hero">
        <span className="fest-hero-badge">🏛️ Organising Body</span>
        <h1>Festival Council &amp; <em>Team</em></h1>
        <p>Student leadership, faculty mentors, and institutional patrons.</p>
      </section>

      <div className="public-content">
        {/* Patrons & Institutional Mentors */}
        <div className="committee-section-group">
          <div className="public-section-heading">
            <div>
              <p className="eyebrow">Institutional Patronage</p>
              <h2>College Patrons &amp; Advisors</h2>
            </div>
            <p>
              Guiding the festival vision, administrative sanctions, and medical campus hospitality.
            </p>
          </div>

          <div className="committee-grid">
            {PATRONS.map((person) => (
              <article key={person.name} className="committee-card">
                <span className="committee-role-badge">{person.badge}</span>
                <div className="committee-avatar" aria-hidden>{person.initials}</div>
                <h4 className="committee-name">{person.name}</h4>
                <p className="committee-title">{person.role}</p>
                <p className="committee-desc" style={{ fontStyle: "italic", color: "#80524d" }}>{person.dept}</p>
                <p className="committee-desc">{person.desc}</p>
              </article>
            ))}
          </div>
        </div>

        {/* Core Student Committee */}
        <div className="committee-section-group">
          <div className="public-section-heading">
            <div>
              <p className="eyebrow">Student Council Core</p>
              <h2>Core Festival Committee</h2>
            </div>
            <p>
              Elected and appointed student representatives responsible for finance, software, and day-to-day festival operations.
            </p>
          </div>

          <div className="committee-grid">
            {CORE_LEADERS.map((person) => (
              <article key={person.name} className="committee-card">
                <span className="committee-role-badge">{person.badge}</span>
                <div className="committee-avatar" aria-hidden>{person.initials}</div>
                <h4 className="committee-name">{person.name}</h4>
                <p className="committee-title">{person.role}</p>
                <p className="committee-desc" style={{ fontStyle: "italic", color: "#80524d" }}>{person.dept}</p>
                <p className="committee-desc">{person.desc}</p>
                {person.contact && <span className="committee-contact-tag">Official: {person.contact}</span>}
              </article>
            ))}
          </div>
        </div>

        {/* Category Heads */}
        <div className="committee-section-group">
          <div className="public-section-heading">
            <div>
              <p className="eyebrow">Competition Operations</p>
              <h2>Event Category Secretaries</h2>
            </div>
            <p>
              Managing category-specific rules, applicant reviews, ground fixtures, and live score recording.
            </p>
          </div>

          <div className="committee-grid">
            {CATEGORY_HEADS.map((person) => (
              <article key={person.name} className="committee-card">
                <span className="committee-role-badge">{person.badge}</span>
                <div className="committee-avatar" aria-hidden>{person.initials}</div>
                <h4 className="committee-name">{person.name}</h4>
                <p className="committee-title">{person.role}</p>
                <p className="committee-desc" style={{ fontStyle: "italic", color: "#80524d" }}>{person.dept}</p>
                <p className="committee-desc">{person.desc}</p>
              </article>
            ))}
          </div>
        </div>

        {/* Help Desk Reference Card */}
        <section className="partnership-cta-card" style={{ maxWidth: "100%" }}>
          <p className="eyebrow" style={{ color: "#bc6256" }}>Grievance &amp; Queries</p>
          <h3>Need to raise an issue with the committee?</h3>
          <p>
            For registration errors, batch verification, or rule clarifications, enrolled students 
            can submit a private inquiry directly via their account dashboard. Inquiries stay encrypted 
            and attached to your fest record, routed directly to the assigned event head.
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "8px" }}>
            <Link className="cta-link-btn" href="/account">Student Help Desk →</Link>
            <Link className="cta-link-btn" href="/faqs" style={{ background: "transparent", color: "#261923", border: "1px solid #261923" }}>Read Operating FAQs</Link>
          </div>
        </section>
      </div>

      <footer className="public-footer">
        <div>
          <strong>Spandan 4.0</strong> · ASMC Firozabad Official Festival Operating System
        </div>
        <div>
          <Link href="/guest" style={{ color: "inherit", textDecoration: "underline" }}>Guest Portal</Link> · <Link href="/account" style={{ color: "inherit", textDecoration: "underline" }}>Student Sign In</Link>
        </div>
      </footer>
    </main>
  );
}
