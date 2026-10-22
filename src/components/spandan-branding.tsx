import Link from "next/link";
import Image from "next/image";
import { HeaderBackButton } from "./header-back-button";
import { FestivalNotificationBell } from "./festival-notification-bell";

export function SpandanLogo({
  variant = "dark",
  size = "medium",
}: {
  variant?: "light" | "dark";
  size?: "small" | "medium" | "large";
}) {
  return (
    <Link href="/" className="spandan-brand-link" aria-label="Spandan 4.0 - Home">
      <div className={`spandan-brand-container size-${size} theme-${variant}`}>
        <Image className="brand-official-logo" src="/spandan-logo.png" alt="SPANDAN 4.0 official logo" width={96} height={96} priority={size === "large"} />
        <div className="brand-typography">
          <div className="brand-title-row">
            <span className="brand-name">SPANDAN</span>
            <span className="brand-edition">4.0</span>
          </div>
          <span className="brand-sub">ASMC FIROZABAD</span>
        </div>
      </div>
    </Link>
  );
}

export function FestTopNav({
  activePage = "",
  showBack = false,
  backFallbackHref = "/home",
}: {
  activePage?: "events" | "schedule" | "standings" | "notices" | "merchandise" | "committee" | "gallery" | "faqs" | "sponsors" | "";
  showBack?: boolean;
  backFallbackHref?: string;
}) {
  return (
    <header className="fest-header">
      <div className="fest-header-branding">
        {showBack && <HeaderBackButton fallbackHref={backFallbackHref} />}
        <SpandanLogo size="medium" variant="light" />
      </div>

      <nav className="fest-nav" aria-label="Festival Navigation">
        <Link href="/events" className={activePage === "events" ? "nav-link active" : "nav-link"}>
          Events
        </Link>
        <Link href="/schedule" className={activePage === "schedule" ? "nav-link active" : "nav-link"}>
          Schedule
        </Link>
        <Link href="/standings" className={activePage === "standings" ? "nav-link active" : "nav-link"}>
          Results &amp; Standings
        </Link>
        <Link href="/notices" className={activePage === "notices" ? "nav-link active" : "nav-link"}>
          Notices
        </Link>
        <Link href="/merchandise" className={activePage === "merchandise" ? "nav-link active" : "nav-link"}>
          Merch
        </Link>
        <Link href="/gallery" className={activePage === "gallery" ? "nav-link active" : "nav-link"}>
          Gallery
        </Link>
        <Link href="/committee" className={activePage === "committee" ? "nav-link active" : "nav-link"}>
          Council
        </Link>
      </nav>

      <div className="fest-header-actions">
        <FestivalNotificationBell />
      </div>
    </header>
  );
}
