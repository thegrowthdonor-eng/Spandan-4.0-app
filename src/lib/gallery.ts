export const galleryMomentIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const maxGalleryImageBytes = 600 * 1024;

export type GalleryMomentDetails = {
  eventId: string;
  caption: string;
  occurredAt: string;
};

export type GalleryMomentRow = {
  id: string;
  event_id: string;
  event_title: string;
  event_slug?: string;
  caption: string;
  storage_path: string;
  occurred_at: string;
};

export function validateGalleryMomentDetails(input: GalleryMomentDetails) {
  const caption = input.caption.trim();
  const occurredAt = new Date(input.occurredAt);
  if (!galleryMomentIdPattern.test(input.eventId) || caption.length < 1 || caption.length > 1000 || Number.isNaN(occurredAt.valueOf())) {
    return null;
  }
  return { eventId: input.eventId, caption, occurredAt: occurredAt.toISOString() };
}

export function isWebpUpload(bytes: Uint8Array, mimeType: string, size: number) {
  return mimeType === "image/webp"
    && size > 0
    && size <= maxGalleryImageBytes
    && bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

export function sortGalleryMoments<T extends Pick<GalleryMomentRow, "occurred_at" | "id">>(moments: T[]) {
  return [...moments].sort((a, b) => {
    const byTime = new Date(b.occurred_at).valueOf() - new Date(a.occurred_at).valueOf();
    return byTime || a.id.localeCompare(b.id);
  });
}
