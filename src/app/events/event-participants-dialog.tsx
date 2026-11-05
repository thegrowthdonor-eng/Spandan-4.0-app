"use client";

import { useRef } from "react";

type PublicParticipant = {
  profile_id: string;
  full_name: string;
  batch_label: string;
};

export function EventParticipantsDialog({
  eventTitle,
  participants,
}: {
  eventTitle: string;
  participants: PublicParticipant[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function closeDialog() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        className="event-participants-trigger"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`View selected participants for ${eventTitle}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>View participants</span>
        <strong>{participants.length}</strong>
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
              <p>{participants.length ? `${participants.length} selected ${participants.length === 1 ? "participant" : "participants"}` : "Selection is yet to be published"}</p>
            </div>
            <button type="button" onClick={closeDialog} aria-label="Close participant list">&times;</button>
          </header>

          {participants.length ? (
            <ol className="event-participants-list">
              {participants.map((participant, index) => (
                <li key={participant.profile_id}>
                  <span className="event-participant-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="event-participant-name">
                    <strong>{participant.full_name}</strong>
                    <small>{participant.batch_label}</small>
                  </span>
                  <span className="event-participant-status">Selected</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="event-participants-empty">
              <span aria-hidden="true">✦</span>
              <strong>Roster awaiting confirmation</strong>
              <p>Approved participants will appear here after the organiser publishes the final selection.</p>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
