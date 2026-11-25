import Image from "next/image";
import Link from "next/link";
import { FestTopNav } from "@/components/spandan-branding";
import { sortGalleryMoments, type GalleryPostRow } from "@/lib/gallery";
import { getActiveSession } from "@/server/auth/access";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createPublicClient } from "@/server/supabase/public";
import { createRequestClient } from "@/server/supabase/server";
import styles from "./gallery.module.css";
import { mediaUrls } from "@/server/media/urls";
import { PostComposer } from "./post-composer";

export const revalidate = 30;

async function loadPublishedGalleryMoments() {
  const publicClient = createPublicClient();
  const { data, error } = await publicClient.rpc("get_published_gallery_posts");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as GalleryPostRow[];
  const imageUrl = await mediaUrls(rows.map((row) => row.storage_path));
  return sortGalleryMoments(rows).map((moment) => ({
    ...moment,
    imageUrl: imageUrl(moment.storage_path),
  }));
}

async function canPost() {
  if (!(await getActiveSession())) return false;
  const client = await createRequestClient();
  return (await client.rpc("can_publish_student_gallery_post")).data === true;
}

export default async function GalleryPage() {
  const [moments, postingAllowed] = hasPublicSupabaseConfiguration()
    ? await Promise.all([
      coalesceCached(
        "public-gallery-posts",
        [PUBLIC_CACHE_TAGS.gallery],
        30,
        loadPublishedGalleryMoments,
      ).catch(() => []),
      canPost().catch(() => false),
    ]) : [[], false] as const;

  return <main className={styles.page}>
    <FestTopNav activePage="gallery" />
    <section className={styles.hero}>
      <p className={styles.eyebrow}>SPANDAN 4.0 · CAMPUS MOMENTS</p>
      <h1>The moments between <em>the moments.</em></h1>
      <p>Festival photos from around campus.</p>
    </section>
    <section className={styles.content} aria-labelledby="moments-title">
      {postingAllowed && <PostComposer />}
      <div className={styles.heading}><div><p className={styles.eyebrow}>LATEST FROM CAMPUS</p><h2 id="moments-title">Festival moments</h2></div><span>{moments.length} {moments.length === 1 ? "moment" : "moments"}</span></div>
      {moments.length ? <div className={styles.grid}>{moments.map(moment => <article className={styles.card} key={moment.id}>
        <div className={styles.photo}>
          {/* Public Storage URLs are already compressed and CDN-backed. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={moment.imageUrl} alt={moment.caption} loading="lazy" decoding="async" />
        </div>
        <div className={styles.copy}>
          {moment.event_slug && <Link href={`/events/${moment.event_slug}`}>{moment.event_title}</Link>}
          <p>{moment.caption}</p>
          <time dateTime={moment.occurred_at}>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(moment.occurred_at))} IST</time>
        </div>
      </article>)}</div> : <div className={styles.empty}>
        <Image src="/visuals/campus-moments.webp" width={1440} height={960} alt="Students taking part in sports and stage activities" sizes="(max-width: 720px) 90vw, 680px" />
        <div><h2>No posts yet</h2><p>Photos shared during the festival will appear here.</p><Link href="/events">Explore events →</Link></div>
      </div>}
    </section>
    <footer className={styles.footer}><span>ASMC Firozabad · SPANDAN 4.0</span><Link href="/feed">Open live feed →</Link></footer>
  </main>;
}
