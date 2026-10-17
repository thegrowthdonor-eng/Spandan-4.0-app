"use client";

import Link from "next/link";
import { useEffect, useId, useRef } from "react";
import { nextSponsorIndex, sponsorAnchor, type Sponsor } from "@/lib/sponsors";
import { SponsorLogo } from "./sponsor-logo";
import styles from "./sponsors.module.css";

type StripSponsor = Pick<Sponsor, "id" | "name" | "tier" | "logo_url" | "logo_alt">;

export function SponsorStrip({ sponsors, variant = "partners", placement }: {
  sponsors: StripSponsor[];
  variant?: "title" | "partners" | "footer";
  placement: string;
}) {
  const rail = useRef<HTMLUListElement>(null);
  const rotated = useRef(false);
  const id = useId();

  useEffect(() => {
    if (rotated.current || variant === "title" || sponsors.length <= 4 || !rail.current) return;
    rotated.current = true;
    try {
      const key = "spandan-partners:" + placement;
      const stored = Number(sessionStorage.getItem(key) ?? "0");
      const index = Number.isSafeInteger(stored) && stored >= 0 ? stored % sponsors.length : 0;
      const element = rail.current.children[index] as HTMLElement | undefined;
      if (element) rail.current.scrollLeft = element.offsetLeft - (rail.current.children[0] as HTMLElement).offsetLeft;
      sessionStorage.setItem(key, String(nextSponsorIndex(index, sponsors.length)));
    } catch {
      // Storage may be disabled; the complete, manually scrollable list still works.
    }
  }, [placement, sponsors.length, variant]);

  if (!sponsors.length) return null;

  function move(direction: number) {
    const element = rail.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    const target = direction > 0 && element.scrollLeft >= max - 2 ? 0
      : direction < 0 && element.scrollLeft <= 2 ? max
      : Math.max(0, Math.min(max, element.scrollLeft + direction * element.clientWidth));
    element.scrollTo({ left: target, behavior: "instant" });
  }

  const label = variant === "title" ? "Presented by" : variant === "footer" ? "Supported by" : "Sponsors & Partners";
  return (
    <section className={styles.strip} data-variant={variant} aria-label={label}>
      <div className={styles.heading}>
        <span className={styles.label}>{label}</span>
        <div className={styles.actions}>
          <Link href="/sponsors" className={styles.viewAll}>View all <span aria-hidden>↗</span></Link>
          {sponsors.length > 1 && <div className={styles.controls}>
            <button type="button" onClick={() => move(-1)} aria-controls={id} aria-label="Previous sponsors">‹</button>
            <button type="button" onClick={() => move(1)} aria-controls={id} aria-label="Next sponsors">›</button>
          </div>}
        </div>
      </div>
      <ul ref={rail} id={id} className={styles.rail} tabIndex={0} aria-label={label + " — swipe or use arrow controls"}>
        {sponsors.map((sponsor) => (
          <li key={sponsor.id}>
            <Link href={`/sponsors#${sponsorAnchor(sponsor.id)}`} className={styles.partner} aria-label={`About ${sponsor.name}, ${sponsor.tier}`}>
              <SponsorLogo src={sponsor.logo_url} alt={sponsor.logo_alt} name={sponsor.name} />
              <span className={styles.name}>{sponsor.name}</span>
              {variant === "partners" && <small className={styles.tier}>{sponsor.tier}</small>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
