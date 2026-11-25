import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { isWebpUpload, maxGalleryImageBytes, validateGalleryCaption } from "@/lib/gallery";
import { hasSupabaseConfiguration } from "@/server/env";
import { archiveMedia, storePublicMedia } from "@/server/media/storage";
import { invalidatePublicTags, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createAdminClient } from "@/server/supabase/admin";
import { createRequestClient } from "@/server/supabase/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

function failure(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return failure("Invalid upload request.", 403);
  if (!hasSupabaseConfiguration()) return failure("Gallery storage is unavailable.", 503);

  const client = await createRequestClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return failure("Sign in to post.", 401);
  const denied = "Only active MBBS 2023 students can post to the Gallery.";
  const permission = await client.rpc("can_publish_student_gallery_post");
  if (permission.error) return failure("Unable to check posting access. Please retry.", 503);
  if (permission.data !== true) return failure(denied, 403);

  if (Number(request.headers.get("content-length")) > maxGalleryImageBytes + 16384) return failure("Choose a photo no larger than 600 KB after compression.", 413);
  let form: FormData;
  try { form = await request.formData(); }
  catch { return failure("Choose a photo and enter a caption.", 400); }
  const file = form.get("file");
  const caption = validateGalleryCaption(form.get("caption"));
  if (!(file instanceof File) || !caption) return failure("Choose a photo and enter a caption of up to 1,000 characters.", 400);
  if (file.size > maxGalleryImageBytes) return failure("Choose a photo no larger than 600 KB after compression.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebpUpload(bytes, file.type, file.size)) return failure("Choose a valid photo.", 400);

  const admin = createAdminClient();
  const key = `gallery/${auth.user.id}/${crypto.randomUUID()}.webp`;
  try {
    await storePublicMedia({ bytes, mime: file.type, key, ownerId: auth.user.id, eventId: null, purpose: "gallery" });
  } catch {
    return failure("Photo validation or storage failed. Please try again.", 503);
  }
  const { data, error } = await admin.rpc("publish_student_gallery_post", {
    p_profile_id: auth.user.id,
    p_caption: caption,
    p_storage_path: key,
  });
  let id = data;
  if (error) {
    const saved = await admin.from("gallery_moments").select("id").eq("storage_path", key).maybeSingle();
    if (!saved.data) {
      if (!saved.error) await archiveMedia([key]);
      return error.code === "42501" ? failure(denied, 403) : failure("Unable to save your post. Please try again.", 503);
    }
    id = saved.data.id;
  }
  invalidatePublicTags(PUBLIC_CACHE_TAGS.gallery);
  revalidatePath("/gallery");
  return NextResponse.json({ id }, { status: 201, headers });
}
