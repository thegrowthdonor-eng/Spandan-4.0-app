import "server-only";
import { revalidateTag, unstable_cache } from "next/cache";

const inflight = new Map<string, Promise<unknown>>();

export const PUBLIC_CACHE_TAGS = {
  feed: "public-feed",
  gallery: "public-gallery",
  sponsors: "public-sponsors",
  merchandise: "public-merchandise",
  committee: "public-committee",
  eventDetail: "public-event-detail",
  home: "public-home",
  live: "public-live",
  notifications: "public-notifications",
  batches: "public-batches",
} as const;

export function invalidatePublicTags(...tags: string[]) {
  for (const tag of tags) {
    revalidateTag(tag, { expire: 0 });
  }
}

/** Coalesces concurrent callers in-process and shares cached results across instances. */
export async function coalesceCached<T>(
  key: string,
  tags: string[],
  revalidate: number,
  loader: () => Promise<T>,
): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const cached = unstable_cache(loader, [key], { revalidate, tags });
  const run = cached().finally(() => {
    if (inflight.get(key) === run) inflight.delete(key);
  });
  inflight.set(key, run);
  return run;
}
