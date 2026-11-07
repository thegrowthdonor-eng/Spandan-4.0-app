import { compressImageFile, type CompressionResult } from "./image-compressor";
import { maxPosterBytes } from "./poster-image";

export async function compressPosterFile(file: File) {
  let readable: CompressionResult | null = null;
  for (const [size, quality] of [[1600,.82],[1600,.76],[1600,.72],[1440,.76],[1280,.76]]) {
    const result = await compressImageFile(file, { maxWidth:size, maxHeight:size, quality, mimeType:"image/webp", alwaysReencode:true });
    if (result.file.type !== "image/webp") throw new Error("This browser cannot export WebP. Try a current Chrome, Edge or Safari browser.");
    if (result.compressedSize <= 300 * 1024) return result;
    if (!readable && result.compressedSize <= maxPosterBytes) readable = result;
  }
  if (readable) return readable;
  throw new Error("This poster is still above 500 KB at readable quality. Crop unnecessary borders or choose a simpler poster.");
}
