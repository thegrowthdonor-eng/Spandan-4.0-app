import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/server/supabase/admin";
import { hasSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSupabaseConfiguration()) {
    return NextResponse.json({ error: "Storage service not configured" }, { status: 503 });
  }

  // 1. Verify caller has admin session
  const store = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: () => undefined,
      },
    }
  );

  const { data: auth } = await authClient.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized. Please sign in as an admin." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "general";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Safety checks: allow only images up to 5 MB
    const allowedTypes = ["image/webp", "image/jpeg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only WebP, JPEG, and PNG images are supported." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image file exceeds 5MB limit. Please compress before upload." },
        { status: 400 }
      );
    }

    // Sanitize folder & file name
    const safeFolder = folder.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "media";
    const timestamp = Date.now();
    const cleanName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9_-]/gi, "-")
      .toLowerCase()
      .slice(0, 32);

    const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
    const storagePath = `${safeFolder}/${timestamp}-${cleanName}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("fest-media")
      .upload(storagePath, buffer, {
        contentType: file.type,
        cacheControl: "31536000", // 1 year immutable CDN cache — student devices never re-fetch
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from("fest-media").getPublicUrl(storagePath);

    return NextResponse.json({
      ok: true,
      url: urlData.publicUrl,
      path: storagePath,
      size: file.size,
      mimeType: file.type,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
