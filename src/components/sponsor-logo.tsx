"use client";

import { useState } from "react";
import { sponsorWebsite } from "@/lib/sponsors";
import styles from "./sponsors.module.css";

export function SponsorLogo({ src, alt, name }: { src: string; alt: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const url = sponsorWebsite(src);
  return <span className={styles.logo}>
    {url && !failed ? (
      // External committee-approved logos have reserved dimensions and a readable fallback.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={alt || name} width={112} height={34} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    ) : <span className={styles.fallback}>{name}</span>}
  </span>;
}
