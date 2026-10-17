"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function NavIcon({ path }: { path: string }) {
  return (
    <span className="bnav-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </span>
  );
}

export function BottomNav() {
  const pathname = usePathname() || "";

  // Hide on auth and admin routes to give clean focused space
  if (
    pathname === "/" ||
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/setup")
  ) {
    return null;
  }

  const isHome = pathname === "/home";
  const isEvents = pathname.startsWith("/events") || pathname.startsWith("/explore");
  const isSchedule = pathname.startsWith("/schedule");
  const isMyFest = pathname.startsWith("/my-fest");

  const homeHref = "/home";

  return (
    <nav className="mobile-bottom-nav" aria-label="Quick mobile navigation">
      <Link href={homeHref} className={`bnav-item ${isHome ? "active" : ""}`} aria-current={isHome ? "page" : undefined}>
        <NavIcon path="m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9" />
        <span className="bnav-label">Home</span>
      </Link>

      <Link href="/schedule" className={`bnav-item ${isSchedule ? "active" : ""}`} aria-current={isSchedule ? "page" : undefined}>
        <NavIcon path="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
        <span className="bnav-label">Schedule</span>
      </Link>

      <Link href="/events" className={`bnav-item ${isEvents ? "active" : ""}`} aria-current={isEvents ? "page" : undefined}>
        <NavIcon path="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
        <span className="bnav-label">Events</span>
      </Link>

      <Link href="/my-fest" className={`bnav-item ${isMyFest ? "active" : ""}`} aria-current={isMyFest ? "page" : undefined}>
        <NavIcon path="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4V6Zm12 0v2m0 3v2m0 3v2" />
        <span className="bnav-label">My Fest</span>
      </Link>
    </nav>
  );
}
