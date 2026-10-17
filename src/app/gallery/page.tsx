import Link from "next/link";
import Image from "next/image";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { FestTopNav } from "@/components/spandan-branding";
import "../public-info.css";

export const dynamic = "force-dynamic";

type MediaItem = {
  id: string;
  kind: string;
  title: string;
  asset_url: string;
  thumbnail_url: string | null;
  alt_text: string;
  caption: string | null;
  rights_note: string;
};

type StageReveal = {
  id: string;
  artist_name: string;
  description: string | null;
  image_url: string | null;
  image_alt: string;
  stage_at: string | null;
};

export default async function GalleryPage() {
  let media: MediaItem[] = [];
  let reveals: StageReveal[] = [];

  if (hasPublicSupabaseConfiguration()) {
    try {
      const client = createPublicClient();
      const [{ data: mediaData }, { data: revealData }] = await Promise.all([
        client.from("media_items").select("id,kind,title,asset_url,thumbnail_url,alt_text,caption,rights_note"),
        client.from("stage_reveals").select("id,artist_name,description,image_url,image_alt,stage_at"),
      ]);
      media = (mediaData ?? []) as MediaItem[];
      reveals = (revealData ?? []) as StageReveal[];
    } catch {
      media = [];
      reveals = [];
    }
  }

  return (
    <main className="public-page">
      <FestTopNav activePage="gallery" />

      <section className="public-hero">
        <span className="fest-hero-badge">📸 Media &amp; Highlights</span>
        <h1>Festival Moments &amp; <em>Reveals</em></h1>
        <p>Official photography, star night reveals, and stage highlights.</p>
      </section>

      <section className="public-content">
        {/* Stage Reveals Section */}
        <div className="gallery-section">
          <div className="public-section-heading">
            <h2>Star Nights &amp; Stage Reveals</h2>
            <p>Celebrity performers and cultural night headline shows.</p>
          </div>

          {reveals.length > 0 ? (
            <div className="reveals-grid">
              {reveals.map((rev) => (
                <article key={rev.id} className="reveal-card">
                  {rev.image_url ? (
                    <div className="reveal-image-wrapper">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={rev.image_url} alt={rev.image_alt} loading="lazy" />
                    </div>
                  ) : (
                    <div className="reveal-image-wrapper reveal-image-placeholder">
                      <Image src="/visuals/stage-atmosphere.webp" alt="An empty festival stage under warm spotlights" width={1440} height={960} sizes="(max-width: 720px) 88vw, 420px" />
                      <span>Artist reveal soon</span>
                    </div>
                  )}
                  <div className="reveal-details">
                    <h3>{rev.artist_name}</h3>
                    {rev.description && <p>{rev.description}</p>}
                    {rev.stage_at && (
                      <span className="reveal-date">
                        Performance:{" "}
                        {new Intl.DateTimeFormat("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "Asia/Kolkata",
                        }).format(new Date(rev.stage_at))}
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="reveal-announcement-card">
              <div className="reveal-announcement-image"><Image src="/visuals/stage-atmosphere.webp" alt="An empty festival stage waiting for the first performance" width={1440} height={960} sizes="(max-width: 720px) 88vw, 680px" /></div>
              <div className="reveal-announcement-copy"><span className="media-type-pill">STAGE NOTES</span><h3>Star Night Reveals Dropping Soon</h3><p>Official performer and programme announcements will appear here once the organising committee publishes them.</p></div>
            </div>
          )}
        </div>

        {/* Media & Anthem Section */}
        <div className="gallery-section" style={{ marginTop: 60 }}>
          <div className="public-section-heading">
            <h2>Festival Anthems &amp; Teasers</h2>
            <p>Official promotional videos, campus anthems, and photo archives.</p>
          </div>

          {media.length > 0 ? (
            <div className="media-grid">
              {media.map((item) => (
                <article key={item.id} className="media-card">
                  {(item.thumbnail_url || ["photo", "image"].includes(item.kind.toLowerCase())) && <div className="media-card-thumbnail">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.thumbnail_url ?? item.asset_url} alt={item.alt_text} loading="lazy" decoding="async" />
                  </div>}
                  <div className="media-type-pill">{item.kind.toUpperCase()}</div>
                  <h3>{item.title}</h3>
                  {item.caption && <p>{item.caption}</p>}
                  <a href={item.asset_url} target="_blank" rel="noopener noreferrer" className="media-watch-btn">
                    Watch / Listen ↗
                  </a>
                  <span className="rights-tag">© {item.rights_note}</span>
                </article>
              ))}
            </div>
          ) : (
            <div className="curated-media-showcase">
              <article className="media-feature-card">
                <div className="feature-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v12H4zM8 3v3m8-3v3M4 10h16m-12 4h3m2 0h3" /></svg></div>
                <div>
                  <span className="media-type-pill">ANTHEM TEASER</span>
                  <h3>Spandan 4.0 Official Theme &amp; Anthem</h3>
                  <p>
                    Produced exclusively by the ASMC Firozabad Student Union celebrating camaraderie, sleepless ward duties,
                    and cultural unity.
                  </p>
                  <p className="curation-guideline">
                    Notice: In accordance with festival policy, unverified student video uploads are disabled. All photos
                    and video edits are published solely by the authorized media squad.
                  </p>
                </div>
              </article>
            </div>
          )}
        </div>
      </section>

      <footer className="public-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <Link href="/events">Explore Event Line-up →</Link>
      </footer>
    </main>
  );
}
