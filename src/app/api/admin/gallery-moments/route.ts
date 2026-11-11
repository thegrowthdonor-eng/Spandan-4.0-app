import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { galleryMomentIdPattern, isWebpUpload, validateGalleryMomentDetails } from "@/lib/gallery";
import { hasSupabaseConfiguration } from "@/server/env";
import { archiveMedia,storePublicMedia } from "@/server/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "no-store" };

function invalidOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== new URL(request.url).origin;
}

async function requestClient() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => store.getAll(), setAll: () => undefined } },
  );
}

function denied() {
  return NextResponse.json({ error: "Only an active 2023 Main Admin or Event Coordinator can manage gallery moments." }, { status: 403, headers: noStore });
}

export async function POST(request: Request) {
  if (invalidOrigin(request)) return NextResponse.json({ error: "Invalid upload request." }, { status: 403, headers: noStore });
  if (!hasSupabaseConfiguration()) return NextResponse.json({ error: "Gallery storage is unavailable." }, { status: 503, headers: noStore });

  const client = await requestClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user || (await client.rpc("can_manage_gallery_moments")).data !== true) return denied();

  let formData: FormData;
  try { formData = await request.formData(); } catch { return NextResponse.json({ error: "Check the moment and try again." }, { status: 400, headers: noStore }); }
  const file = formData.get("file");
  const details = validateGalleryMomentDetails({
    eventId: String(formData.get("eventId") ?? ""),
    caption: String(formData.get("caption") ?? ""),
    occurredAt: String(formData.get("occurredAt") ?? ""),
  });
  if (!(file instanceof File) || !details) return NextResponse.json({ error: "Choose a photo, event, caption and valid moment time." }, { status: 400, headers: noStore });

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebpUpload(bytes, file.type, file.size)) return NextResponse.json({ error: "Upload a valid compressed WebP image no larger than 600 KB." }, { status: 400, headers: noStore });

  const storagePath = `gallery/${auth.user.id}/${crypto.randomUUID()}.webp`;
  let media;
  try { media=await storePublicMedia({bytes,mime:file.type,key:storagePath,ownerId:auth.user.id,eventId:details.eventId,purpose:"gallery"}); }
  catch { return NextResponse.json({error:"Photo validation or storage failed. Please try again."},{status:503,headers:noStore}); }

  const { data: momentId, error: createError } = await client.rpc("create_gallery_moment", {
    p_event_id: details.eventId,
    p_caption: details.caption,
    p_storage_path: media.key,
    p_occurred_at: details.occurredAt,
  });
  if (createError) {
    await archiveMedia([media.key]);
    const status = createError.code === "42501" ? 403 : createError.code === "22023" ? 400 : 503;
    return NextResponse.json({ error: status === 403 ? "You are not authorised to publish this moment." : "Unable to publish this moment." }, { status, headers: noStore });
  }
  return NextResponse.json({ ok: true, id: momentId }, { headers: noStore });
}

export async function PATCH(request: Request) {
  if (invalidOrigin(request)) return NextResponse.json({ error: "Invalid update request." }, { status: 403, headers: noStore });
  const client = await requestClient();
  if (!(await client.auth.getUser()).data.user) return denied();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Check the moment and try again." }, { status: 400, headers: noStore }); }
  const momentId = String(body.momentId ?? "");
  const details = validateGalleryMomentDetails({ eventId: String(body.eventId ?? ""), caption: String(body.caption ?? ""), occurredAt: String(body.occurredAt ?? "") });
  if (!galleryMomentIdPattern.test(momentId) || !details) return NextResponse.json({ error: "Provide valid moment details." }, { status: 400, headers: noStore });
  const { error } = await client.rpc("update_gallery_moment", { p_moment_id: momentId, p_event_id: details.eventId, p_caption: details.caption, p_occurred_at: details.occurredAt });
  if (error) return NextResponse.json({ error: error.code === "42501" ? "You cannot edit this moment." : "Unable to update this moment." }, { status: error.code === "42501" ? 403 : 400, headers: noStore });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: Request) {
  if (invalidOrigin(request)) return NextResponse.json({ error: "Invalid delete request." }, { status: 403, headers: noStore });
  const client = await requestClient();
  if (!(await client.auth.getUser()).data.user) return denied();
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; } catch { return NextResponse.json({ error: "Choose a valid moment." }, { status: 400, headers: noStore }); }
  const momentId = String(body.momentId ?? "");
  if (!galleryMomentIdPattern.test(momentId)) return NextResponse.json({ error: "Choose a valid moment." }, { status: 400, headers: noStore });
  const { data: storagePath, error } = await client.rpc("archive_gallery_moment", { p_moment_id: momentId });
  if (error || typeof storagePath !== "string") return NextResponse.json({ error: error?.code === "42501" ? "You cannot delete this moment." : "Unable to delete this moment." }, { status: error?.code === "42501" ? 403 : 400, headers: noStore });
  const { error: removeError } = await archiveMedia([storagePath]);
  return NextResponse.json({ ok: true, cleanupPending: Boolean(removeError) }, { headers: noStore });
}
