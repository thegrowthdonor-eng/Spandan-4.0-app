import assert from "node:assert/strict";
import test from "node:test";
import { isWebpUpload, maxGalleryImageBytes, sortGalleryMoments, validateGalleryMomentDetails } from "./gallery";

test("gallery details are trimmed and normalized", () => {
  assert.deepEqual(validateGalleryMomentDetails({
    eventId: "11111111-1111-4111-8111-111111111111",
    caption: "  A candid finish-line moment.  ",
    occurredAt: "2026-12-02T11:00:00+05:30",
  }), {
    eventId: "11111111-1111-4111-8111-111111111111",
    caption: "A candid finish-line moment.",
    occurredAt: "2026-12-02T05:30:00.000Z",
  });
  assert.equal(validateGalleryMomentDetails({ eventId: "bad", caption: "", occurredAt: "today" }), null);
});

test("gallery moments sort newest first with a stable id tie-break", () => {
  const rows = [
    { id: "b", occurred_at: "2026-12-02T10:00:00Z" },
    { id: "c", occurred_at: "2026-12-03T10:00:00Z" },
    { id: "a", occurred_at: "2026-12-02T10:00:00Z" },
  ];
  assert.deepEqual(sortGalleryMoments(rows).map((row) => row.id), ["c", "a", "b"]);
});

test("gallery upload accepts only a real WebP within the size limit", () => {
  const webp = new TextEncoder().encode("RIFF0000WEBP");
  assert.equal(isWebpUpload(webp, "image/webp", webp.length), true);
  assert.equal(isWebpUpload(webp, "image/jpeg", webp.length), false);
  assert.equal(isWebpUpload(webp, "image/webp", maxGalleryImageBytes + 1), false);
  assert.equal(isWebpUpload(new TextEncoder().encode("not an image"), "image/webp", 12), false);
});
