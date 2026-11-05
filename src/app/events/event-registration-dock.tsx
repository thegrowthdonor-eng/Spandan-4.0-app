"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import Link from "next/link";

export function EventRegistrationDock({
  eventTitle,
  status,
  label,
  href,
  tone,
  questionCount,
  children,
}: {
  eventTitle: string;
  status: string;
  label: string;
  href: string | null;
  tone: string;
  questionCount: number;
  children?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const opensRegistration = href === "#event-registration" && Boolean(children);

  function openRegistration() {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeRegistration() {
    dialogRef.current?.close();
  }

  const dockContent = (
    <>
      <span className="event-registration-dock-copy">
        <span>Registration</span>
        <strong>{status}</strong>
      </span>
      <span className="event-registration-dock-button">
        {label}<span aria-hidden="true">&rarr;</span>
      </span>
    </>
  );
  const dockClassName = `event-registration-dock dock-${tone}`;
  const actionLabel = `Registration: ${status}. ${label}`;

  return (
    <>
      {opensRegistration ? (
        <button className={dockClassName} type="button" onClick={openRegistration} aria-label={actionLabel}>
          {dockContent}
        </button>
      ) : href?.startsWith("#") ? (
        <a className={dockClassName} href={href} aria-label={actionLabel}>{dockContent}</a>
      ) : href ? (
        <Link className={dockClassName} href={href} aria-label={actionLabel}>{dockContent}</Link>
      ) : (
        <aside className={`${dockClassName} dock-disabled`} aria-label={actionLabel}>
          <span className="event-registration-dock-copy">
            <span>Registration</span>
            <strong>{status}</strong>
          </span>
          <span className="event-registration-dock-button is-disabled">{label}</span>
        </aside>
      )}

      {opensRegistration && (
        <dialog
          ref={dialogRef}
          className="event-registration-dialog"
          aria-labelledby="event-registration-dialog-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeRegistration();
          }}
        >
          <div className="event-registration-sheet">
            <header className="event-registration-sheet-header">
              <div>
                <span className="event-registration-sheet-eyebrow">Event registration</span>
                <h2 id="event-registration-dialog-title">{eventTitle}</h2>
                <p>
                  {questionCount > 0
                    ? `${questionCount} ${questionCount === 1 ? "question" : "questions"} before submission`
                    : "Review and confirm your entry"}
                </p>
              </div>
              <button type="button" className="event-registration-sheet-close" onClick={closeRegistration} aria-label="Close registration form">
                &times;
              </button>
            </header>
            <div className="event-registration-sheet-body">{children}</div>
          </div>
        </dialog>
      )}
    </>
  );
}
