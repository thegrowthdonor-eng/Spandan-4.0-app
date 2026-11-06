import type { PublishedEventResult, Standing } from "./results";

export type FeedNotice = { id: string; title: string; body: string; urgency: "normal" | "important" | "urgent"; publish_at: string; event_title: string | null };
export type FeedMoment = { id: string; event_title: string; event_slug: string; storage_path: string; caption: string; occurred_at: string; imageUrl: string };
export type FestivalFeedPost =
  | { id: string; kind: "result"; at: string; result: PublishedEventResult }
  | { id: string; kind: "standings"; at: string; standings: Standing[] }
  | { id: string; kind: "moment"; at: string; moment: FeedMoment }
  | { id: string; kind: "notice"; at: string; notice: FeedNotice };

function newestById<T extends { id: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function latestResults(results: PublishedEventResult[]) {
  const byEvent = new Map<string, PublishedEventResult>();
  for (const result of results) {
    const current = byEvent.get(result.event_id);
    if (!current || new Date(result.published_at ?? 0).valueOf() > new Date(current.published_at ?? 0).valueOf()) byEvent.set(result.event_id, result);
  }
  return [...byEvent.values()];
}

export function buildFestivalFeed({ results, standings, moments, notices }: { results: PublishedEventResult[]; standings: Standing[]; moments: FeedMoment[]; notices: FeedNotice[] }): FestivalFeedPost[] {
  const currentResults = latestResults(results);
  const latestResultTime = currentResults.reduce<string | null>((latest, result) => !latest || new Date(result.published_at ?? 0).valueOf() > new Date(latest).valueOf() ? result.published_at : latest, null);
  const posts: FestivalFeedPost[] = [
    ...currentResults.filter((result): result is PublishedEventResult & { published_at: string } => Boolean(result.published_at)).map((result) => ({ id: `result-${result.event_id}`, kind: "result" as const, at: result.published_at, result })),
    ...newestById(moments).map((moment) => ({ id: `moment-${moment.id}`, kind: "moment" as const, at: moment.occurred_at, moment })),
    ...newestById(notices).map((notice) => ({ id: `notice-${notice.id}`, kind: "notice" as const, at: notice.publish_at, notice })),
  ];
  if (standings.length && latestResultTime) posts.push({ id: "standings-current", kind: "standings", at: latestResultTime, standings: [...standings] });
  return posts.sort((a, b) => new Date(b.at).valueOf() - new Date(a.at).valueOf() || a.id.localeCompare(b.id));
}

export function feedDownloadFilename(type: FestivalFeedPost["kind"], id: string) {
  return `spandan-${type}-${id.replace(/[^a-z0-9-]/gi, "").slice(0, 80) || "post"}.${type === "moment" ? "webp" : "png"}`;
}
