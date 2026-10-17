import { getPublishedSponsors } from "@/server/sponsors";
import { groupSponsors } from "@/lib/sponsors";
import { SponsorStrip } from "./sponsor-strip";

/** Use below page content, in Suspense, so promotion cannot delay the task. */
export async function SponsorPlacement({ placement }: { placement: string }) {
  const sponsors = await getPublishedSponsors();
  return <SponsorStrip sponsors={groupSponsors(sponsors).flatMap((group) => group.items).map(({ id, name, tier, logo_url, logo_alt }) => ({ id, name, tier, logo_url, logo_alt }))} placement={placement} variant="footer" />;
}
