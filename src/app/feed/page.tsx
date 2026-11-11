import { FeedClient } from "@/app/schedule/feed-client";
import styles from "@/app/schedule/feed.module.css";
import { FestTopNav } from "@/components/spandan-branding";
import { buildFestivalFeed, type FeedMoment, type FeedNotice } from "@/lib/feed";
import { getPublishedResults } from "@/lib/published-results";
import type { Standing } from "@/lib/results";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createPublicClient } from "@/server/supabase/public";
import { mediaUrls } from "@/server/media/urls";
import "../public-info.css";

export const dynamic = "force-dynamic";

type GalleryRow = Omit<FeedMoment, "imageUrl">;
type NoticeRow = Omit<FeedNotice, "event_title"> & { events: { title: string }[] | null };

export default async function FeedPage() {
  let posts = [] as ReturnType<typeof buildFestivalFeed>;
  if (hasPublicSupabaseConfiguration()) {
    try {
      const client = createPublicClient();
      const [results, standingsResponse, momentsResponse, noticesResponse] = await Promise.all([
        getPublishedResults(client),
        client.from("published_batch_standing_board").select("batch_id,label,course_label,points").order("points", { ascending: false }).order("label"),
        client.rpc("get_published_gallery_moments"),
        client.from("notices").select("id,title,body,urgency,publish_at,events(title)").order("publish_at", { ascending: false }),
      ]);
      const imageUrl = await mediaUrls(((momentsResponse.data ?? []) as GalleryRow[]).map(row=>row.storage_path));
      const moments = ((momentsResponse.data ?? []) as GalleryRow[]).map((moment) => ({
        ...moment,
        imageUrl: imageUrl(moment.storage_path),
      }));
      const notices = ((noticesResponse.data ?? []) as NoticeRow[]).map(({ events, ...notice }) => ({ ...notice, event_title: events?.[0]?.title ?? null }));
      posts = buildFestivalFeed({ results, standings: (standingsResponse.data ?? []) as Standing[], moments, notices });
    } catch { /* The public feed remains empty until official content is available. */ }
  }

  return <main className={styles.page}><FestTopNav /><div className={styles.shell}>
    <section className={styles.intro} aria-labelledby="feed-title">
      <div><p className={styles.eyebrow}>SPANDAN 4.0 / ASMC FIROZABAD</p><h1 id="feed-title">Your campus. <span>Your feed.</span></h1><p>Results, official notices and moments from the festival.</p></div>
      <span className={styles.introMark} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M3 16l5-5 5 5 2-2 4 4M18 2l1.2 3.8L23 7l-3.8 1.2L18 12l-1.2-3.8L13 7l3.8-1.2L18 2Z" /></svg></span>
    </section><FeedClient posts={posts} /></div></main>;
}
