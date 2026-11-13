"use client";

import { useState } from "react";
import Image from "next/image";
import styles from "./my-fest.module.css";

export type StudentPassProps = {
  fullName: string;
  festId: string;
  rollCanonical: string | null;
  batchLabel: string;
  courseLabel: string;
  department?: string | null;
  participantCategory?: string | null;
  phoneE164?: string | null;
  accessStatus: "active" | "pending" | "rejected" | "suspended";
  ledgerReference?: string | null;
};

// Deterministic mini SVG QR pattern generator based on fest ID string
function generateMatrix(seed: string): boolean[][] {
  const size = 17;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Corner finder markers (7x7)
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[startY + r][startX + c] = true;
        }
      }
    }
  };

  drawFinder(0, 0); // Top Left
  drawFinder(size - 7, 0); // Top Right
  drawFinder(0, size - 7); // Bottom Left

  // Deterministic interior hash pattern
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder zones
      if (
        (r < 8 && c < 8) ||
        (r < 8 && c >= size - 8) ||
        (r >= size - 8 && c < 8)
      ) {
        continue;
      }
      const bit = Math.abs((hash ^ (r * 31 + c * 17)) % 100) > 42;
      matrix[r][c] = bit;
    }
  }

  return matrix;
}

export function StudentPass({
  fullName,
  festId,
  rollCanonical,
  batchLabel,
  courseLabel,
  department,
  participantCategory = "ug",
  phoneE164,
  accessStatus,
  ledgerReference,
}: StudentPassProps) {
  const [copied, setCopied] = useState(false);

  const isSenior = participantCategory !== "ug";
  const displayCohort = isSenior
    ? `${participantCategory?.toUpperCase() || "FACULTY"} · ${department || "Department"}`
    : `${courseLabel} · ${batchLabel}`;

  const initials = (fullName || "Student")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "SP";

  const isVerified = accessStatus === "active";
  const matrix = generateMatrix(festId);

  async function copyFestId() {
    try {
      await navigator.clipboard.writeText(festId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  return (
    <div className={styles.passContainer}>
      <article className={styles.passCard} aria-label="Official Student Festival Pass">
        {/* Pass Top Banner */}
        <header className={styles.passHeader}>
          <div className={styles.passCrest}>
            <Image
              src="/spandan-logo.png"
              alt="Spandan 4.0 Emblem"
              width={40}
              height={40}
              className={styles.passEmblem}
              priority
            />
            <div className={styles.passOrg}>
              <span className={styles.passCollege}>ASMC FIROZABAD</span>
              <span className={styles.passTitle}>SPANDAN 4.0 · OFFICIAL PASS</span>
            </div>
          </div>

          <span className={styles.passChipBadge}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
              <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
            </svg>
            DELEGATE
          </span>
        </header>

        {/* Identity Section */}
        <div className={styles.passBody}>
          <div className={styles.monogramAvatar} aria-hidden="true">
            <span className={styles.monogramInitials}>{initials}</span>
            <span className={styles.verifiedBadge} title={isSenior ? "Festival account" : "Verified Festival Student"}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.2 5.6l-4 4.5a.75.75 0 01-1.1 0l-2-2.2a.75.75 0 011.1-1l1.45 1.6 3.45-3.9a.75.75 0 111.1 1z" />
              </svg>
            </span>
          </div>

          <div className={styles.studentDetails}>
            <h2 className={styles.studentName}>{fullName}</h2>
            <span className={styles.categoryTag}>{displayCohort}</span>

            {/* Tap to copy Fest ID */}
            <div className={styles.festIdWrap}>
              <button
                type="button"
                className={styles.festIdPill}
                onClick={copyFestId}
                title="Tap to copy Official Fest ID"
              >
                <span className={styles.festIdLabel}>FEST ID</span>
                <span className={styles.festIdValue}>{festId}</span>
                <svg
                  className={styles.copyIcon}
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>

              {copied && <span className={styles.copiedToast}>Copied!</span>}
            </div>
          </div>
        </div>

        {/* Credentials Grid */}
        <div className={styles.credentialsGrid}>
          <div className={styles.credentialItem}>
            <span className={styles.credentialLabel}>
              {isSenior ? "CATEGORY" : "ROLL NUMBER"}
            </span>
            <span className={styles.credentialVal}>
              {isSenior ? participantCategory?.toUpperCase() : rollCanonical || "—"}
            </span>
          </div>

          <div className={styles.credentialItem}>
            <span className={styles.credentialLabel}>
              {isSenior ? "DEPARTMENT" : "BATCH"}
            </span>
            <span className={styles.credentialVal}>
              {isSenior ? department || "Medical" : `${courseLabel} ${batchLabel}`}
            </span>
          </div>

          <div className={styles.credentialItem}>
            <span className={styles.credentialLabel}>MOBILE</span>
            <span className={styles.credentialVal}>{phoneE164 || "Registered"}</span>
          </div>
        </div>

        {/* Counter Verification Status */}
        <div
          className={`${styles.verificationBanner} ${
            isVerified
              ? styles.verificationBannerVerified
              : styles.verificationBannerPending
          }`}
        >
          <span className={styles.statusDot} aria-hidden="true" />
          <span>
            {isSenior ? <><strong>{isVerified ? "Access active:" : "Access restricted:"}</strong> {isVerified ? "Your festival account is active." : "Contact the festival team for account help."}</> : isVerified ? (
              <>
                <strong>Counter Verified:</strong> Official festival credential active.
                {ledgerReference && ` (Ref: ${ledgerReference})`}
              </>
            ) : (
              <>
                <strong>Verification Pending:</strong> Please present your College ID
                at the Help Desk to activate counter clearance.
              </>
            )}
          </span>
        </div>

        {/* Security QR Seal Strip */}
        <footer className={styles.passFooter}>
          <div className={styles.qrBox} aria-label={`QR Code for ${festId}`}>
            <svg viewBox="0 0 17 17" width="44" height="44" shapeRendering="crispEdges">
              {matrix.map((row, r) =>
                row.map((cell, c) =>
                  cell ? (
                    <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="#131b17" />
                  ) : null
                )
              )}
            </svg>
          </div>

          <div className={styles.securityNote}>
            <span>SECURE DIGITAL CREDENTIAL</span>
            <br />
            <span>SPANDAN 4.0 · ASMC FIROZABAD</span>
          </div>
        </footer>
      </article>
    </div>
  );
}

