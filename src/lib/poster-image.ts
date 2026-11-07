export const maxPosterBytes = 500 * 1024;
export function validPosterUpload(bytes: Uint8Array, mime: string, size: number) {
  return mime === "image/webp" && size > 12 && size <= maxPosterBytes && bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
}
