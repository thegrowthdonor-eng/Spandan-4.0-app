import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
import { HelpStaffClient, HelpThreadStaff } from "./help-staff-client";
import "./help.css";

export const dynamic = "force-dynamic";

export default async function AdminHelpPage() {
  if (!hasPublicSupabaseConfiguration()) {
    return (
      <main className="help-page">
        <section className="help-empty">Help desk setup is not connected.</section>
      </main>
    );
  }

  const client = await createRequestClient();
  if (!(await client.auth.getUser()).data.user) redirect("/account");

  const { data, error } = await client.rpc("list_help_threads_for_staff");
  const threads = (data ?? []) as HelpThreadStaff[];

  return (
    <main className="help-page">
      <header className="help-header">
        <Link className="wordmark" href="/">
          Spandan <span>4.0</span>
        </Link>
        <div className="header-nav-links">
          <Link href="/admin">Organiser Hub</Link>
          <Link href="/admin/activation">Activation</Link>
          <Link href="/my-fest">My Fest</Link>
        </div>
      </header>

      <section className="help-intro">
        <p className="eyebrow">Support operations</p>
        <h1>Support desk</h1>
        <p>
          Assign, reply to, and resolve student support requests with a complete, audited thread record.
        </p>
      </section>

      {error ? (
        <p className="help-empty">Help threads are temporarily unavailable.</p>
      ) : (
        <HelpStaffClient threads={threads} />
      )}
    </main>
  );
}
