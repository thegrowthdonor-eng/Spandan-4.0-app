import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { SponsorsClient } from "./sponsors-client";
import styles from "../promotional.module.css";

export const dynamic = "force-dynamic";

export default async function AdminSponsorsPage() {
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
  if (!userRes.user) redirect("/account?next=/admin/sponsors");

  const { data: isAdmin } = await client.rpc("is_main_admin");
  if (isAdmin !== true) {
    redirect("/admin");
  }

  const admin = createAdminClient();
  const [{ data: sponsors }, { data: editions }] = await Promise.all([
    admin
      .from("sponsors")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    admin
      .from("editions")
      .select("id, name, status")
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <p className="portal-eyebrow">Festival Patrons &amp; Partners</p>
          <h1>Festival Sponsors &amp; Partners</h1>
          <p>
            Manage institutional patrons, corporate sponsors, medical brands, and festival supporters.
            Published partners automatically appear on the public sponsors directory and in rotating partner banners.
          </p>
        </div>
        <Link href="/sponsors" target="_blank" className="portal-secondary">
          View Public Directory ↗
        </Link>
      </header>

      <SponsorsClient
        initialSponsors={sponsors ?? []}
        editions={(editions ?? []).map((e) => ({ id: e.id, name: e.name }))}
      />
    </div>
  );
}

