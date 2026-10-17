export type Sponsor = {
  id: string;
  name: string;
  tier: string;
  logo_url: string;
  logo_alt: string;
  description: string | null;
  website_url: string | null;
};

export function sponsorTier(tier: string): number {
  const value = tier.toLowerCase();
  if (/\btitle\b/.test(value)) return 0;
  if (/\bdiamond\b/.test(value)) return 1;
  if (/\b(associate|gold)\b/.test(value)) return 2;
  return 3;
}

export function groupSponsors(sponsors: Sponsor[]) {
  const labels = ["Title partners", "Diamond partners", "Associate & Gold partners", "Festival supporters"];
  return labels.map((label, rank) => ({
    label,
    items: sponsors.filter((sponsor) => sponsorTier(sponsor.tier) === rank),
  })).filter((group) => group.items.length > 0);
}

/** Never turn a stored promotional URL into an executable link. */
export function sponsorWebsite(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function sponsorAnchor(id: string): string {
  return "sponsor-" + encodeURIComponent(id);
}

/** Rotation is per browser tab/visit, never timed or an impression guarantee. */
export function nextSponsorIndex(current: number, count: number, step = 4): number {
  if (count <= 0) return 0;
  const safe = Number.isSafeInteger(current) && current >= 0 ? current % count : 0;
  return (safe + Math.min(step, count)) % count;
}
