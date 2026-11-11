import sharp from "sharp";
import { createHash } from "node:crypto";

export const MAX_MEDIA_BYTES = 5 * 1024 * 1024;
export async function optimiseMedia(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new Error("Upload an image between 1 byte and 5 MB.");
  const image = sharp(bytes, { limitInputPixels: 24_000_000, animated: false, failOn: "warning" });
  const metadata = await image.metadata();
  const types: Record<string,string> = { jpeg:"image/jpeg",png:"image/png",webp:"image/webp" };
  if (!metadata.format || types[metadata.format] !== mime || !metadata.width || !metadata.height || (metadata.pages ?? 1) > 1 || metadata.width < 32 || metadata.height < 32 || metadata.width > 12000 || metadata.height > 12000) throw new Error("Upload a genuine non-animated JPEG, PNG or WebP image with valid dimensions.");
  // Re-encoding strips EXIF/GPS and prevents untrusted originals from being delivered publicly.
  const full = await image.rotate().resize({ width:1920,height:1920,fit:"inside",withoutEnlargement:true }).webp({quality:84}).toBuffer({resolveWithObject:true});
  const thumb = await sharp(full.data).resize({width:640,height:640,fit:"inside",withoutEnlargement:true}).webp({quality:78}).toBuffer();
  return { full:full.data,thumb,width:full.info.width,height:full.info.height,sha256:createHash("sha256").update(full.data).digest("hex") };
}
