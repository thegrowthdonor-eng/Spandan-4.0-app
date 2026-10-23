"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./maintenance.module.css";

export default function MaintenancePage() {
  const [showBypass, setShowBypass] = useState(false);
  const [passkey, setPasskey] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleBypassSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!passkey.trim()) return;

    setIsVerifying(true);
    setError("");

    try {
      const res = await fetch("/api/maintenance/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passkey: passkey.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        // Successfully bypassed! Redirect to home
        window.location.href = "/home";
      } else {
        setError(data.message || "Invalid passkey. Access denied.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  }

  function handleRefresh() {
    window.location.reload();
  }

  return (
    <main className={styles.maintenanceContainer}>
      <header className={styles.header}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Image
            src="/spandan-logo.png"
            alt="SPANDAN 4.0 official logo"
            width={38}
            height={38}
            priority
          />
          <div>
            <strong style={{ fontSize: "14px", letterSpacing: "-0.02em" }}>SPANDAN 4.0</strong>
            <span style={{ display: "block", fontSize: "10px", color: "#6e7771", fontFamily: "monospace" }}>
              ASMC FIROZABAD
            </span>
          </div>
        </div>

        <span style={{ fontSize: "11px", fontFamily: "monospace", color: "#8a948e" }}>
          EDITION 04
        </span>
      </header>

      <section className={styles.card} aria-labelledby="maintenance-heading">
        <div className={styles.badgeRow}>
          <span className={styles.pulsingDot} aria-hidden="true" />
          <span>Scheduled Platform Maintenance</span>
        </div>

        <h1 id="maintenance-heading" className={styles.title}>
          We&apos;re upgrading <span>Spandan 4.0</span>
        </h1>

        <p className={styles.subtitle}>
          The official festival portal is temporarily offline for scheduled system enhancements, fixture synchronization,
          and performance optimizations. All batch registrations and records are securely preserved.
        </p>

        <div className={styles.featuresGrid}>
          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>⚡</span>
            <div className={styles.featureText}>
              <strong>Real-Time Match &amp; Fixture Engine</strong>
              <span>Optimizing live score sync and ground refereeing tools for festival fixtures.</span>
            </div>
          </div>

          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>🛡️</span>
            <div className={styles.featureText}>
              <strong>Security &amp; Database Hardening</strong>
              <span>Applying institutional database upgrades and high-concurrency safeguards.</span>
            </div>
          </div>

          <div className={styles.featureItem}>
            <span className={styles.featureIcon}>🎯</span>
            <div className={styles.featureText}>
              <strong>Event Roster &amp; Application Verification</strong>
              <span>Reconciling batch squad submissions and offline treasury reference ledgers.</span>
            </div>
          </div>
        </div>

        <div className={styles.actionRow}>
          <button type="button" onClick={handleRefresh} className={styles.refreshBtn}>
            <span>Check Status / Reload</span>
            <span aria-hidden="true">↻</span>
          </button>

          <button
            type="button"
            onClick={() => setShowBypass((prev) => !prev)}
            className={styles.bypassToggleBtn}
          >
            {showBypass ? "Hide Staff Access" : "Staff & Organiser Access"}
          </button>
        </div>

        {showBypass && (
          <div className={styles.bypassBox}>
            <h4>Developer &amp; Organiser Bypass</h4>
            <p>Enter the authorised council passkey to bypass maintenance mode on this device.</p>
            <form onSubmit={handleBypassSubmit} className={styles.bypassForm}>
              <input
                type="password"
                placeholder="Enter passkey (e.g. spandan2026)"
                value={passkey}
                onChange={(e) => setPasskey(e.target.value)}
                className={styles.passkeyInput}
                autoFocus
                required
              />
              <button
                type="submit"
                disabled={isVerifying}
                className={styles.passkeySubmitBtn}
              >
                {isVerifying ? "Verifying…" : "Unlock App →"}
              </button>
            </form>
            {error && <p className={styles.bypassError}>{error}</p>}
          </div>
        )}

        <div className={styles.councilNote}>
          <strong>Ground Desk Operations:</strong> Physical registration receipts, treasury verification, and event
          queries remain active in person at the Student Council Room (Ground Floor, ASMC Campus).
        </div>
      </section>

      <footer className={styles.footer}>
        <span>Atal Bihari Vajpayee Government Medical College (ASMC), Firozabad</span>
        <Link href="/admin" className={styles.adminLink}>
          Organiser Portal ↗
        </Link>
      </footer>
    </main>
  );
}
