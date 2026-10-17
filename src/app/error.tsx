"use client";

import Link from "next/link";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className="app-error-page">
      <section>
        <p className="eyebrow">SPANDAN 4.0</p>
        <h1>We could not open this page.</h1>
        <p>Please check your connection and try again. Your account information has not been changed.</p>
        <div>
          <button type="button" onClick={reset}>Try again</button>
          <Link href="/">Go to start</Link>
        </div>
      </section>
    </main>
  );
}
