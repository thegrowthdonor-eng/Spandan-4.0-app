import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { GalleryManager } from "./gallery-manager";
import styles from "./gallery-admin.module.css";
import { mediaUrls } from "@/server/media/urls";

export const dynamic = "force-dynamic";

type EventOption = { event_id: string; event_title: string; starts_at: string | null };
type ManageableMoment = { id: string; event_id: string; event_title: string; caption: string; storage_path: string; occurred_at: string; is_owner: boolean };

export default async function AdminGalleryPage() {
  if (!hasPublicSupabaseConfiguration()) return <main className={styles.page}><p>Gallery management is not connected.</p></main>;
  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");
  const [{ data: allowed }, eventResult, momentResult] = await Promise.all([
    client.rpc("can_manage_gallery_moments"),
    client.rpc("list_gallery_event_options"),
    client.rpc("list_manageable_gallery_moments"),
  ]);
  if (allowed !== true) return <main className={styles.page}><section className={styles.denied}><p className={styles.eyebrow}>Organiser workspace</p><h1>Gallery publishing is restricted.</h1><p>Only active 2023-batch Main Admins and Event Coordinators can publish festival moments.</p><Link href="/admin">Return to workspace →</Link></section></main>;

  const imageUrl=await mediaUrls(((momentResult.data ?? []) as ManageableMoment[]).map(row=>row.storage_path));
  const moments = ((momentResult.data ?? []) as ManageableMoment[]).map((moment) => ({
    ...moment,
    imageUrl: imageUrl(moment.storage_path),
  }));
  return <main className={styles.page}>
    <section className={styles.hero}>
      <div><p className={styles.eyebrow}>Official media squad</p><h1>Gallery moments</h1><p>Share one candid photo with its event, caption and actual moment time.</p></div>
      <Link href="/gallery">View public gallery ↗</Link>
    </section>
    <GalleryManager events={(eventResult.data ?? []) as EventOption[]} initialMoments={moments} />
  </main>;
}
