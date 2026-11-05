import Link from "next/link";
import { redirect } from "next/navigation";
import { createRequestClient } from "@/server/supabase/server";
import { LiveDesk, type ProgrammeEntry } from "./live-desk";
import styles from "./live-desk.module.css";

export const dynamic="force-dynamic";
export default async function AdminLivePage(){const client=await createRequestClient();if(!(await client.auth.getUser()).data.user)redirect("/account?next=/admin/live");const allowed=await client.rpc("can_manage_live_desk");if(allowed.data!==true)return <main className={styles.page}><section className={styles.empty}><h1>Central Live Desk</h1><p>This workspace is limited to main administrators and event coordinators.</p><Link href="/admin">Return to organiser hub</Link></section></main>;const[result,diagnostics]=await Promise.all([client.rpc("list_programme_live_desk"),client.rpc("live_ground_diagnostics")]);return <main className={styles.page}><header className={styles.top}><Link href="/admin">← Organiser Hub</Link><Link href="/live">Public Live Ground ↗</Link></header><section className={styles.hero}><p>Ground &amp; stage operations</p><h1>Central Live Desk</h1><span>Set exact calls before the fest, then start and finish programme items explicitly. Nothing becomes live from the clock alone.</span></section>{result.error?<p>Programme desk is temporarily unavailable.</p>:<LiveDesk entries={(result.data??[]) as ProgrammeEntry[]} diagnostics={(diagnostics.data??{}) as Record<string,number>}/>}</main>}
