import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createPublicClient } from "@/server/supabase/public";
import styles from "./committee.module.css";
import "../public-info.css";

export const revalidate = 300;

export const metadata = {
  title: "Festival Council — Spandan 4.0 | ASMC Firozabad",
  description: "Institutional leadership and the MBBS Batch 2023 organising council for Spandan 4.0.",
};

type Leader = { id: string; name: string; role: string; department: string | null; photoUrl: string | null; photoAlt: string | null };
type CouncilMember = { id: string; name: string; role: "head" | "member"; photoUrl: string | null; photoAlt: string | null; registered: boolean };
type Committee = { id: string; slug: string; name: string; batchLabel: string; members: CouncilMember[] };
type CouncilDirectory = { leadership: Leader[]; committees: Committee[] };

const verifiedPreview: CouncilDirectory = {
  leadership: [
    { id: "faculty-principal", name: "Dr. Yogesh Kumar Goyal Sir", role: "Principal", department: null, photoUrl: null, photoAlt: null },
    { id: "faculty-sports", name: "Dr. Ashutosh Bhardwaj Sir", role: "Sports In-charge", department: "Head, Department of Physiology", photoUrl: null, photoAlt: null },
    { id: "faculty-cultural", name: "Dr. Nita Garg Ma’am", role: "Cultural In-charge", department: "Head, Department of Biochemistry", photoUrl: null, photoAlt: null },
  ],
  committees: ["Core Committee", "Finance Committee", "Stage & Sound Management", "Decoration Committee", "Food Committee", "Sports Committee", "Cultural Committee", "Technical & App Management"]
    .map((name, index) => ({ id: `preview-${index}`, slug: `preview-${index}`, name, batchLabel: "2023", members: [] })),
};

function initials(name: string) {
  return name.replace(/^Dr\.\s*/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function respectfulName(name: string) {
  return name.replace(/\s(Sir|Ma’am)$/u, " $1");
}

function Avatar({ person, featured = false }: { person: Pick<Leader, "name" | "photoUrl" | "photoAlt">; featured?: boolean }) {
  return <span className={`${styles.avatar} ${featured ? styles.featuredAvatar : ""}`} aria-hidden={!person.photoUrl}>
    {/* Public council photos are organiser-approved HTTPS assets with CSS-enforced dimensions. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {person.photoUrl ? <img src={person.photoUrl} alt={person.photoAlt ?? ""} /> : initials(person.name)}
  </span>;
}

function LeadershipCard({ person, featured = false }: { person: Leader; featured?: boolean }) {
  return <article className={featured ? styles.principalCard : styles.advisorCard}>
    <Avatar person={person} featured={featured} />
    <div className={styles.leaderCopy}>
      <p className={styles.role}>{person.role}</p>
      <h3>{respectfulName(person.name)}</h3>
      {person.department && <p className={styles.department}>{person.department}</p>}
    </div>
  </article>;
}

export default async function CommitteePage() {
  let directory: CouncilDirectory | null = null;
  if (hasPublicSupabaseConfiguration()) {
    try {
      directory = await coalesceCached("public-committee-directory", [PUBLIC_CACHE_TAGS.committee], 300, async () => {
        const { data, error } = await createPublicClient().rpc("get_public_council_directory");
        if (error) throw new Error(error.message);
        return data && typeof data === "object" ? (data as CouncilDirectory) : null;
      });
    } catch { /* fallback preview below */ }
  }

  // Production reads the council tables only. This verified development preview
  // makes the layout reviewable before the production DDL is manually applied.
  const showPreview = process.env.NODE_ENV !== "production";
  const leadership = directory?.leadership?.length ? directory.leadership : showPreview ? verifiedPreview.leadership : [];
  const committees = directory?.committees?.length ? directory.committees : showPreview ? verifiedPreview.committees : [];
  const principal = leadership.find((person) => person.role.toLocaleLowerCase() === "principal") ?? leadership[0];
  const advisors = leadership.filter((person) => person.id !== principal?.id);

  return <main className="public-page">
    <FestTopNav activePage="committee" />
    <section className={`public-hero ${styles.hero}`}>
      <span className="fest-hero-badge">Festival council · Spandan 4.0</span>
      <h1>Guided with purpose.<br /><em>Built by students.</em></h1>
      <p>College leadership and the MBBS Batch 2023 team behind six days of sport, culture and community.</p>
    </section>

    <div className={`public-content ${styles.content}`}>
      {leadership.length > 0 && <section className={styles.leadershipSection} aria-labelledby="leadership-title">
        <header className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Institutional leadership</p><h2 id="leadership-title">Leadership &amp; faculty guidance</h2></div>
          <p>With the guidance and support of the college administration and faculty.</p>
        </header>
        <div className={styles.leadershipGrid}>
          {principal && <LeadershipCard person={principal} featured />}
          {advisors.length > 0 && <div className={styles.advisorStack}>{advisors.map((person) => <LeadershipCard key={person.id} person={person} />)}</div>}
        </div>
      </section>}

      <section className={styles.councilSection} aria-labelledby="council-title">
        <header className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>Organising council · MBBS 2023</p><h2 id="council-title">The teams behind Spandan</h2></div>
          <p>Committee heads and members will appear here after the official roster is confirmed.</p>
        </header>

        {committees.length > 0 ? <div className={styles.committeeGrid}>
          {committees.map((committee, index) => {
            const head = committee.members.find((member) => member.role === "head");
            const members = committee.members.filter((member) => member.role === "member");
            const identity = <>
              <span className={styles.committeeNumber}>{String(index + 1).padStart(2, "0")}</span>
              <span className={styles.committeeIdentity}><strong>{committee.name}</strong><small>MBBS Batch {committee.batchLabel}</small></span>
            </>;
            if (!committee.members.length) return <article key={committee.id} className={`${styles.committeeCard} ${styles.emptyCommitteeCard}`}>
              <div className={styles.committeeSummary}>{identity}<span className={styles.awaitingBadge}>Members to be announced</span></div>
            </article>;
            return <details key={committee.id} className={styles.committeeCard}>
              <summary>
                {identity}
                <span className={styles.memberCount}>{`${committee.members.length} ${committee.members.length === 1 ? "member" : "members"}`}</span>
                <span className={styles.expand} aria-hidden="true">+</span>
              </summary>
              <div className={styles.committeeBody}>
                {head && <div className={styles.headRow}><Avatar person={{ name: head.name, photoUrl: head.photoUrl, photoAlt: head.photoAlt }} /><div><span>Committee head</span><strong>{head.name}</strong></div></div>}
                {members.length > 0 && <ul className={styles.memberList}>{members.map((member) => <li key={member.id}><span>{initials(member.name)}</span><strong>{member.name}</strong></li>)}</ul>}
              </div>
            </details>;
          })}
        </div> : <div className="empty-public"><p className="eyebrow">Awaiting publication</p><h2>The organising council will appear here.</h2><p>Only officially confirmed committee information is published.</p></div>}
      </section>

      <section className={styles.helpCard}>
        <div><p className={styles.eyebrow}>Council desk</p><h2>Need help from the organising team?</h2><p>Registration and event queries remain private inside the student help desk.</p></div>
        <div className={styles.helpActions}><Link href="/account">Student Help Desk →</Link><Link href="/faqs">Read FAQs</Link></div>
      </section>
    </div>

    <footer className="public-footer"><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/guest">Guest Portal</Link></footer>
  </main>;
}
