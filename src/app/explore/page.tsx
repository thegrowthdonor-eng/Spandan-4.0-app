import Link from "next/link";
import { SpandanLogo } from "@/components/spandan-branding";
import "../my-fest/my-fest.css";

export default function ExplorePage() {
  return <main className="student-home-page explore-page">
    <header className="student-home-header"><SpandanLogo size="medium" variant="light" /><Link className="header-home-btn" href="/home">← Home</Link></header>
    <section className="student-home-intro"><p className="eyebrow">Explore SPANDAN</p><h1>See what&apos;s on.</h1><p>Events and organiser updates live together here—no separate feed to figure out.</p></section>
    <section className="student-home-grid" aria-label="Explore festival information">
      <Link href="/events" className="student-home-card primary"><span aria-hidden>⌕</span><div><strong>Events</strong><small>Browse, filter and apply to published events.</small></div><b aria-hidden>→</b></Link>
      <Link href="/notices" className="student-home-card"><span aria-hidden>◉</span><div><strong>Official updates</strong><small>Notices, changes and call-times from organisers.</small></div><b aria-hidden>→</b></Link>
    </section>
    <section className="student-home-links"><Link href="/standings">View batch standings <span>→</span></Link><Link href="/schedule">View full schedule <span>→</span></Link></section>
  </main>;
}
