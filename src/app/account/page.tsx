import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseConfiguration } from "@/server/env";
import { getActiveSession } from "@/server/auth/access";
import { SpandanLogo } from "@/components/spandan-branding";
import { AuthPortalClient } from "./auth-portal-client";
import "./account.css";

export const metadata = {
  title: "Account Access — Spandan 4.0 | ASMC Firozabad",
  description: "Sign in or register your official student profile for Spandan 4.0 festival access.",
};

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  // If user is already authenticated, redirect to their student dashboard
  let hasActiveSession = false;
  if (hasSupabaseConfiguration()) {
    try {
      hasActiveSession = Boolean(await getActiveSession());
    } catch {
      // Session lookup failed; keep the sign-in form usable.
    }
  }
  if (hasActiveSession) redirect("/home");

  const configured = hasSupabaseConfiguration();
  const { next, mode } = await searchParams;
  const returnTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  const initialView = mode === "signup" || mode === "register" ? "signup" : "signin";

  return (
    <main className="account-page">
      {/* Top Header */}
      <header className="account-header">
        <SpandanLogo size="medium" variant="light" />
        <Link href="/" className="header-back-link">
          ← Festival Options
        </Link>
      </header>

      {/* Main Container: Direct Focused Sign In / Sign Up Form */}
      <section className="account-content" style={{ paddingTop: "28px" }}>
        <AuthPortalClient
          configured={configured}
          returnTo={returnTo}
          initialView={initialView}
        />
      </section>

      {/* Minimal Footer */}
      <footer className="account-footer">
        <span>ASMC Firozabad · SPANDAN 4.0</span>
        <div className="footer-links">
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/guest">Guest Hub</Link>
        </div>
      </footer>
    </main>
  );
}
