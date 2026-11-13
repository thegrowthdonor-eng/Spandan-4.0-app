import Image from "next/image";
import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import { sortGalleryMoments, type GalleryMomentRow } from "@/lib/gallery";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createPublicClient } from "@/server/supabase/public";
import styles from "./gallery.module.css";
import { mediaUrls } from "@/server/media/urls";

export const revalidate = 30;

async function loadPublishedGalleryMoments() {
  const publicClient = createPublicClient();
  const { data, error } = await publicClient.rpc("get_published_gallery_moments");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GalleryMomentRow[];
  const imageUrl = await mediaUrls(rows.map((row) => row.storage_path));
  return sortGalleryMoments(rows).map((moment) => ({
    ...moment,
    imageUrl: imageUrl(moment.storage_path),
  }));
}

export default async function GalleryPage() {
  let moments: (GalleryMomentRow & { imageUrl: string })[] = [];
  if (hasPublicSupabaseConfiguration()) {
    try {
      moments = await coalesceCached(
        "public-gallery-moments",
        [PUBLIC_CACHE_TAGS.gallery],
        30,
        loadPublishedGalleryMoments,
      );
    } catch { /* Public empty state remains available during setup. */ }
  }

  return <main className={styles.page}>
    <FestTopNav activePage="gallery" />
    <section className={styles.hero}>
      <p className={styles.eyebrow}>SPANDAN 4.0 · CAMPUS MOMENTS</p>
      <h1>The moments between <em>the moments.</em></h1>
      <p>Candid frames from fields, courts, stages and corridors—shared by the official festival team.</p>
    </section>
    <section className={styles.content} aria-labelledby="moments-title">
      <div className={styles.heading}><div><p className={styles.eyebrow}>LATEST FROM CAMPUS</p><h2 id="moments-title">Festival moments</h2></div><span>{moments.length} {moments.length === 1 ? "moment" : "moments"}</span></div>
      {moments.length ? <div className={styles.grid}>{moments.map(moment => <article className={styles.card} key={moment.id}>
        <div className={styles.photo}>
          {/* Public Storage URLs are already compressed and CDN-backed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={moment.imageUrl} alt={moment.caption} loading="lazy" decoding="async" />
        </div>
        <div className={styles.copy}>
          <Link href={`/events/${moment.event_slug}`}>{moment.event_title}</Link>
          <p>{moment.caption}</p>
          <time dateTime={moment.occurred_at}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(moment.occurred_at))} IST</time>
        </div>
      </article>)}</div> : <div className={styles.empty}>
        <Image src="/visuals/campus-moments.webp" width={1440} height={960} alt="Students taking part in sports and stage activities" sizes="(max-width: 720px) 90vw, 680px" />
        <div><p className={styles.eyebrow}>THE CAMERA ROLL IS WARMING UP</p><h2>Real moments will land here.</h2><p>Once the festival team publishes its first candid, you will find it here with the event and moment time.</p><Link href="/events">Explore events →</Link></div>
      </div>}
    </section>
    <footer className={styles.footer}><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/feed">Open live feed →</Link></footer>
  </main>;
}
