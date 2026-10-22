import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@/server/supabase/admin";
import { hasSupabaseConfiguration } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };
const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 403, headers: noStoreHeaders });
  }

  if (!hasSupabaseConfiguration()) {
    return NextResponse.json({ error: "Storage service not configured" }, { status: 503, headers: noStoreHeaders });
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
    return NextResponse.json({ error: "Unauthorized. Please sign in as an organiser." }, { status: 401, headers: noStoreHeaders });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "general";
    const eventId = formData.get("eventId");

    if (typeof eventId !== "string" || !eventIdPattern.test(eventId)) {
      return NextResponse.json({ error: "A valid event is required." }, { status: 400, headers: noStoreHeaders });
    }

    const { data: canManageEvent, error: permissionError } = await authClient.rpc("can_manage_event", {
      p_event_id: eventId,
    });
    if (permissionError || canManageEvent !== true) {
      return NextResponse.json(
        { error: "You are not authorised to upload media for this event." },
        { status: 403, headers: noStoreHeaders }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400, headers: noStoreHeaders });
    }

    // Safety checks: allow only images up to 5 MB
    const allowedTypes = ["image/webp", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Only WebP, JPEG, and PNG images are supported." },
        { status: 400, headers: noStoreHeaders }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image file exceeds 5MB limit. Please compress before upload." },
        { status: 400, headers: noStoreHeaders }
      );
    }

    // Sanitize folder & file name
    const safeFolder = folder === "podiums" ? "podiums" : "posters";
    const timestamp = Date.now();
    const cleanName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9_-]/gi, "-")
      .toLowerCase()
      .slice(0, 32);

    const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
    const storagePath = `${safeFolder}/${eventId}/${timestamp}-${cleanName || "image"}.${ext}`;

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
        { status: 500, headers: noStoreHeaders }
      );
    }

    const { data: urlData } = admin.storage.from("fest-media").getPublicUrl(storagePath);

    return NextResponse.json({
      ok: true,
      url: urlData.publicUrl,
      path: storagePath,
      size: file.size,
      mimeType: file.type,
    }, { headers: noStoreHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500, headers: noStoreHeaders });
  }
}
