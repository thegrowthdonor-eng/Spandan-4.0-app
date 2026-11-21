"use client";

import { useRef } from "react";
import Link from "next/link";

export type PublicParticipant = {
  fullName: string;
  confirmed: boolean;
  batchLabel: string | null;
};

export function EventParticipantsDialog({
  eventTitle,
  participants,
  approvedRegistrationsHref,
}: {
  eventTitle: string;
  participants: PublicParticipant[] | null;
  approvedRegistrationsHref?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const count = participants?.length;

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className="event-participants-trigger"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`View participants for ${eventTitle}${count === undefined ? "" : `, ${count} approved`}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>Participants</span>
        {count !== undefined && <strong>{count}</strong>}
      </button>

      <dialog
        ref={dialogRef}
        className="event-participants-dialog"
        aria-labelledby="event-participants-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeDialog();
        }}
      >
        <div className="event-participants-sheet">
          <header>
            <div>
              <span className="event-participants-eyebrow">Official participant list</span>
              <h2 id="event-participants-title">{eventTitle}</h2>
              <p>{count === undefined ? "Unable to load participants" : count ? `${count} approved ${count === 1 ? "participant" : "participants"}` : "No approved participants yet"}</p>
            </div>
            <button type="button" onClick={closeDialog} aria-label="Close participant list">&times;</button>
          </header>

          {participants && participants.length > 0 && (
            <ol className="event-participants-list">
              {participants.map((participant, index) => (
                <li key={`${participant.fullName}:${index}`}>
                  <span className="event-participant-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="event-participant-name">
                    <strong>{participant.fullName}</strong>
                    {participant.batchLabel && <small>{participant.batchLabel}</small>}
                  </span>
                  <span className={`event-participant-status${participant.confirmed ? "" : " event-participant-status-approved"}`}>
                    {participant.confirmed ? "Confirmed on roster" : "Approved"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {approvedRegistrationsHref && <div className="event-participants-actions"><Link href={approvedRegistrationsHref}>View approved registrations</Link></div>}
        </div>
      </dialog>
    </>
  );
}
