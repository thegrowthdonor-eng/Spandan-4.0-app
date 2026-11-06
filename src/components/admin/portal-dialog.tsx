"use client";

import { useEffect, useRef } from "react";

export function PortalDialog({ labelledBy, onClose, busy = false, children }: {
  labelledBy: string; onClose: () => void; busy?: boolean; children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    return () => { node?.close(); };
  }, []);
  return <dialog ref={dialog} className="portal-dialog" aria-labelledby={labelledBy}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    {children}
  </dialog>;
}
