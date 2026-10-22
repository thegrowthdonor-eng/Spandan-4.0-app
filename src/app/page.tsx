import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseConfiguration } from "@/server/env";
import { getActiveSession } from "@/server/auth/access";
import { SpandanLogo } from "@/components/spandan-branding";
import { AuthPortalClient } from "./account/auth-portal-client";
import homeStyles from "./homepage.module.css";
import "./account/account.css";

export const metadata = {
  title: "Spandan 4.0 — ASMC Firozabad Official Festival Gateway",
  description: "Official student gateway and authentication portal for Spandan 4.0, ASMC Firozabad.",
};

export const dynamic = "force-dynamic";

export default async function RootGatewayPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; mode?: string }>;
}) {
  // If user is already authenticated, redirect straight to the festival Home page
  let hasActiveSession = false;
  if (hasSupabaseConfiguration()) {
    try {
      hasActiveSession = Boolean(await getActiveSession());
    } catch {
      // Session lookup failed; keep the gateway usable.
    }
  }
  if (hasActiveSession) redirect("/home");

  const configured = hasSupabaseConfiguration();
  const { next, mode } = await searchParams;
  const returnTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/home";
  const initialView = mode === "signup" || mode === "register"
    ? "signup"
    : mode === "signin" || mode === "login"
    ? "signin"
    : "hub";

  return (
    <main className={homeStyles.page} style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      {/* Top Header matching Home page branding */}
      <header className={homeStyles.header}>
        <SpandanLogo variant="light" />
        <nav aria-label="Festival options">
          <Link href="/guest" className={homeStyles.headerCta}>
            Guest Preview →
          </Link>
        </nav>
      </header>

      {/* Main Container */}
      <div style={{ flex: 1, maxWidth: "1040px", width: "100%", margin: "0 auto", padding: "0 24px" }}>
        {/* Hero Section matching Home Page Typography */}
        <section style={{ textAlign: "center", padding: "40px 16px 28px" }}>
          <p className={homeStyles.eyebrow} style={{ justifyContent: "center", marginBottom: "14px" }}>
            <span className={homeStyles.edition}>EDITION 04</span> ASMC Firozabad
          </p>
          <h1 style={{
            margin: "0 0 12px",
            display: "flex",
            alignItems: "baseline",
            justifyContent: "center",
            gap: "8px",
            font: "500 clamp(40px, 6vw, 58px)/1 'Playfair Display', Georgia, serif",
            letterSpacing: "-.04em",
            color: "#242b29"
          }}>
            SPANDAN<span style={{
              font: "500 clamp(16px, 2.2vw, 22px)/1 'DM Mono', monospace",
              color: "#a9533e",
              letterSpacing: "-.04em",
              position: "relative",
              top: "-12px"
            }}>4.0</span>
          </h1>
          <p style={{
            margin: "0 auto",
            font: "500 clamp(17px, 2.2vw, 22px)/1.35 'Playfair Display', Georgia, serif",
            letterSpacing: "-.03em",
            color: "#242b29",
            maxWidth: "460px"
          }}>
            Out of the ordinary. <em style={{ color: "#a9533e", fontStyle: "italic", fontWeight: 500 }}>Into the fest.</em>
          </p>
        </section>

        {/* 3-Option Gateway (Sign In / Create Profile / Enter as Guest) */}
        <section style={{ paddingBottom: "48px" }}>
          <AuthPortalClient
            configured={configured}
            returnTo={returnTo}
            initialView={initialView}
          />
        </section>
      </div>

      {/* Footer matching Home page palette */}
      <footer className={homeStyles.footer} style={{ maxWidth: "1040px", width: "100%", margin: "auto auto 0", padding: "24px 24px 32px" }}>
        <div className={homeStyles.footerBrand}>
          <strong>Spandan 4.0 · ASMC Firozabad</strong>
          <span className={homeStyles.footerDesk}>
            Official MBBS festival gateway &amp; student authentication
          </span>
        </div>
        <div className={homeStyles.footerActions}>
          <Link href="/admin">Organiser portal ↗</Link>
        </div>
      </footer>
    </main>
  );
}
