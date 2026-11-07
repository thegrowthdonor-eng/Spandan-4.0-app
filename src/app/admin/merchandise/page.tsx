import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { MerchandiseClient } from "./merchandise-client";
import styles from "../promotional.module.css";

export const dynamic = "force-dynamic";

export default async function AdminMerchandisePage() {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="portal-unavailable">
        <h1>Workspace unavailable</h1>
        <p>Supabase connection is not configured.</p>
      </main>
    );
  }

  const client = await createRequestClient();
  const { data: userRes } = await client.auth.getUser();
  if (!userRes.user) redirect("/account?next=/admin/merchandise");

  const { data: isAdmin } = await client.rpc("is_main_admin");
  if (isAdmin !== true) {
    redirect("/admin");
  }

  const admin = createAdminClient();
  const [{ data: items }, { data: editions }] = await Promise.all([
    admin.from("merchandise_items").select("*").order("created_at", { ascending: false }),
    admin.from("editions").select("id, name, status").neq("status", "archived").order("created_at", { ascending: false }),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="portal-eyebrow">Festival Store &amp; Desk</p>
          <h1>Official Merchandise Management</h1>
          <p>
            Publish approved festival jerseys, hoodies, badges, and wristbands. Students view photos,
            sizes, and pickup instructions on the public festival hub.
          </p>
        </div>
        <Link href="/merchandise" target="_blank" className="portal-secondary">
          View Public Store ↗
        </Link>
      </header>

      <MerchandiseClient
        initialItems={items ?? []}
        editions={(editions ?? []).map((e) => ({ id: e.id, name: e.name }))}
      />
    </div>
  );
}

