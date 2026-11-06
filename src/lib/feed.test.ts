import assert from "node:assert/strict";
import test from "node:test";
import { buildFestivalFeed, feedDownloadFilename, latestResults } from "./feed";
import type { PublishedEventResult } from "./results";

function result(eventId: string, publishedAt: string): PublishedEventResult {
  return { event_id: eventId, event_title: eventId, event_slug: eventId, category: "sport", published_at: publishedAt, podium_photo_url: null, podium_caption: null, positions: [] };
}

test("festival feed orders sources and keeps only the newest result for an event", () => {
  const posts = buildFestivalFeed({
    results: [result("football", "2026-12-02T10:00:00Z"), result("football", "2026-12-04T10:00:00Z"), result("badminton", "2026-12-03T10:00:00Z")],
    standings: [{ batch_id: "2023", label: "2023", course_label: "MBBS", points: 18 }],
    moments: [{ id: "moment-1", event_title: "Football", event_slug: "football", storage_path: "gallery/a/b.webp", caption: "A save", occurred_at: "2026-12-05T10:00:00Z", imageUrl: "https://example.test/photo.webp" }],
    notices: [{ id: "notice-1", title: "Venue update", body: "Main ground", urgency: "important", publish_at: "2026-12-04T12:00:00Z", event_title: null }],
  });
  assert.deepEqual(posts.map((post) => post.id), ["moment-moment-1", "notice-notice-1", "result-football", "standings-current", "result-badminton"]);
  assert.equal(posts.filter((post) => post.kind === "result").length, 2);
});

test("festival feed removes repeated gallery and notice source ids", () => {
  const posts = buildFestivalFeed({
    results: [], standings: [],
    moments: [
      { id: "moment-1", event_title: "One", event_slug: "one", storage_path: "gallery/a/one.webp", caption: "First", occurred_at: "2026-12-01T10:00:00Z", imageUrl: "one" },
      { id: "moment-1", event_title: "One", event_slug: "one", storage_path: "gallery/a/one.webp", caption: "Duplicate", occurred_at: "2026-12-01T10:00:00Z", imageUrl: "one" },
    ],
    notices: [
      { id: "notice-1", title: "One", body: "First", urgency: "normal", publish_at: "2026-12-01T09:00:00Z", event_title: null },
      { id: "notice-1", title: "One", body: "Duplicate", urgency: "normal", publish_at: "2026-12-01T09:00:00Z", event_title: null },
    ],
  });
  assert.deepEqual(posts.map((post) => post.id), ["moment-moment-1", "notice-notice-1"]);
});

test("feed download names are safe and use the expected extension", () => {
  assert.equal(feedDownloadFilename("moment", "abc-123"), "spandan-moment-abc-123.webp");
  assert.equal(feedDownloadFilename("notice", "abc/123"), "spandan-notice-abc123.png");
});

test("latestResults retains the newer corrected event result", () => {
  assert.deepEqual(latestResults([result("football", "2026-12-01T10:00:00Z"), result("football", "2026-12-02T10:00:00Z")]).map((item) => item.published_at), ["2026-12-02T10:00:00Z"]);
});
