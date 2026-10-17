export default function EventDetailLoading() {
  return (
    <main className="event-detail" aria-busy="true" aria-live="polite">
      <section className="event-detail-hero">
        <p className="eyebrow">Loading event</p>
        <h1>Getting the official details…</h1>
        <p className="event-summary">Please wait while the event rules, timing and application status are loaded.</p>
      </section>
    </main>
  );
}
