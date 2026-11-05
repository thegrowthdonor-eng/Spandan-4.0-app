import { Suspense } from "react";
import Link from "next/link";
import { OfflineScorer } from "./scorer-client";
import styles from "./scorer.module.css";

export const metadata = { title: "Offline Scorer | SPANDAN 4.0", description: "Offline-first scoring console for authorised Spandan event coordinators." };

export default function ScorerPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/admin/fixtures" className={styles.brand}>SPANDAN <span>4.0</span></Link>
        <Link href="/live">Public Live Ground →</Link>
      </header>
      <Suspense fallback={<p className={styles.loading}>Opening device scorer…</p>}>
        <OfflineScorer />
      </Suspense>
    </main>
  );
}
