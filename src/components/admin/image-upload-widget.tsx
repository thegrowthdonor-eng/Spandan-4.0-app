"use client";

import { useState, useRef } from "react";
import { compressImageFile, formatFileSize } from "@/lib/image-compressor";

interface ImageUploadWidgetProps {
  folder?: string;
  onUploadSuccess: (url: string) => void;
  label?: string;
}

export function ImageUploadWidget({
  folder = "posters",
  onUploadSuccess,
  label = "Upload Image (Auto-Compress to WebP)",
}: ImageUploadWidgetProps) {
  const [compressing, setCompressing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const rawFile = e.target.files?.[0];
    if (!rawFile) return;

    setErrorText(null);
    setStatusText(null);

    try {
      // 1. Client-side auto-compression
      setCompressing(true);
      setStatusText(`Compressing ${formatFileSize(rawFile.size)}…`);

      const compression = await compressImageFile(rawFile, {
        maxWidth: 1440,
        maxHeight: 1440,
        quality: 0.8,
        mimeType: "image/webp",
      });

      const savingsMsg = compression.percentSaved > 0
        ? `Compressed ${formatFileSize(compression.originalSize)} ➔ ${formatFileSize(compression.compressedSize)} (${compression.percentSaved}% saved!)`
        : `Ready: ${formatFileSize(compression.compressedSize)}`;

      setStatusText(savingsMsg);
      setCompressing(false);

      // 2. Upload to Supabase Storage via /api/admin/upload
      setUploading(true);
      const formData = new FormData();
      formData.append("file", compression.file);
      formData.append("folder", folder);

      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });

      const json = await res.json() as { ok?: boolean; url?: string; error?: string };

      if (!res.ok || !json.ok || !json.url) {
        throw new Error(json.error || "Failed to upload image to storage");
      }

      setStatusText(`✓ ${savingsMsg}`);
      onUploadSuccess(json.url);
    } catch (err) {
      setCompressing(false);
      setUploading(false);
      setErrorText(err instanceof Error ? err.message : "Image processing failed");
    } finally {
      setCompressing(false);
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const busy = compressing || uploading;

  return (
    <div className="image-upload-widget">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
        disabled={busy}
      />

      <div className="upload-controls-row">
        <button
          type="button"
          className="upload-trigger-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <>
              <span className="upload-spinner" />
              {compressing ? "Optimizing photo…" : "Uploading to CDN…"}
            </>
          ) : (
            <>
              <span className="upload-icon" aria-hidden="true">📸</span>
              <span>{label}</span>
            </>
          )}
        </button>

        <span className="upload-hint">
          Any size photo (iPhone / Android) auto-compresses to lightweight WebP (~120KB)
        </span>
      </div>

      {statusText && (
        <div className="upload-status-chip success">
          <span>{statusText}</span>
        </div>
      )}

      {errorText && (
        <div className="upload-status-chip error">
          <span>⚠️ {errorText}</span>
        </div>
      )}

      <style jsx>{`
        .image-upload-widget {
          margin: 10px 0 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .upload-controls-row {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        .upload-trigger-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, #2b1d0c 0%, #171109 100%);
          color: #f7dfa5;
          border: 1px solid rgba(229, 178, 64, 0.4);
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 0.86rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .upload-trigger-btn:hover:not(:disabled) {
          border-color: #e5b240;
          background: #382710;
          transform: translateY(-1px);
        }
        .upload-trigger-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .upload-icon {
          font-size: 1rem;
        }
        .upload-hint {
          font-size: 0.78rem;
          color: #a89f91;
        }
        .upload-status-chip {
          display: inline-flex;
          align-items: center;
          padding: 5px 12px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 500;
          width: fit-content;
        }
        .upload-status-chip.success {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.25);
        }
        .upload-status-chip.error {
          background: rgba(239, 68, 68, 0.12);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.25);
        }
        .upload-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(247, 223, 165, 0.3);
          border-top-color: #f7dfa5;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
