import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { ActivationClient, ActivationRecord } from "./activation-client";
import "./activation.css";

export const dynamic = "force-dynamic";

export default async function ActivationPage() {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="activation-page">
        <section className="admin-denied">
          <p className="eyebrow">Organiser workspace</p>
          <h1>Activation setup is not connected.</h1>
          <p>No student information is available until the protected service is configured.</p>
        </section>
      </main>
    );
  }

  const client = await createRequestClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/account");

  const { data: allowed } = await client.rpc("can_manage_access");
  if (allowed !== true) {
    return (
      <main className="activation-page">
        <section className="admin-denied">
          <p className="eyebrow">Organiser workspace</p>
          <h1>This area is restricted.</h1>
          <p>Only current treasurer or main-admin assignments can review activation records.</p>
          <Link href="/my-fest">Return to My Fest →</Link>
        </section>
      </main>
    );
  }

  const [{ data, error }, { data: isMainAdmin }] = await Promise.all([
    client.rpc("list_activation_queue"),
    client.rpc("is_main_admin"),
  ]);
  const queue = (data ?? []) as ActivationRecord[];

  return (
    <main className="activation-page">
      <header className="activation-header">
        <Link className="wordmark" href="/">
          Spandan <span>4.0</span>
        </Link>
        <div className="header-nav-links">
          <Link href="/admin">Organiser Hub</Link>
          <Link href="/admin/help">Help Desk</Link>
          <Link href="/my-fest">My Fest</Link>
        </div>
      </header>

      <section className="activation-intro">
        <p className="eyebrow">Treasury & Registration</p>
        <h1>Activation queue</h1>
        <p>
          Verify the authorized college roster and offline contribution record before activation. Ledger references
          are mandatory and audited. Account recovery tokens can be issued for students needing password resets.
        </p>
      </section>

      {error ? (
        <p className="admin-empty">The activation queue is temporarily unavailable. No records are shown.</p>
      ) : (
        <ActivationClient
          queue={queue}
          canRemoveProfiles={Boolean(allowed || isMainAdmin)}
          isViewerMainAdmin={Boolean(isMainAdmin)}
          currentUserId={auth.user.id}
        />
      )}
    </main>
  );
}
