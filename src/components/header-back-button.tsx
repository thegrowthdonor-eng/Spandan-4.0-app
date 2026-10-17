"use client";

export function HeaderBackButton({ fallbackHref }: { fallbackHref: string }) {
  function goBack() {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign(fallbackHref);
  }

  return (
    <button type="button" className="fest-header-back" onClick={goBack} aria-label="Go back">
      <span aria-hidden="true">←</span>
      <span className="fest-header-back-label">Back</span>
    </button>
  );
}
