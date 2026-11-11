import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { archiveMedia,storePublicMedia } from "@/server/media/storage";
import { hasSupabaseConfiguration } from "@/server/env";
import { validPosterUpload } from "@/lib/poster-image";

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

    if (!["posters", "podiums", "merchandise", "sponsors"].includes(folder)) {
      return NextResponse.json({ error: "Choose poster, podium, merchandise, or sponsor media." }, { status: 400, headers: noStoreHeaders });
    }

    if (["merchandise", "sponsors"].includes(folder)) {
      const { data: isAdmin, error: adminErr } = await authClient.rpc("is_main_admin");
      if (adminErr || isAdmin !== true) {
        return NextResponse.json(
          { error: "Only Main Admins can upload merchandise and sponsor media." },
          { status: 403, headers: noStoreHeaders }
        );
      }
    } else {
      if (typeof eventId !== "string" || !eventIdPattern.test(eventId)) {
        return NextResponse.json({ error: "A valid event is required." }, { status: 400, headers: noStoreHeaders });
      }
      const { data: canManageEvent, error: permissionError } = await authClient.rpc(folder === "posters" ? "can_edit_event_definition" : "can_manage_event", {
        p_event_id: eventId,
      });
      if (permissionError || canManageEvent !== true) {
        return NextResponse.json(
          { error: "You are not authorised to upload media for this event." },
          { status: 403, headers: noStoreHeaders }
        );
      }
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
    const safeFolder = folder === "podiums" ? "podiums" : folder === "merchandise" ? "merchandise" : folder === "sponsors" ? "sponsors" : "posters";
    const timestamp = crypto.randomUUID();
    const cleanName = file.name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-z0-9_-]/gi, "-")
      .toLowerCase()
      .slice(0, 32);

    const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
    const storagePath = ["merchandise", "sponsors"].includes(safeFolder)
      ? `${safeFolder}/${timestamp}-${cleanName || "image"}.${ext}`
      : `${safeFolder}/${eventId}/${timestamp}-${cleanName || "image"}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (folder === "posters" && !validPosterUpload(buffer, file.type, file.size)) return NextResponse.json({ error:"Posters must be optimized WebP files under 500 KB. Choose the photo again to compress it." },{status:400,headers:noStoreHeaders});

    const media = await storePublicMedia({bytes:buffer,mime:file.type,key:storagePath,ownerId:auth.user.id,eventId:typeof eventId === "string" && eventIdPattern.test(eventId) ? eventId : null,purpose:safeFolder});
    if (folder === "posters" && formData.get("attach") === "true") {
      const attached = await authClient.rpc("attach_event_poster", { p_event_id:eventId, p_path:media.key, p_url:media.publicUrl });
      if (attached.error) {
        const cleanup = await archiveMedia([media.key]);
        if (cleanup.error) console.error("Poster attachment cleanup failed",storagePath);
        return NextResponse.json({ error:"Poster could not be attached. Your previous poster is unchanged; retry the upload." },{status:503,headers:noStoreHeaders});
      }
    }

    return NextResponse.json({
      ok: true,
      url: media.publicUrl,
      path: media.key,
      provider: media.provider,
      size: file.size,
      mimeType: file.type,
    }, { headers: noStoreHeaders });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: msg }, { status: 500, headers: noStoreHeaders });
  }
}
