/**
 * In-browser client-side image compressor for Spandan 4.0.
 * Automatically resizes heavy camera/phone photos (5MB - 15MB) to high-definition
 * WebP/JPEG (~100KB - 200KB) before uploading to Supabase Storage.
 * 
 * Protects Supabase Free Tier limits:
 * - 1 GB storage can hold 7,000+ optimized photos (instead of just 150).
 * - 2 GB egress bandwidth is saved by 98%.
 */

export interface CompressionResult {
  file: File;
  originalSize: number;
  compressedSize: number;
  percentSaved: number;
  width: number;
  height: number;
}

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 (default 0.8)
  mimeType?: "image/webp" | "image/jpeg";
}

export async function compressImageFile(
  file: File,
  options: CompressOptions = {}
): Promise<CompressionResult> {
  const {
    maxWidth = 1440,
    maxHeight = 1440,
    quality = 0.8,
    mimeType = "image/webp",
  } = options;

  // If already tiny WebP (< 150KB), no need to re-encode
  if (file.type === "image/webp" && file.size < 150 * 1024) {
    return {
      file,
      originalSize: file.size,
      compressedSize: file.size,
      percentSaved: 0,
      width: 0,
      height: 0,
    };
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Failed to decode image data"));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Calculate aspect-ratio preserved dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return reject(new Error("HTML5 Canvas 2D context unavailable"));
        }

        // High quality bicubic interpolation
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        // Check if browser supports WebP canvas export, fallback to JPEG
        let targetMime = mimeType;
        const testData = canvas.toDataURL("image/webp");
        if (!testData.startsWith("data:image/webp")) {
          targetMime = "image/jpeg";
        }

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error("Failed to compress image to blob"));
            }

            const cleanBaseName = file.name
              .replace(/\.[^/.]+$/, "")
              .toLowerCase()
              .replace(/[^a-z0-9_-]/g, "-")
              .slice(0, 40);

            const ext = targetMime === "image/webp" ? "webp" : "jpg";
            const compressedFile = new File([blob], `${cleanBaseName}.${ext}`, {
              type: targetMime,
              lastModified: Date.now(),
            });

            const originalSize = file.size;
            const compressedSize = compressedFile.size;
            const percentSaved = Math.max(
              0,
              Math.round(((originalSize - compressedSize) / originalSize) * 100)
            );

            resolve({
              file: compressedFile,
              originalSize,
              compressedSize,
              percentSaved,
              width,
              height,
            });
          },
          targetMime,
          quality
        );
      };

      img.src = reader.result as string;
    };

    reader.readAsDataURL(file);
  });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
