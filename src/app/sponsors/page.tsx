import Link from "next/link";
import { getPublishedSponsors } from "@/server/sponsors";
import { groupSponsors, sponsorAnchor, sponsorWebsite } from "@/lib/sponsors";
import { SponsorLogo } from "@/components/sponsor-logo";
import styles from "@/components/sponsors.module.css";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

export const dynamic = "force-dynamic";

export default async function SponsorsPage() {
  const sponsors = await getPublishedSponsors();
  const tiers = groupSponsors(sponsors);

  return (
    <main className="public-page">
      <FestTopNav activePage="sponsors" />

      <section className="public-hero">
        <span className="fest-hero-badge">🤝 Sponsors &amp; Partners</span>
        <h1>Festival Sponsors &amp; <em>Partners</em></h1>
        <p>
          Institutional patrons, medical associations, and partners supporting Spandan 4.0 at ASMC Firozabad.
        </p>
      </section>

      <section className="public-content">
        <div className="public-section-heading">
          <h2>Official Sponsors &amp; Partners</h2>
          <p>
            Curated and approved by the ASMC Firozabad Festival Committee. To partner with us, contact the festival treasury.
          </p>
        </div>

        {sponsors.length > 0 ? (
          <div className="sponsors-tier-container">
            {tiers.map((t) =>
              t.items.length > 0 ? (
                <div key={t.label} className="sponsor-tier-group">
                  <h3 className="tier-heading">{t.label}</h3>
                  <div className="sponsors-grid">
                    {t.items.map((s) => (
                      <article key={s.id} id={sponsorAnchor(s.id)} className={`sponsor-card ${styles.directoryCard}`}>
                        <div className="sponsor-logo-box">
                          <SponsorLogo src={s.logo_url} alt={s.logo_alt} name={s.name} />
                        </div>
                        <h4>{s.name}</h4>
                        <span className="sponsor-tier-label">{s.tier}</span>
                        {s.description && <p>{s.description}</p>}
                        {sponsorWebsite(s.website_url) && (
                          <a href={sponsorWebsite(s.website_url)!} target="_blank" rel="noopener noreferrer" className="sponsor-link">
                            Visit Partner Website ↗
                          </a>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className="empty-public">
            <p className="eyebrow">Awaiting confirmation</p>
            <h2>Official sponsors and partners have not been published.</h2>
            <p>Only committee-approved partner names, logos, descriptions and links will appear here.</p>
          </div>
        )}
      </section>

      <footer className="public-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <Link href="/my-fest">Go to My Fest →</Link>
      </footer>
    </main>
  );
}
